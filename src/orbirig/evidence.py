"""Versioned JSON evidence for command execution observations."""

import json

from orbirig.models import (
    Acknowledgement,
    CommandExecutionObservation,
    CommandType,
    InvariantValue,
    OperatingMode,
    SetOperatingModeCommand,
    SpacecraftState,
    TelemetrySnapshot,
    VerifiedExecutionRecord,
)


EXECUTION_EVIDENCE_FORMAT_VERSION = 1
VERIFIED_EXECUTION_SCHEMA_VERSION = 1


def _require_object(
    value: object,
    *,
    path: str,
    expected_fields: tuple[str, ...],
) -> dict[str, object]:
    """Validate one JSON object against its exact expected fields."""

    if not isinstance(value, dict):
        raise ValueError(f"{path} must be a JSON object")

    actual_fields = set(value)
    expected = set(expected_fields)
    missing_fields = sorted(expected - actual_fields)
    unexpected_fields = sorted(actual_fields - expected)

    if missing_fields or unexpected_fields:
        details = []

        if missing_fields:
            details.append(
                f"missing fields: {', '.join(missing_fields)}",
            )

        if unexpected_fields:
            details.append(
                f"unexpected fields: {', '.join(unexpected_fields)}",
            )

        raise ValueError(
            f"{path} has invalid fields ({'; '.join(details)})",
        )

    return value


def _require_string(
    value: object,
    *,
    path: str,
) -> str:
    """Validate one JSON string value."""

    if type(value) is not str:
        raise ValueError(f"{path} must be a string")

    return value


def _require_boolean(
    value: object,
    *,
    path: str,
) -> bool:
    """Validate one JSON boolean value."""

    if type(value) is not bool:
        raise ValueError(f"{path} must be a boolean")

    return value


def _parse_operating_mode(
    value: object,
    *,
    path: str,
) -> OperatingMode:
    """Parse one supported operating-mode representation."""

    serialized_mode = _require_string(
        value,
        path=path,
    )

    try:
        return OperatingMode(serialized_mode)
    except ValueError:
        raise ValueError(
            f"{path} has unsupported value: {serialized_mode!r}",
        ) from None


def deserialize_execution_evidence(
    serialized: str,
) -> CommandExecutionObservation:
    """Reconstruct an observation from strict versioned JSON evidence."""

    try:
        document = json.loads(serialized)
    except json.JSONDecodeError as exc:
        raise ValueError("invalid observation evidence JSON") from exc

    root = _require_object(
        document,
        path="observation evidence",
        expected_fields=(
            "evidence_format_version",
            "command",
            "pre_state",
            "acknowledgement",
            "post_state",
            "telemetry",
        ),
    )

    version = root["evidence_format_version"]

    # Exact type checking rejects JSON booleans, which are Python int subclasses.
    if type(version) is not int:
        raise ValueError(
            "evidence_format_version must be an integer",
        )

    if version != EXECUTION_EVIDENCE_FORMAT_VERSION:
        raise ValueError(
            f"unsupported evidence_format_version: {version!r}",
        )

    command_document = _require_object(
        root["command"],
        path="command",
        expected_fields=(
            "command_type",
            "target_mode",
        ),
    )
    command_type = _require_string(
        command_document["command_type"],
        path="command.command_type",
    )

    # Keep the v1 wire contract closed if CommandType gains new members later.
    if command_type != CommandType.SET_OPERATING_MODE.value:
        raise ValueError(
            f"command.command_type has unsupported value: {command_type!r}",
        )

    pre_state_document = _require_object(
        root["pre_state"],
        path="pre_state",
        expected_fields=("operating_mode",),
    )
    acknowledgement_document = _require_object(
        root["acknowledgement"],
        path="acknowledgement",
        expected_fields=("accepted",),
    )
    post_state_document = _require_object(
        root["post_state"],
        path="post_state",
        expected_fields=("operating_mode",),
    )
    telemetry_document = _require_object(
        root["telemetry"],
        path="telemetry",
        expected_fields=("operating_mode",),
    )

    return CommandExecutionObservation(
        command=SetOperatingModeCommand(
            target_mode=_parse_operating_mode(
                command_document["target_mode"],
                path="command.target_mode",
            ),
        ),
        pre_state=SpacecraftState(
            operating_mode=_parse_operating_mode(
                pre_state_document["operating_mode"],
                path="pre_state.operating_mode",
            ),
        ),
        acknowledgement=Acknowledgement(
            accepted=_require_boolean(
                acknowledgement_document["accepted"],
                path="acknowledgement.accepted",
            ),
        ),
        post_state=SpacecraftState(
            operating_mode=_parse_operating_mode(
                post_state_document["operating_mode"],
                path="post_state.operating_mode",
            ),
        ),
        telemetry=TelemetrySnapshot(
            operating_mode=_parse_operating_mode(
                telemetry_document["operating_mode"],
                path="telemetry.operating_mode",
            ),
        ),
    )


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
