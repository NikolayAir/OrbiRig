"""Tests for strict verified-execution evidence deserialisation."""

from copy import deepcopy
from datetime import datetime, timezone
import json
import re

import pytest

from orbirig.evidence import (
    deserialize_verified_execution_evidence,
    serialize_verified_execution_evidence,
)
from orbirig.execution import build_verified_execution_record
from orbirig.models import (
    Acknowledgement,
    CommandExecutionObservation,
    ExecutionOutcome,
    OperatingMode,
    ScenarioId,
    SetOperatingModeCommand,
    SpacecraftState,
    TelemetrySnapshot,
)


EXECUTED_AT = datetime(2026, 8, 15, 12, 0, tzinfo=timezone.utc)


def _valid_document() -> dict[str, object]:
    """Return independently constructed valid schema-v1 evidence."""

    return {
        "schema_version": 1,
        "execution": {
            "execution_id": "manual-001",
            "scenario_id": "nominal_to_safe_mode",
            "executed_at": "2026-08-15T12:00:00Z",
        },
        "observation": {
            "command": {
                "command_type": "SET_OPERATING_MODE",
                "target_mode": "SAFE",
            },
            "pre_state": {"operating_mode": "NOMINAL"},
            "acknowledgement": {"accepted": True},
            "post_state": {"operating_mode": "SAFE"},
            "telemetry": {"operating_mode": "SAFE"},
        },
        "invariant_results": [
            {
                "invariant_id": "pre_state_matches_expected",
                "passed": True,
                "expected": "NOMINAL",
                "actual": "NOMINAL",
            },
            {
                "invariant_id": "acknowledgement_is_accepted",
                "passed": True,
                "expected": True,
                "actual": True,
            },
            {
                "invariant_id": "post_state_matches_requested_mode",
                "passed": True,
                "expected": "SAFE",
                "actual": "SAFE",
            },
            {
                "invariant_id": "telemetry_matches_post_state",
                "passed": True,
                "expected": "SAFE",
                "actual": "SAFE",
            },
        ],
        "outcome": "PASS",
    }


def _serialized(document: object) -> str:
    return json.dumps(document)


def _record_for_scenario(scenario_id: ScenarioId):
    if scenario_id is ScenarioId.NOMINAL_TO_SAFE_MODE:
        observation = CommandExecutionObservation(
            command=SetOperatingModeCommand(OperatingMode.SAFE),
            pre_state=SpacecraftState(OperatingMode.NOMINAL),
            acknowledgement=Acknowledgement(True),
            post_state=SpacecraftState(OperatingMode.SAFE),
            telemetry=TelemetrySnapshot(OperatingMode.SAFE),
        )
    elif scenario_id is ScenarioId.NOMINAL_TO_NOMINAL_REJECTION:
        observation = CommandExecutionObservation(
            command=SetOperatingModeCommand(OperatingMode.NOMINAL),
            pre_state=SpacecraftState(OperatingMode.NOMINAL),
            acknowledgement=Acknowledgement(False),
            post_state=SpacecraftState(OperatingMode.NOMINAL),
            telemetry=TelemetrySnapshot(OperatingMode.NOMINAL),
        )
    else:
        observation = CommandExecutionObservation(
            command=SetOperatingModeCommand(OperatingMode.NOMINAL),
            pre_state=SpacecraftState(OperatingMode.SAFE),
            acknowledgement=Acknowledgement(True),
            post_state=SpacecraftState(OperatingMode.NOMINAL),
            telemetry=TelemetrySnapshot(OperatingMode.NOMINAL),
        )

    return build_verified_execution_record(
        execution_id=f"{scenario_id.value}-001",
        executed_at=EXECUTED_AT,
        scenario_id=scenario_id,
        observation=observation,
    )


def test_independently_constructed_v1_json_is_deserialised():
    record = deserialize_verified_execution_evidence(
        _serialized(_valid_document()),
    )

    assert record.execution_id == "manual-001"
    assert record.executed_at == EXECUTED_AT
    assert record.scenario_id is ScenarioId.NOMINAL_TO_SAFE_MODE
    assert record.observation.command.target_mode is OperatingMode.SAFE
    assert record.outcome is ExecutionOutcome.PASS
    assert tuple(result.passed for result in record.invariant_results) == (
        True,
        True,
        True,
        True,
    )


