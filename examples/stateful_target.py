"""A non-operational test target with operating-mode state shared between launches.

This program implements command behaviour independently of OrbiRig. It reads
1 command from stdin. A successful run returns observation-evidence v1 on stdout.
"""

import argparse
import json
import os
import stat
import sys
import tempfile
from pathlib import Path


def _unique_fields(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for name, value in pairs:
        if name in result:
            raise ValueError(f"repeated JSON field: {name!r}")
        result[name] = value
    return result


def _read_json(data: bytes, source: str) -> object:
    try:
        return json.loads(data.decode("utf-8"), object_pairs_hook=_unique_fields)
    except (ValueError, RecursionError) as exc:
        raise ValueError(
            f"{source} must be UTF-8 JSON without repeated field names",
        ) from exc


def _read_command(data: bytes) -> dict[str, str]:
    document = _read_json(data, "command")
    if not isinstance(document, dict) or set(document) != {"command_type", "target_mode"}:
        raise ValueError("command must contain only command_type and target_mode")
    if document["command_type"] != "SET_OPERATING_MODE":
        raise ValueError("command_type must be SET_OPERATING_MODE")
    mode = document["target_mode"]
    if not isinstance(mode, str) or mode not in ("NOMINAL", "SAFE"):
        raise ValueError("target_mode must be NOMINAL or SAFE")
    return {"command_type": "SET_OPERATING_MODE", "target_mode": mode}


def _read_mode(state_file: Path) -> str:
    # Saving replaces the state file itself. Through a symbolic link, the link
    # would become a separate file while its original target kept the old mode.
    status = os.lstat(state_file)
    if not stat.S_ISREG(status.st_mode):
        raise ValueError("state file must be a regular file, not a link or directory")
    # Atomic replacement would split hard-linked names into different states.
    if status.st_nlink != 1:
        raise ValueError("state file must have exactly 1 hard link")
    document = _read_json(state_file.read_bytes(), "stored state")
    if not isinstance(document, dict) or set(document) != {"operating_mode"}:
        raise ValueError("stored state must contain only operating_mode")
    mode = document["operating_mode"]
    if not isinstance(mode, str) or mode not in ("NOMINAL", "SAFE"):
        raise ValueError("stored operating_mode must be NOMINAL or SAFE")
    return mode


def _save_mode(state_file: Path, mode: str) -> None:
    # Write beside the state file, then replace it in 1 operation. A failed
    # write or replacement must leave the previous state intact, not truncated.
    temporary: Path | None = None
    try:
        # Keep the prefix short: the state filename may already be close to
        # the file system's length limit, and tempfile adds a random suffix.
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", dir=state_file.parent,
            prefix=".orbirig-state-", delete=False,
        ) as stream:
            temporary = Path(stream.name)
            stream.write(json.dumps({"operating_mode": mode}) + "\n")
        # Close the temporary file first so replacement also works on Windows.
        os.replace(temporary, state_file)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Handle 1 operating-mode command using an existing state file.",
        allow_abbrev=False,
    )
    parser.add_argument(
        "--state-file", type=Path, required=True,
        help="path to an existing JSON state file containing operating_mode",
    )
    parser.add_argument(
        "--stale-telemetry", action="store_true",
        help="report the pre-command mode as telemetry while persisting the actual change",
    )
    parser.add_argument(
        "--fail-after-commit", action="store_true",
        help="exit with status 3 after saving an accepted change, without an observation; ignored on rejection",
    )
    arguments = parser.parse_args()

    try:
        # Validate the complete command and existing state before writing anything.
        # A missing state file is an error, rather than an implicit reset.
        command = _read_command(sys.stdin.buffer.read())
        pre_mode = _read_mode(arguments.state_file)
        accepted = command["target_mode"] != pre_mode
        post_mode = command["target_mode"] if accepted else pre_mode
        telemetry_mode = pre_mode if arguments.stale_telemetry else post_mode
        observation = {
            "evidence_format_version": 1,
            "command": command,
            "pre_state": {"operating_mode": pre_mode},
            "acknowledgement": {"accepted": accepted},
            "post_state": {"operating_mode": post_mode},
            "telemetry": {"operating_mode": telemetry_mode},
        }
        response = (json.dumps(observation) + "\n").encode("utf-8")
        if accepted:
            _save_mode(arguments.state_file, post_mode)
    except (OSError, ValueError) as exc:
        print(f"stateful target: {exc}", file=sys.stderr)
        return 2

    # Accepted changes are committed before reporting them. A later delivery
    # error does not establish rollback or a verification FAIL.
    if accepted and arguments.fail_after_commit:
        print("stateful target: simulated response failure after state commit", file=sys.stderr)
        return 3
    sys.stdout.buffer.write(response)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
