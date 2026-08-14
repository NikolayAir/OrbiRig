"""Tests for ordered cross-execution state continuity verification."""

from dataclasses import FrozenInstanceError
from datetime import datetime, timezone

import pytest

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
from orbirig.verification import verify_execution_sequence


EARLIER = datetime(2026, 8, 1, tzinfo=timezone.utc)
LATER = datetime(2026, 8, 2, tzinfo=timezone.utc)


def _record(
    *,
    execution_id: str,
    scenario_id: ScenarioId,
    pre_mode: OperatingMode,
    accepted: bool,
    post_mode: OperatingMode,
    executed_at: datetime = EARLIER,
):
    target_mode = (
        OperatingMode.SAFE
        if scenario_id is ScenarioId.NOMINAL_TO_SAFE_MODE
        else OperatingMode.NOMINAL
    )
    observation = CommandExecutionObservation(
        command=SetOperatingModeCommand(target_mode=target_mode),
        pre_state=SpacecraftState(operating_mode=pre_mode),
        acknowledgement=Acknowledgement(accepted=accepted),
        post_state=SpacecraftState(operating_mode=post_mode),
        telemetry=TelemetrySnapshot(operating_mode=post_mode),
    )

    return build_verified_execution_record(
        execution_id=execution_id,
        executed_at=executed_at,
        scenario_id=scenario_id,
        observation=observation,
    )


def _nominal_to_safe(
    execution_id: str,
    *,
    accepted: bool = True,
    executed_at: datetime = EARLIER,
):
    return _record(
        execution_id=execution_id,
        executed_at=executed_at,
        scenario_id=ScenarioId.NOMINAL_TO_SAFE_MODE,
        pre_mode=OperatingMode.NOMINAL,
        accepted=accepted,
        post_mode=OperatingMode.SAFE,
    )


def _safe_to_nominal(
    execution_id: str,
    *,
    accepted: bool = True,
    executed_at: datetime = EARLIER,
):
    return _record(
        execution_id=execution_id,
        executed_at=executed_at,
        scenario_id=ScenarioId.SAFE_TO_NOMINAL_MODE,
        pre_mode=OperatingMode.SAFE,
        accepted=accepted,
        post_mode=OperatingMode.NOMINAL,
    )


def _nominal_rejection(
    execution_id: str,
    *,
    executed_at: datetime = EARLIER,
):
    return _record(
        execution_id=execution_id,
        executed_at=executed_at,
        scenario_id=ScenarioId.NOMINAL_TO_NOMINAL_REJECTION,
        pre_mode=OperatingMode.NOMINAL,
        accepted=False,
        post_mode=OperatingMode.NOMINAL,
    )


def test_continuous_passing_pair_produces_passing_sequence():
    first = _nominal_to_safe("first")
    second = _safe_to_nominal("second")

    sequence = verify_execution_sequence((first, second))

    assert sequence.records == (first, second)
    assert sequence.outcome is ExecutionOutcome.PASS
    assert len(sequence.continuity_results) == 1

    boundary = sequence.continuity_results[0]
    assert boundary.previous_execution_id == "first"
    assert boundary.next_execution_id == "second"
    assert boundary.expected_operating_mode is OperatingMode.SAFE
    assert boundary.observed_operating_mode is OperatingMode.SAFE
    assert boundary.passed is True


def test_individually_passing_discontinuous_records_fail_sequence():
    first = _nominal_to_safe("first")
    second = _nominal_rejection("second")

    sequence = verify_execution_sequence((first, second))

    assert first.outcome is ExecutionOutcome.PASS
    assert second.outcome is ExecutionOutcome.PASS
    assert sequence.outcome is ExecutionOutcome.FAIL

    boundary = sequence.continuity_results[0]
    assert boundary.previous_execution_id == "first"
    assert boundary.next_execution_id == "second"
    assert boundary.expected_operating_mode is OperatingMode.SAFE
    assert boundary.observed_operating_mode is OperatingMode.NOMINAL
    assert boundary.passed is False


