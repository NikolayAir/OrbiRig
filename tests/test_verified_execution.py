"""Tests for verified execution records and primary evidence."""

import json
from datetime import datetime, timedelta, timezone

import pytest

from orbirig.evidence import serialize_verified_execution_evidence
from orbirig.execution import (
    build_verified_execution_record,
    execute_verified_reference_workflow,
)
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
from orbirig.reference_sut import ReferenceSpacecraft


EXECUTION_ID = "execution-0001"
EXECUTED_AT = datetime(
    2026,
    8,
    6,
    20,
    0,
    tzinfo=timezone.utc,
)


def _observation(
    *,
    pre_mode: OperatingMode = OperatingMode.NOMINAL,
    accepted: bool = True,
    post_mode: OperatingMode = OperatingMode.SAFE,
    telemetry_mode: OperatingMode = OperatingMode.SAFE,
    target_mode: OperatingMode = OperatingMode.SAFE,
) -> CommandExecutionObservation:
    return CommandExecutionObservation(
        command=SetOperatingModeCommand(
            target_mode=target_mode,
        ),
        pre_state=SpacecraftState(
            operating_mode=pre_mode,
        ),
        acknowledgement=Acknowledgement(
            accepted=accepted,
        ),
        post_state=SpacecraftState(
            operating_mode=post_mode,
        ),
        telemetry=TelemetrySnapshot(
            operating_mode=telemetry_mode,
        ),
    )


def _build_record(
    observation: CommandExecutionObservation,
):
    return build_verified_execution_record(
        execution_id=EXECUTION_ID,
        executed_at=EXECUTED_AT,
        observation=observation,
    )


def _parsed_document(observation: CommandExecutionObservation):
    return json.loads(
        serialize_verified_execution_evidence(
            _build_record(observation),
        ),
    )


def test_verified_reference_workflow_builds_passing_record():
    record = execute_verified_reference_workflow(
        spacecraft=ReferenceSpacecraft(),
        execution_id=EXECUTION_ID,
        executed_at=EXECUTED_AT,
    )

    assert record.execution_id == EXECUTION_ID
    assert record.scenario_id is ScenarioId.NOMINAL_TO_SAFE_MODE
    assert record.executed_at == EXECUTED_AT
    assert record.outcome is ExecutionOutcome.PASS
    assert len(record.invariant_results) == 4
    assert all(result.passed for result in record.invariant_results)


def test_public_builder_verifies_inconsistent_observation_as_fail():
    record = _build_record(
        _observation(
            pre_mode=OperatingMode.SAFE,
            accepted=False,
            post_mode=OperatingMode.NOMINAL,
            telemetry_mode=OperatingMode.SAFE,
        ),
    )

    assert record.outcome is ExecutionOutcome.FAIL
    assert not any(
        result.passed
        for result in record.invariant_results
    )


def test_public_builder_does_not_accept_arbitrary_invariant_results():
    with pytest.raises(TypeError, match="invariant_results"):
        build_verified_execution_record(
            execution_id=EXECUTION_ID,
            executed_at=EXECUTED_AT,
            observation=_observation(
                accepted=False,
            ),
            invariant_results=(),
        )


def test_outcome_is_pass_only_when_all_invariants_pass():
    passing_record = _build_record(_observation())
    one_failure_record = _build_record(
        _observation(
            telemetry_mode=OperatingMode.NOMINAL,
        ),
    )
    several_failures_record = _build_record(
        _observation(
            pre_mode=OperatingMode.SAFE,
            accepted=False,
        ),
    )

    assert passing_record.outcome is ExecutionOutcome.PASS
    assert one_failure_record.outcome is ExecutionOutcome.FAIL
    assert several_failures_record.outcome is ExecutionOutcome.FAIL


def test_public_builder_preserves_invariant_order():
    record = _build_record(
        _observation(
            pre_mode=OperatingMode.SAFE,
            accepted=False,
        ),
    )

    assert tuple(
        result.invariant_id
        for result in record.invariant_results
    ) == (
        InvariantId.PRE_STATE_MATCHES_EXPECTED,
        InvariantId.ACKNOWLEDGEMENT_IS_ACCEPTED,
        InvariantId.POST_STATE_MATCHES_REQUESTED_MODE,
        InvariantId.TELEMETRY_MATCHES_POST_STATE,
    )


