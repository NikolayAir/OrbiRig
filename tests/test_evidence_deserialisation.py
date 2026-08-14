"""Tests for strict observation-evidence deserialisation."""

import json
from datetime import datetime, timezone

import pytest

from orbirig.evidence import (
    deserialize_execution_evidence,
    serialize_execution_evidence,
)
from orbirig.execution import build_verified_execution_record
from orbirig.models import (
    Acknowledgement,
    CommandExecutionObservation,
    ExecutionOutcome,
    InvariantId,
    OperatingMode,
    ScenarioId,
    SetOperatingModeCommand,
    SpacecraftState,
    TelemetrySnapshot,
)


EXECUTED_AT = datetime(
    2026,
    8,
    8,
    12,
    0,
    tzinfo=timezone.utc,
)


def _document(
    *,
    target_mode: object = "SAFE",
    pre_mode: object = "NOMINAL",
    accepted: object = True,
    post_mode: object = "SAFE",
    telemetry_mode: object = "SAFE",
) -> dict[str, object]:
    return {
        "evidence_format_version": 1,
        "command": {
            "command_type": "SET_OPERATING_MODE",
            "target_mode": target_mode,
        },
        "pre_state": {
            "operating_mode": pre_mode,
        },
        "acknowledgement": {
            "accepted": accepted,
        },
        "post_state": {
            "operating_mode": post_mode,
        },
        "telemetry": {
            "operating_mode": telemetry_mode,
        },
    }


def _serialized(document: object) -> str:
    return json.dumps(document)


def _expected_nominal_to_safe_observation() -> CommandExecutionObservation:
    return CommandExecutionObservation(
        command=SetOperatingModeCommand(
            target_mode=OperatingMode.SAFE,
        ),
        pre_state=SpacecraftState(
            operating_mode=OperatingMode.NOMINAL,
        ),
        acknowledgement=Acknowledgement(
            accepted=True,
        ),
        post_state=SpacecraftState(
            operating_mode=OperatingMode.SAFE,
        ),
        telemetry=TelemetrySnapshot(
            operating_mode=OperatingMode.SAFE,
        ),
    )


def test_independently_constructed_v1_json_is_deserialised():
    observation = deserialize_execution_evidence(
        _serialized(_document()),
    )

    assert observation == _expected_nominal_to_safe_observation()


def test_writer_to_reader_round_trip_preserves_observation():
    observation = _expected_nominal_to_safe_observation()

    loaded = deserialize_execution_evidence(
        serialize_execution_evidence(observation),
    )

    assert loaded == observation


def test_malformed_json_is_rejected():
    with pytest.raises(
        ValueError,
        match="invalid observation evidence JSON",
    ):
        deserialize_execution_evidence(
            '{"evidence_format_version": 1',
        )


def test_unsupported_evidence_version_is_rejected():
    document = _document()
    document["evidence_format_version"] = 2

    with pytest.raises(
        ValueError,
        match="unsupported evidence_format_version",
    ):
        deserialize_execution_evidence(
            _serialized(document),
        )


@pytest.mark.parametrize(
    "root",
    [
        [],
        "observation",
        None,
    ],
    ids=[
        "array",
        "string",
        "null",
    ],
)
def test_wrong_root_shape_is_rejected(root):
    with pytest.raises(
        ValueError,
        match="observation evidence must be a JSON object",
    ):
        deserialize_execution_evidence(
            _serialized(root),
        )


def test_wrong_nested_shape_is_rejected():
    document = _document()
    document["command"] = []

    with pytest.raises(
        ValueError,
        match="command must be a JSON object",
    ):
        deserialize_execution_evidence(
            _serialized(document),
        )


def test_missing_root_field_is_rejected():
    document = _document()
    del document["telemetry"]

    with pytest.raises(
        ValueError,
        match="missing fields: telemetry",
    ):
        deserialize_execution_evidence(
            _serialized(document),
        )


def test_duplicate_root_field_is_rejected():
    serialized = _serialized(_document()).replace(
        '"evidence_format_version": 1',
        '"evidence_format_version": 1, '
        '"evidence_format_version": 1',
        1,
    )

    with pytest.raises(
        ValueError,
        match="duplicate JSON object member name",
    ):
        deserialize_execution_evidence(serialized)


def test_duplicate_nested_field_is_rejected():
    serialized = _serialized(_document()).replace(
        '"accepted": true',
        '"accepted": true, "accepted": false',
        1,
    )

    with pytest.raises(
        ValueError,
        match="duplicate JSON object member name",
    ):
        deserialize_execution_evidence(serialized)


