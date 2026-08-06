"""Versioned JSON evidence for command execution observations."""

import json

from orbirig.models import CommandExecutionObservation


EXECUTION_EVIDENCE_FORMAT_VERSION = 1


def serialize_execution_evidence(
    observation: CommandExecutionObservation,
) -> str:
    """Return deterministic versioned JSON for an execution observation."""

    document = {
        "evidence_format_version": EXECUTION_EVIDENCE_FORMAT_VERSION,
        "command": {
            "command_type": observation.command.command_type.value,
            "target_mode": observation.command.target_mode.value,
        },
        "pre_state": {
            "operating_mode": observation.pre_state.operating_mode.value,
        },
        "acknowledgement": {
            "accepted": observation.acknowledgement.accepted,
        },
        "post_state": {
            "operating_mode": observation.post_state.operating_mode.value,
        },
        "telemetry": {
            "operating_mode": observation.telemetry.operating_mode.value,
        },
    }

    return json.dumps(document, indent=2) + "\n"
