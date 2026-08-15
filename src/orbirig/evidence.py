"""Versioned JSON evidence for command execution observations and records."""

import json
from datetime import datetime, timedelta

from orbirig.models import (
    Acknowledgement,
    CommandExecutionObservation,
    CommandType,
    ExecutionOutcome,
    InvariantId,
    InvariantResult,
    InvariantValue,
    OperatingMode,
    ScenarioId,
    SetOperatingModeCommand,
    SpacecraftState,
    TelemetrySnapshot,
    VerifiedExecutionRecord,
)
from orbirig.verification import build_verified_execution_record


EXECUTION_EVIDENCE_FORMAT_VERSION = 1
VERIFIED_EXECUTION_SCHEMA_VERSION = 1

_OBSERVATION_FIELDS = (
    "command",
    "pre_state",
    "acknowledgement",
    "post_state",
    "telemetry",
)
_ACKNOWLEDGEMENT_INVARIANT_IDS = frozenset(
    (
        InvariantId.ACKNOWLEDGEMENT_IS_ACCEPTED,
        InvariantId.ACKNOWLEDGEMENT_IS_REJECTED,
    ),
)


def _reject_duplicate_object_members(
    pairs: list[tuple[str, object]],
) -> dict[str, object]:
    """Construct one JSON object while rejecting duplicate member names."""

    document = {}

    for name, value in pairs:
        if name in document:
            raise ValueError("duplicate JSON object member name")

        document[name] = value

    return document


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


def _require_array(
    value: object,
    *,
    path: str,
) -> list[object]:
    """Validate one JSON array."""

    if type(value) is not list:
        raise ValueError(f"{path} must be a JSON array")

    return value


def _nested_path(
    parent: str,
    child: str,
) -> str:
    """Return the dot-separated path for a nested JSON field."""

    return f"{parent}.{child}" if parent else child


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


def _parse_scenario_id(
    value: object,
    *,
    path: str,
) -> ScenarioId:
    """Parse one supported verification scenario identifier."""

    serialized_scenario_id = _require_string(value, path=path)

    try:
        return ScenarioId(serialized_scenario_id)
    except ValueError:
        raise ValueError(
            f"{path} has unsupported value: {serialized_scenario_id!r}",
        ) from None


def _parse_invariant_id(
    value: object,
    *,
    path: str,
) -> InvariantId:
    """Parse one supported invariant identifier."""

    serialized_invariant_id = _require_string(value, path=path)

    try:
        return InvariantId(serialized_invariant_id)
    except ValueError:
        raise ValueError(
            f"{path} has unsupported value: {serialized_invariant_id!r}",
        ) from None


def _parse_execution_outcome(
    value: object,
    *,
    path: str,
) -> ExecutionOutcome:
    """Parse one supported derived execution outcome."""

    serialized_outcome = _require_string(value, path=path)

    try:
        return ExecutionOutcome(serialized_outcome)
    except ValueError:
        raise ValueError(
            f"{path} has unsupported value: {serialized_outcome!r}",
        ) from None


def _parse_utc_datetime(
    value: object,
    *,
    path: str,
) -> datetime:
    """Parse one timezone-aware UTC ISO 8601 timestamp."""

    serialized_timestamp = _require_string(value, path=path)

    try:
        timestamp = datetime.fromisoformat(serialized_timestamp)
    except ValueError:
        raise ValueError(
            f"{path} must be an ISO 8601 timestamp",
        ) from None

    if (
        timestamp.tzinfo is None
        or timestamp.utcoffset() != timedelta(0)
    ):
        raise ValueError(f"{path} must be timezone-aware UTC")

    return timestamp


def _parse_observation_document(
    document: object,
    *,
    path: str,
) -> CommandExecutionObservation:
    """Reconstruct an observation from an exact JSON object."""

    root = _require_object(
        document,
        path=path,
        expected_fields=_OBSERVATION_FIELDS,
    )

    command_path = _nested_path(path, "command")
    command_document = _require_object(
        root["command"],
        path=command_path,
        expected_fields=(
            "command_type",
            "target_mode",
        ),
    )
    command_type = _require_string(
        command_document["command_type"],
        path=_nested_path(command_path, "command_type"),
    )

    # Keep the v1 wire contract closed if CommandType gains new members later.
    if command_type != CommandType.SET_OPERATING_MODE.value:
        raise ValueError(
            f"{_nested_path(command_path, 'command_type')} "
            "has unsupported value: "
            f"{command_type!r}",
        )

    pre_state_path = _nested_path(path, "pre_state")
    acknowledgement_path = _nested_path(path, "acknowledgement")
    post_state_path = _nested_path(path, "post_state")
    telemetry_path = _nested_path(path, "telemetry")
    pre_state_document = _require_object(
        root["pre_state"],
        path=pre_state_path,
        expected_fields=("operating_mode",),
    )
    acknowledgement_document = _require_object(
        root["acknowledgement"],
        path=acknowledgement_path,
        expected_fields=("accepted",),
    )
    post_state_document = _require_object(
        root["post_state"],
        path=post_state_path,
        expected_fields=("operating_mode",),
    )
    telemetry_document = _require_object(
        root["telemetry"],
        path=telemetry_path,
        expected_fields=("operating_mode",),
    )

    return CommandExecutionObservation(
        command=SetOperatingModeCommand(
            target_mode=_parse_operating_mode(
                command_document["target_mode"],
                path=_nested_path(command_path, "target_mode"),
            ),
        ),
        pre_state=SpacecraftState(
            operating_mode=_parse_operating_mode(
                pre_state_document["operating_mode"],
                path=_nested_path(pre_state_path, "operating_mode"),
            ),
        ),
        acknowledgement=Acknowledgement(
            accepted=_require_boolean(
                acknowledgement_document["accepted"],
                path=_nested_path(acknowledgement_path, "accepted"),
            ),
        ),
        post_state=SpacecraftState(
            operating_mode=_parse_operating_mode(
                post_state_document["operating_mode"],
                path=_nested_path(post_state_path, "operating_mode"),
            ),
        ),
        telemetry=TelemetrySnapshot(
            operating_mode=_parse_operating_mode(
                telemetry_document["operating_mode"],
                path=_nested_path(telemetry_path, "operating_mode"),
            ),
        ),
    )