def test_scenario_id_is_rejected_at_root_boundary():
    document = _document()
    document["scenario_id"] = "nominal_to_safe_mode"

    with pytest.raises(
        ValueError,
        match="unexpected fields: scenario_id",
    ):
        deserialize_execution_evidence(
            _serialized(document),
        )


@pytest.mark.parametrize(
    ("mutation", "expected_message"),
    [
        (
            "missing-accepted",
            "missing fields: accepted",
        ),
        (
            "unexpected-command-field",
            "unexpected fields: unexpected",
        ),
    ],
)
def test_invalid_nested_fields_are_rejected(
    mutation,
    expected_message,
):
    document = _document()

    if mutation == "missing-accepted":
        del document["acknowledgement"]["accepted"]
    else:
        document["command"]["unexpected"] = "value"

    with pytest.raises(
        ValueError,
        match=expected_message,
    ):
        deserialize_execution_evidence(
            _serialized(document),
        )


@pytest.mark.parametrize(
    ("mutation", "expected_message"),
    [
        (
            "version-string",
            "evidence_format_version must be an integer",
        ),
        (
            "version-boolean",
            "evidence_format_version must be an integer",
        ),
        (
            "command-type-number",
            "command.command_type must be a string",
        ),
        (
            "target-mode-boolean",
            "command.target_mode must be a string",
        ),
        (
            "accepted-number",
            "acknowledgement.accepted must be a boolean",
        ),
    ],
)
def test_wrong_primitive_types_are_rejected(
    mutation,
    expected_message,
):
    document = _document()

    if mutation == "version-string":
        document["evidence_format_version"] = "1"
    elif mutation == "version-boolean":
        document["evidence_format_version"] = True
    elif mutation == "command-type-number":
        document["command"]["command_type"] = 1
    elif mutation == "target-mode-boolean":
        document["command"]["target_mode"] = False
    else:
        document["acknowledgement"]["accepted"] = 1

    with pytest.raises(
        ValueError,
        match=expected_message,
    ):
        deserialize_execution_evidence(
            _serialized(document),
        )


def test_unknown_operating_mode_is_rejected():
    document = _document(
        telemetry_mode="SCIENCE",
    )

    with pytest.raises(
        ValueError,
        match="telemetry.operating_mode has unsupported value",
    ):
        deserialize_execution_evidence(
            _serialized(document),
        )


def test_invalid_command_type_is_rejected():
    document = _document()
    document["command"]["command_type"] = "RESET"

    with pytest.raises(
        ValueError,
        match="command.command_type has unsupported value",
    ):
        deserialize_execution_evidence(
            _serialized(document),
        )


def test_structurally_valid_inconsistent_evidence_reaches_verifier():
    observation = deserialize_execution_evidence(
        _serialized(
            _document(
                accepted=False,
            ),
        ),
    )

    record = build_verified_execution_record(
        execution_id="loaded-inconsistent-observation",
        executed_at=EXECUTED_AT,
        scenario_id=ScenarioId.NOMINAL_TO_SAFE_MODE,
        observation=observation,
    )

    assert record.outcome is ExecutionOutcome.FAIL
    assert tuple(
        result.invariant_id
        for result in record.invariant_results
        if not result.passed
    ) == (
        InvariantId.ACKNOWLEDGEMENT_IS_ACCEPTED,
    )


def test_loaded_observation_does_not_select_or_reclassify_scenario():
    observation = deserialize_execution_evidence(
        _serialized(
            _document(
                target_mode="NOMINAL",
                pre_mode="SAFE",
                accepted=True,
                post_mode="NOMINAL",
                telemetry_mode="NOMINAL",
            ),
        ),
    )

    record = build_verified_execution_record(
        execution_id="loaded-safe-to-nominal-observation",
        executed_at=EXECUTED_AT,
        scenario_id=ScenarioId.NOMINAL_TO_NOMINAL_REJECTION,
        observation=observation,
    )

    assert record.scenario_id is ScenarioId.NOMINAL_TO_NOMINAL_REJECTION
    assert record.outcome is ExecutionOutcome.FAIL
    assert tuple(
        result.invariant_id
        for result in record.invariant_results
        if not result.passed
    ) == (
        InvariantId.PRE_STATE_MATCHES_EXPECTED,
        InvariantId.ACKNOWLEDGEMENT_IS_REJECTED,
        InvariantId.POST_STATE_MATCHES_PRE_STATE,
    )
