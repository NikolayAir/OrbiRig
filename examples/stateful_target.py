"""A non-operational test target with operating-mode state shared between launches.

This program implements command behaviour independently of OrbiRig. It reads
1 command from stdin and returns observation-evidence v1 on stdout.
"""

import argparse
import json
import os
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
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", dir=state_file.parent,
            prefix=f".{state_file.name}.", delete=False,
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

    # State is committed before reporting it. A later delivery error cannot
    # establish rollback; the collector must not turn that error into FAIL.
    sys.stdout.buffer.write(response)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