@pytest.mark.parametrize("scenario_id", list(ScenarioId))
def test_writer_to_reader_round_trip_preserves_supported_scenarios(
    scenario_id,
):
    record = _record_for_scenario(scenario_id)

    assert deserialize_verified_execution_evidence(
        serialize_verified_execution_evidence(record),
    ) == record


def test_canonically_consistent_fail_record_is_deserialised():
    observation = CommandExecutionObservation(
        command=SetOperatingModeCommand(OperatingMode.SAFE),
        pre_state=SpacecraftState(OperatingMode.NOMINAL),
        acknowledgement=Acknowledgement(False),
        post_state=SpacecraftState(OperatingMode.SAFE),
        telemetry=TelemetrySnapshot(OperatingMode.NOMINAL),
    )
    failing_record = build_verified_execution_record(
        execution_id="failing-001",
        executed_at=EXECUTED_AT,
        scenario_id=ScenarioId.NOMINAL_TO_SAFE_MODE,
        observation=observation,
    )

    loaded = deserialize_verified_execution_evidence(
        serialize_verified_execution_evidence(failing_record),
    )

    assert loaded == failing_record
    assert loaded.outcome is ExecutionOutcome.FAIL


def test_malformed_json_is_rejected():
    with pytest.raises(
        ValueError,
        match="invalid verified execution evidence JSON",
    ):
        deserialize_verified_execution_evidence('{"schema_version": 1')


@pytest.mark.parametrize(
    "replacement",
    [
        (
            '"schema_version": 1, "schema_version": 1',
            '"schema_version": 1',
        ),
        (
            '"execution_id": "manual-001", '
            '"execution_id": "other"',
            '"execution_id": "manual-001"',
        ),
    ],
    ids=["root", "nested"],
)
def test_duplicate_object_members_are_rejected(replacement):
    duplicate, original = replacement
    serialized = _serialized(_valid_document()).replace(original, duplicate, 1)

    with pytest.raises(
        ValueError,
        match="duplicate JSON object member name",
    ):
        deserialize_verified_execution_evidence(serialized)


def test_unsupported_schema_version_is_rejected():
    document = _valid_document()
    document["schema_version"] = 2

    with pytest.raises(ValueError, match="unsupported schema_version"):
        deserialize_verified_execution_evidence(_serialized(document))


@pytest.mark.parametrize(
    ("mutation", "message"),
    [
        ("missing-root", "missing fields: outcome"),
        ("unexpected-root", "unexpected fields: extra"),
        ("missing-execution", "missing fields: executed_at"),
        ("unexpected-result", "unexpected fields: extra"),
    ],
)
def test_missing_and_unexpected_fields_are_rejected(mutation, message):
    document = _valid_document()

    if mutation == "missing-root":
        del document["outcome"]
    elif mutation == "unexpected-root":
        document["extra"] = None
    elif mutation == "missing-execution":
        del document["execution"]["executed_at"]
    else:
        document["invariant_results"][0]["extra"] = None

    with pytest.raises(ValueError, match=re.escape(message)):
        deserialize_verified_execution_evidence(_serialized(document))


@pytest.mark.parametrize(
    ("mutation", "message"),
    [
        ("root-array", "verified execution evidence must be a JSON object"),
        ("execution-array", "execution must be a JSON object"),
        ("observation-array", "observation must be a JSON object"),
        ("results-object", "invariant_results must be a JSON array"),
        ("schema-string", "schema_version must be an integer"),
        ("id-number", "execution.execution_id must be a string"),
        ("passed-number", "invariant_results[0].passed must be a boolean"),
        ("expected-number", "invariant_results[0].expected must be a string"),
    ],
)
def test_invalid_structures_and_primitive_types_are_rejected(
    mutation,
    message,
):
    document: object = _valid_document()

    if mutation == "root-array":
        document = []
    elif mutation == "execution-array":
        document["execution"] = []
    elif mutation == "observation-array":
        document["observation"] = []
    elif mutation == "results-object":
        document["invariant_results"] = {}
    elif mutation == "schema-string":
        document["schema_version"] = "1"
    elif mutation == "id-number":
        document["execution"]["execution_id"] = 1
    elif mutation == "passed-number":
        document["invariant_results"][0]["passed"] = 1
    else:
        document["invariant_results"][0]["expected"] = 1

    with pytest.raises(ValueError, match=re.escape(message)):
        deserialize_verified_execution_evidence(_serialized(document))