def test_fixed_inputs_produce_equal_records_and_json():
    first_record = execute_verified_reference_workflow(
        spacecraft=ReferenceSpacecraft(),
        execution_id=EXECUTION_ID,
        executed_at=EXECUTED_AT,
    )
    second_record = execute_verified_reference_workflow(
        spacecraft=ReferenceSpacecraft(),
        execution_id=EXECUTION_ID,
        executed_at=EXECUTED_AT,
    )

    assert first_record == second_record
    assert serialize_verified_execution_evidence(
        first_record,
    ) == serialize_verified_execution_evidence(
        second_record,
    )


def test_verified_evidence_parses_to_expected_document():
    record = execute_verified_reference_workflow(
        spacecraft=ReferenceSpacecraft(),
        execution_id=EXECUTION_ID,
        executed_at=EXECUTED_AT,
    )

    document = json.loads(
        serialize_verified_execution_evidence(record),
    )

    assert document == {
        "schema_version": 1,
        "execution": {
            "execution_id": "execution-0001",
            "scenario_id": "nominal_to_safe_mode",
            "executed_at": "2026-08-06T20:00:00Z",
        },
        "observation": {
            "command": {
                "command_type": "SET_OPERATING_MODE",
                "target_mode": "SAFE",
            },
            "pre_state": {
                "operating_mode": "NOMINAL",
            },
            "acknowledgement": {
                "accepted": True,
            },
            "post_state": {
                "operating_mode": "SAFE",
            },
            "telemetry": {
                "operating_mode": "SAFE",
            },
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
                "invariant_id": (
                    "post_state_matches_requested_mode"
                ),
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


def test_failing_evidence_contains_failed_invariant_and_outcome():
    document = _parsed_document(
        _observation(
            accepted=False,
            telemetry_mode=OperatingMode.NOMINAL,
        ),
    )

    assert document["outcome"] == "FAIL"

    failed_results = [
        result
        for result in document["invariant_results"]
        if not result["passed"]
    ]

    assert {
        "invariant_id": "acknowledgement_is_accepted",
        "passed": False,
        "expected": True,
        "actual": False,
    } in failed_results


def test_pass_and_fail_documents_have_equal_top_level_shape():
    passing_document = _parsed_document(_observation())
    failing_document = _parsed_document(
        _observation(
            accepted=False,
            telemetry_mode=OperatingMode.NOMINAL,
        ),
    )
    expected_keys = (
        "schema_version",
        "execution",
        "observation",
        "invariant_results",
        "outcome",
    )

    assert tuple(passing_document) == expected_keys
    assert tuple(failing_document) == expected_keys


def test_scenario_identifier_is_derived_from_supported_scenario():
    record = _build_record(_observation())

    assert record.scenario_id is ScenarioId.NOMINAL_TO_SAFE_MODE

    unsupported_observation = _observation(
        target_mode=OperatingMode.NOMINAL,
        post_mode=OperatingMode.NOMINAL,
        telemetry_mode=OperatingMode.NOMINAL,
    )

    with pytest.raises(
        ValueError,
        match="supported reference scenario",
    ):
        _build_record(unsupported_observation)


@pytest.mark.parametrize(
    "executed_at",
    [
        datetime(2026, 8, 6, 20, 0),
        datetime(
            2026,
            8,
            6,
            20,
            0,
            tzinfo=timezone(timedelta(hours=2)),
        ),
    ],
    ids=["naive", "non-zero-offset"],
)
def test_verified_record_rejects_non_utc_execution_time(
    executed_at,
):
    with pytest.raises(
        ValueError,
        match="timezone-aware UTC",
    ):
        build_verified_execution_record(
            execution_id=EXECUTION_ID,
            executed_at=executed_at,
            observation=_observation(),
        )


@pytest.mark.parametrize(
    "execution_id",
    ["", "   "],
    ids=["empty", "whitespace-only"],
)
def test_verified_record_rejects_empty_execution_id(
    execution_id,
):
    with pytest.raises(
        ValueError,
        match="must not be empty or whitespace-only",
    ):
        build_verified_execution_record(
            execution_id=execution_id,
            executed_at=EXECUTED_AT,
            observation=_observation(),
        )
