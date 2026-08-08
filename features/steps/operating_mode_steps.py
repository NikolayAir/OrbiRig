"""Behave steps for supported operating-mode verification workflows."""

from datetime import datetime, timezone

from behave import given, then, when

from orbirig.execution import execute_verified_reference_workflow
from orbirig.models import ExecutionOutcome, OperatingMode, ScenarioId
from orbirig.reference_sut import ReferenceSpacecraft


EXECUTED_AT = datetime(2026, 8, 8, tzinfo=timezone.utc)

SCENARIO_BY_INTENT = {
    (
        OperatingMode.NOMINAL,
        OperatingMode.SAFE,
    ): ScenarioId.NOMINAL_TO_SAFE_MODE,
    (
        OperatingMode.NOMINAL,
        OperatingMode.NOMINAL,
    ): ScenarioId.NOMINAL_TO_NOMINAL_REJECTION,
    (
        OperatingMode.SAFE,
        OperatingMode.NOMINAL,
    ): ScenarioId.SAFE_TO_NOMINAL_MODE,
}


def _mode(value: str) -> OperatingMode:
    try:
        return OperatingMode[value]
    except KeyError:
        raise AssertionError(
            f"unsupported operating mode in Behave scenario: {value}"
        ) from None


@given("the reference spacecraft is in {mode} mode")
def given_reference_spacecraft_in_mode(context, mode):
    declared_mode = _mode(mode)

    context.spacecraft = ReferenceSpacecraft()
    context.declared_pre_mode = declared_mode

    if declared_mode is OperatingMode.SAFE:
        preparation = execute_verified_reference_workflow(
            spacecraft=context.spacecraft,
            execution_id="behave-prepare-safe",
            executed_at=EXECUTED_AT,
            scenario_id=ScenarioId.NOMINAL_TO_SAFE_MODE,
        )
        assert preparation.outcome is ExecutionOutcome.PASS

    assert (
        context.spacecraft.read_state().operating_mode
        is declared_mode
    )


@when("{mode} operating mode is requested")
def when_operating_mode_is_requested(context, mode):
    requested_mode = _mode(mode)

    try:
        scenario_id = SCENARIO_BY_INTENT[
            (context.declared_pre_mode, requested_mode)
        ]
    except KeyError:
        raise AssertionError(
            "unsupported declared operating-mode scenario"
        ) from None

    context.record = execute_verified_reference_workflow(
        spacecraft=context.spacecraft,
        execution_id="behave-execution",
        executed_at=EXECUTED_AT,
        scenario_id=scenario_id,
    )


@then("the command is accepted")
def then_command_is_accepted(context):
    assert context.record.observation.acknowledgement.accepted is True


@then("the command is rejected")
def then_command_is_rejected(context):
    assert context.record.observation.acknowledgement.accepted is False


@then("the post-command state is {mode}")
def then_post_command_state_is(context, mode):
    assert (
        context.record.observation.post_state.operating_mode
        is _mode(mode)
    )


@then("the telemetry reports {mode}")
def then_telemetry_reports(context, mode):
    assert (
        context.record.observation.telemetry.operating_mode
        is _mode(mode)
    )


@then("the spacecraft remains in {mode} mode")
def then_spacecraft_remains_in_mode(context, mode):
    expected_mode = _mode(mode)
    observation = context.record.observation

    assert observation.pre_state.operating_mode is expected_mode
    assert observation.post_state == observation.pre_state


@then("the verification outcome is {outcome}")
def then_verification_outcome_is(context, outcome):
    try:
        expected_outcome = ExecutionOutcome[outcome]
    except KeyError:
        raise AssertionError(
            f"unsupported verification outcome: {outcome}"
        ) from None

    assert context.record.outcome is expected_outcome
