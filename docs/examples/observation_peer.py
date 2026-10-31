"""Return a fixed NOMINAL-to-SAFE observation for the subprocess example."""

import json
import sys


def main() -> int:
    """Read the documented command and write 1 observation to stdout."""

    command = {
        "command_type": "SET_OPERATING_MODE",
        "target_mode": "SAFE",
    }
    command_bytes = (
        json.dumps(command, separators=(",", ":")) + "\n"
    ).encode("utf-8")

    if sys.stdin.buffer.read() != command_bytes:
        print("expected the compact SET_OPERATING_MODE command targeting SAFE", file=sys.stderr)
        return 2

    observation = {
        "evidence_format_version": 1,
        "command": command,
        "pre_state": {"operating_mode": "NOMINAL"},
        "acknowledgement": {"accepted": True},
        "post_state": {"operating_mode": "SAFE"},
        "telemetry": {"operating_mode": "SAFE"},
    }
    sys.stdout.buffer.write((json.dumps(observation) + "\n").encode("utf-8"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
