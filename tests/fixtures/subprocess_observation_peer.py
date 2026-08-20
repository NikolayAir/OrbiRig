"""Independent subprocess peer used by observation collection tests."""

import json
import sys
import time


def _read_command() -> dict[str, str]:
    raw_command = sys.stdin.buffer.read()

    try:
        command = json.loads(raw_command.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise SystemExit(64) from None

    if (
        type(command) is not dict
        or tuple(command) != ("command_type", "target_mode")
        or command["command_type"] != "SET_OPERATING_MODE"
        or command["target_mode"] not in ("NOMINAL", "SAFE")
    ):
        raise SystemExit(64)

    expected_command = (json.dumps(command, separators=(",", ":")) + "\n").encode(
        "utf-8"
    )

    if raw_command != expected_command:
        raise SystemExit(64)

    return command


def _observation_document(
    command: dict[str, str],
    *,
    telemetry_mode: str | None = None,
) -> dict[str, object]:
    target_mode = command["target_mode"]

    return {
        "evidence_format_version": 1,
        "command": command,
        "pre_state": {"operating_mode": "NOMINAL"},
        "acknowledgement": {"accepted": True},
        "post_state": {"operating_mode": target_mode},
        "telemetry": {
            "operating_mode": telemetry_mode or target_mode,
        },
    }


def _write_json(document: object) -> None:
    serialized = json.dumps(document, separators=(",", ":")) + "\n"
    sys.stdout.buffer.write(serialized.encode("utf-8"))


def main() -> int:
    if not sys.flags.isolated or not sys.flags.no_site:
        return 64

    mode = sys.argv[1]
    command = _read_command()

    if mode == "timeout":
        _write_json(_observation_document(command))
        sys.stdout.buffer.flush()
        time.sleep(60)

    if mode == "invalid-utf8":
        sys.stdout.buffer.write(b"\xff")
        return 0

    if mode == "malformed":
        sys.stdout.buffer.write(b'{"evidence_format_version":1')
        return 0

    if mode == "structurally-invalid":
        document = _observation_document(command)
        document["scenario_id"] = "nominal_to_safe_mode"
        _write_json(document)
        return 0

    if mode == "command-mismatch":
        mismatched_command = {
            "command_type": "SET_OPERATING_MODE",
            "target_mode": ("NOMINAL" if command["target_mode"] == "SAFE" else "SAFE"),
        }
        _write_json(_observation_document(mismatched_command))
        return 0

    if mode == "telemetry-mismatch":
        _write_json(
            _observation_document(
                command,
                telemetry_mode="NOMINAL",
            ),
        )
        return 0

    if mode == "non-zero":
        _write_json(_observation_document(command))
        return 7

    if mode == "non-zero-invalid-utf8":
        sys.stdout.buffer.write(b"\xff")
        return 7

    if mode == "stderr-diagnostic":
        sys.stderr.write("peer diagnostic\n")
        _write_json(_observation_document(command))
        return 0

    if mode == "stdout-contaminated":
        _write_json(_observation_document(command))
        sys.stdout.buffer.write(b"peer diagnostic\n")
        return 0

    if mode == "pass":
        _write_json(_observation_document(command))
        return 0

    return 64


if __name__ == "__main__":
    raise SystemExit(main())