@pytest.mark.parametrize(
    "mutation",
    [
        "scenario",
        "mode",
        "invariant-id",
        "outcome",
    ],
)
def test_unsupported_enum_values_are_rejected(mutation):
    document = _valid_document()

    if mutation == "scenario":
        document["execution"]["scenario_id"] = "unsupported"
    elif mutation == "mode":
        document["observation"]["telemetry"]["operating_mode"] = "SCIENCE"
    elif mutation == "invariant-id":
        document["invariant_results"][0]["invariant_id"] = "unsupported"
    else:
        document["outcome"] = "UNKNOWN"

    with pytest.raises(ValueError, match="unsupported value"):
        deserialize_verified_execution_evidence(_serialized(document))


@pytest.mark.parametrize("execution_id", ["", "   "])
def test_invalid_execution_ids_are_rejected(execution_id):
    document = _valid_document()
    document["execution"]["execution_id"] = execution_id

    with pytest.raises(ValueError, match="must not be empty or whitespace-only"):
        deserialize_verified_execution_evidence(_serialized(document))


@pytest.mark.parametrize(
    "timestamp",
    [
        "not-a-timestamp",
        "2026-08-15T12:00:00",
        "2026-08-15T14:00:00+02:00",
    ],
    ids=["malformed", "naive", "non-utc"],
)
def test_invalid_or_non_utc_timestamps_are_rejected(timestamp):
    document = _valid_document()
    document["execution"]["executed_at"] = timestamp

    with pytest.raises(ValueError, match="execution.executed_at"):
        deserialize_verified_execution_evidence(_serialized(document))


def test_command_incompatible_with_persisted_scenario_is_rejected():
    document = _valid_document()
    document["execution"]["scenario_id"] = "safe_to_nominal_mode"

    with pytest.raises(
        ValueError,
        match="command does not match the selected scenario",
    ):
        deserialize_verified_execution_evidence(_serialized(document))


@pytest.mark.parametrize(
    "mutation",
    ["missing", "additional", "reordered", "substituted"],
)
def test_noncanonical_invariant_result_collections_are_rejected(mutation):
    document = _valid_document()
    results = document["invariant_results"]

    if mutation == "missing":
        results.pop()
    elif mutation == "additional":
        results.append(deepcopy(results[-1]))
    elif mutation == "reordered":
        results.reverse()
    else:
        results[1] = {
            "invariant_id": "acknowledgement_is_rejected",
            "passed": False,
            "expected": False,
            "actual": True,
        }

    with pytest.raises(
        ValueError,
        match="invariant_results do not match canonical",
    ):
        deserialize_verified_execution_evidence(_serialized(document))


@pytest.mark.parametrize(
    "mutation",
    ["invariant-id", "expected", "actual", "passed"],
)
def test_altered_invariant_result_values_are_rejected(mutation):
    document = _valid_document()
    result = document["invariant_results"][1]

    if mutation == "invariant-id":
        result["invariant_id"] = "acknowledgement_is_rejected"
    elif mutation == "expected":
        document["invariant_results"][0]["expected"] = "SAFE"
    elif mutation == "actual":
        document["invariant_results"][0]["actual"] = "SAFE"
    else:
        result["passed"] = False

    with pytest.raises(
        ValueError,
        match="invariant_results do not match canonical",
    ):
        deserialize_verified_execution_evidence(_serialized(document))


def test_altered_aggregate_outcome_is_rejected():
    document = _valid_document()
    document["outcome"] = "FAIL"

    with pytest.raises(
        ValueError,
        match="outcome does not match canonical",
    ):
        deserialize_verified_execution_evidence(_serialized(document))
