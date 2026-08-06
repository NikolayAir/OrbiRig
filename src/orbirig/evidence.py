"""Versioned JSON evidence for command execution observations."""

import json

from orbirig.models import (
    CommandExecutionObservation,
    InvariantValue,
    OperatingMode,
    VerifiedExecutionRecord,
)


EXECUTION_EVIDENCE_FORMAT_VERSION = 1
VERIFIED_EXECUTION_SCHEMA_VERSION = 1


def _observation_document(
    observation: CommandExecutionObservation,
) -> dict[str, object]:
    """Return the JSON-native representation of an observation."""

    return {
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


def serialize_execution_evidence(
    observation: CommandExecutionObservation,
) -> str:
    """Return deterministic versioned JSON for an execution observation."""

    document = {
        "evidence_format_version": EXECUTION_EVIDENCE_FORMAT_VERSION,
        **_observation_document(observation),
    }

    return json.dumps(document, indent=2) + "\n"


def _serialize_invariant_value(
    value: InvariantValue,
) -> bool | str:
    """Convert an invariant value to its JSON representation."""

    if isinstance(value, OperatingMode):
        return value.value

    return value


def serialize_verified_execution_evidence(
    record: VerifiedExecutionRecord,
) -> str:
    """Return deterministic versioned JSON for a verified execution."""

    document = {
        "schema_version": VERIFIED_EXECUTION_SCHEMA_VERSION,
        "execution": {
            "execution_id": record.execution_id,
            "scenario_id": record.scenario_id.value,
            "executed_at": record.executed_at.isoformat().replace(
                "+00:00",
                "Z",
            ),
        },
        "observation": _observation_document(record.observation),
        "invariant_results": [
            {
                "invariant_id": result.invariant_id.value,
                "passed": result.passed,
                "expected": _serialize_invariant_value(
                    result.expected,
                ),
                "actual": _serialize_invariant_value(
                    result.actual,
                ),
            }
            for result in record.invariant_results
        ],
        "outcome": record.outcome.value,
    }

    return json.dumps(document, indent=2) + "\n"