def test_failed_member_fails_sequence_but_continuity_is_preserved():
    first = _nominal_to_safe("first")
    failed_second = _safe_to_nominal("failed-second", accepted=False)

    sequence = verify_execution_sequence((first, failed_second))

    assert failed_second.outcome is ExecutionOutcome.FAIL
    assert sequence.continuity_results[0].passed is True
    assert sequence.outcome is ExecutionOutcome.FAIL


def test_boundaries_after_a_failed_middle_member_are_still_evaluated():
    first = _nominal_to_safe("first")
    failed_middle = _safe_to_nominal("middle", accepted=False)
    third = _nominal_rejection("third")

    sequence = verify_execution_sequence(
        (first, failed_middle, third),
    )

    assert failed_middle.outcome is ExecutionOutcome.FAIL
    assert tuple(
        (
            result.previous_execution_id,
            result.next_execution_id,
            result.passed,
        )
        for result in sequence.continuity_results
    ) == (
        ("first", "middle", True),
        ("middle", "third", True),
    )
    assert sequence.outcome is ExecutionOutcome.FAIL


def test_three_records_preserve_record_and_boundary_order():
    records = (
        _nominal_to_safe("first"),
        _safe_to_nominal("second"),
        _nominal_rejection("third"),
    )

    sequence = verify_execution_sequence(records)

    assert sequence.records == records
    assert tuple(
        (
            result.previous_execution_id,
            result.next_execution_id,
        )
        for result in sequence.continuity_results
    ) == (
        ("first", "second"),
        ("second", "third"),
    )
    assert all(result.passed for result in sequence.continuity_results)


def test_multiple_discontinuities_are_preserved():
    sequence = verify_execution_sequence(
        (
            _nominal_to_safe("first"),
            _nominal_rejection("second"),
            _safe_to_nominal("third"),
        ),
    )

    assert sequence.outcome is ExecutionOutcome.FAIL
    assert tuple(
        result.passed
        for result in sequence.continuity_results
    ) == (False, False)


@pytest.mark.parametrize("records", [(), (_nominal_to_safe("only"),)])
def test_fewer_than_two_records_are_rejected(records):
    with pytest.raises(
        ValueError,
        match="requires at least two records",
    ):
        verify_execution_sequence(records)


def test_equal_ordered_inputs_produce_equal_results():
    records = (
        _nominal_to_safe("first"),
        _safe_to_nominal("second"),
    )

    assert verify_execution_sequence(records) == verify_execution_sequence(
        records,
    )


@pytest.mark.parametrize(
    ("first_time", "second_time"),
    [
        (EARLIER, EARLIER),
        (LATER, EARLIER),
    ],
    ids=["equal", "decreasing"],
)
def test_input_order_is_authoritative_regardless_of_timestamps(
    first_time,
    second_time,
):
    first = _nominal_to_safe("first", executed_at=first_time)
    second = _safe_to_nominal("second", executed_at=second_time)

    sequence = verify_execution_sequence((first, second))

    assert sequence.records == (first, second)
    assert sequence.continuity_results[0].passed is True
    assert sequence.outcome is ExecutionOutcome.PASS


def test_caller_owned_mutable_input_is_copied_to_immutable_tuple():
    first = _nominal_to_safe("duplicate-id")
    second = _safe_to_nominal("duplicate-id")
    records = [first, second]

    sequence = verify_execution_sequence(records)
    records.reverse()

    assert sequence.records == (first, second)
    assert isinstance(sequence.records, tuple)
    assert isinstance(sequence.continuity_results, tuple)

    with pytest.raises(FrozenInstanceError):
        sequence.outcome = ExecutionOutcome.FAIL

    with pytest.raises(FrozenInstanceError):
        sequence.continuity_results[0].passed = False
