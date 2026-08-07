"""Verified execution construction and reference orchestration."""

from datetime import datetime

from orbirig.models import (
    CommandExecutionObservation,
    InvariantResult,
    ScenarioId,
    VerifiedExecutionRecord,
    command_for_scenario,
)
from orbirig.reference_sut import ReferenceSpacecraft
from orbirig.verification import (
    evaluate_nominal_to_nominal_rejection_invariants,
    evaluate_nominal_to_safe_invariants,
    evaluate_safe_to_nominal_invariants,
)
from orbirig.workflow import execute_reference_workflow


def _evaluate_observation_invariants(
    *,
    scenario_id: ScenarioId,
    observation: CommandExecutionObservation,
) -> tuple[InvariantResult, ...]:
    """Evaluate observations against one selected reference scenario."""

    if scenario_id is ScenarioId.NOMINAL_TO_SAFE_MODE:
        return evaluate_nominal_to_safe_invariants(
            pre_state=observation.pre_state,
            acknowledgement=observation.acknowledgement,
            post_state=observation.post_state,
            telemetry=observation.telemetry,
        )

    if scenario_id is ScenarioId.NOMINAL_TO_NOMINAL_REJECTION:
        return evaluate_nominal_to_nominal_rejection_invariants(
            pre_state=observation.pre_state,
            acknowledgement=observation.acknowledgement,
            post_state=observation.post_state,
            telemetry=observation.telemetry,
        )

    if scenario_id is ScenarioId.SAFE_TO_NOMINAL_MODE:
        return evaluate_safe_to_nominal_invariants(
            pre_state=observation.pre_state,
            acknowledgement=observation.acknowledgement,
            post_state=observation.post_state,
            telemetry=observation.telemetry,
        )

    raise AssertionError("unsupported reference scenario dispatch")


def build_verified_execution_record(
    *,
    execution_id: str,
    executed_at: datetime,
    scenario_id: ScenarioId,
    observation: CommandExecutionObservation,
) -> VerifiedExecutionRecord:
    """Verify an observation against one explicitly selected scenario."""

    if observation.command != command_for_scenario(scenario_id):
        raise ValueError(
            "observation command does not match the selected scenario",
        )

    invariant_results = _evaluate_observation_invariants(
        scenario_id=scenario_id,
        observation=observation,
    )

    return VerifiedExecutionRecord(
        execution_id=execution_id,
        executed_at=executed_at,
        scenario_id=scenario_id,
        observation=observation,
        invariant_results=invariant_results,
    )


def execute_verified_reference_workflow(
    *,
    spacecraft: ReferenceSpacecraft,
    execution_id: str,
    executed_at: datetime,
    scenario_id: ScenarioId = ScenarioId.NOMINAL_TO_SAFE_MODE,
) -> VerifiedExecutionRecord:
    """Execute and independently verify one selected reference scenario."""

    observation = execute_reference_workflow(
        spacecraft=spacecraft,
        command=command_for_scenario(scenario_id),
    )

    return build_verified_execution_record(
        execution_id=execution_id,
        executed_at=executed_at,
        scenario_id=scenario_id,
        observation=observation,
    )
