"""Tests for reference workflow execution."""

from orbirig.models import (
    CommandExecutionObservation,
    OperatingMode,
    SetOperatingModeCommand,
)
from orbirig.reference_sut import ReferenceSpacecraft
from orbirig.verification import evaluate_invariants
from orbirig.workflow import execute_reference_workflow


def _execute_safe_mode_workflow() -> CommandExecutionObservation:
    return execute_reference_workflow(
        spacecraft=ReferenceSpacecraft(),
        command=SetOperatingModeCommand(
            target_mode=OperatingMode.SAFE,
        ),
    )


def test_reference_workflow_collects_execution_observations():
    observation = _execute_safe_mode_workflow()

    assert observation.command.target_mode is OperatingMode.SAFE
    assert observation.pre_state.operating_mode is OperatingMode.NOMINAL
    assert observation.acknowledgement.accepted is True
    assert observation.post_state.operating_mode is OperatingMode.SAFE
    assert observation.telemetry.operating_mode is OperatingMode.SAFE


def test_reference_workflow_observations_pass_independent_verification():
    observation = _execute_safe_mode_workflow()

    results = evaluate_invariants(
        command=observation.command,
        pre_state=observation.pre_state,
        acknowledgement=observation.acknowledgement,
        post_state=observation.post_state,
        telemetry=observation.telemetry,
    )

    assert len(results) == 4
    assert all(result.passed for result in results)


def test_reference_workflow_observations_are_repeatable_for_fresh_spacecraft():
    first_observation = _execute_safe_mode_workflow()
    second_observation = _execute_safe_mode_workflow()

    assert first_observation == second_observation