def deserialize_execution_evidence(
    serialized: str,
) -> CommandExecutionObservation:
    """Reconstruct an observation from strict versioned JSON evidence."""

    try:
        document = json.loads(
            serialized,
            object_pairs_hook=_reject_duplicate_object_members,
        )
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

    return _parse_observation_document(
        {
            field_name: root[field_name]
            for field_name in _OBSERVATION_FIELDS
        },
        path="",
    )


def _parse_invariant_value(
    value: object,
    *,
    path: str,
    invariant_id: InvariantId,
) -> InvariantValue:
    """Parse the v1 value type required by one invariant."""

    if invariant_id in _ACKNOWLEDGEMENT_INVARIANT_IDS:
        return _require_boolean(value, path=path)

    return _parse_operating_mode(value, path=path)


def _parse_invariant_results(
    value: object,
    *,
    path: str,
) -> tuple[InvariantResult, ...]:
    """Parse ordered invariant-result evidence without trusting it."""

    serialized_results = _require_array(value, path=path)
    results = []

    for index, serialized_result in enumerate(serialized_results):
        result_path = f"{path}[{index}]"
        result_document = _require_object(
            serialized_result,
            path=result_path,
            expected_fields=(
                "invariant_id",
                "passed",
                "expected",
                "actual",
            ),
        )
        invariant_id = _parse_invariant_id(
            result_document["invariant_id"],
            path=f"{result_path}.invariant_id",
        )
        results.append(
            InvariantResult(
                invariant_id=invariant_id,
                passed=_require_boolean(
                    result_document["passed"],
                    path=f"{result_path}.passed",
                ),
                expected=_parse_invariant_value(
                    result_document["expected"],
                    path=f"{result_path}.expected",
                    invariant_id=invariant_id,
                ),
                actual=_parse_invariant_value(
                    result_document["actual"],
                    path=f"{result_path}.actual",
                    invariant_id=invariant_id,
                ),
            ),
        )

    return tuple(results)


def deserialize_verified_execution_evidence(
    serialized: str,
) -> VerifiedExecutionRecord:
    """Reconstruct canonically consistent verified-execution evidence."""

    try:
        document = json.loads(
            serialized,
            object_pairs_hook=_reject_duplicate_object_members,
        )
    except json.JSONDecodeError as exc:
        raise ValueError("invalid verified execution evidence JSON") from exc

    root = _require_object(
        document,
        path="verified execution evidence",
        expected_fields=(
            "schema_version",
            "execution",
            "observation",
            "invariant_results",
            "outcome",
        ),
    )
    schema_version = root["schema_version"]

    if type(schema_version) is not int:
        raise ValueError("schema_version must be an integer")

    if schema_version != VERIFIED_EXECUTION_SCHEMA_VERSION:
        raise ValueError(
            f"unsupported schema_version: {schema_version!r}",
        )

    execution_document = _require_object(
        root["execution"],
        path="execution",
        expected_fields=(
            "execution_id",
            "scenario_id",
            "executed_at",
        ),
    )
    execution_id = _require_string(
        execution_document["execution_id"],
        path="execution.execution_id",
    )
    scenario_id = _parse_scenario_id(
        execution_document["scenario_id"],
        path="execution.scenario_id",
    )
    executed_at = _parse_utc_datetime(
        execution_document["executed_at"],
        path="execution.executed_at",
    )
    observation = _parse_observation_document(
        root["observation"],
        path="observation",
    )
    persisted_results = _parse_invariant_results(
        root["invariant_results"],
        path="invariant_results",
    )
    persisted_outcome = _parse_execution_outcome(
        root["outcome"],
        path="outcome",
    )

    canonical_record = build_verified_execution_record(
        execution_id=execution_id,
        executed_at=executed_at,
        scenario_id=scenario_id,
        observation=observation,
    )

    if persisted_results != canonical_record.invariant_results:
        raise ValueError(
            "invariant_results do not match canonical verification results",
        )

    if persisted_outcome is not canonical_record.outcome:
        raise ValueError(
            "outcome does not match canonical verification result",
        )

    return canonical_record


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
