"""Verified execution construction and reference orchestration."""

from datetime import datetime

from orbirig.models import (
    CommandExecutionObservation,
    InvariantResult,
    NOMINAL_TO_SAFE_COMMAND,
    ScenarioId,
    SetOperatingModeCommand,
    VerifiedExecutionRecord,
    derive_scenario_id,
)
from orbirig.reference_sut import ReferenceSpacecraft
from orbirig.verification import (
    evaluate_invariants,
    evaluate_nominal_to_nominal_rejection_invariants,
)
from orbirig.workflow import execute_reference_workflow


def _evaluate_observation_invariants(
    observation: CommandExecutionObservation,
) -> tuple[InvariantResult, ...]:
    """Evaluate invariants for one supported reference scenario."""

    scenario_id = derive_scenario_id(observation.command)

    if scenario_id is ScenarioId.NOMINAL_TO_SAFE_MODE:
        return evaluate_invariants(
            command=observation.command,
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

    raise AssertionError("unsupported reference scenario dispatch")


def build_verified_execution_record(
    *,
    execution_id: str,
    executed_at: datetime,
    observation: CommandExecutionObservation,
) -> VerifiedExecutionRecord:
    """Verify an observation and build its immutable execution record."""

    invariant_results = _evaluate_observation_invariants(
        observation,
    )

    return VerifiedExecutionRecord(
        execution_id=execution_id,
        executed_at=executed_at,
        observation=observation,
        invariant_results=invariant_results,
    )


def execute_verified_reference_workflow(
    *,
    spacecraft: ReferenceSpacecraft,
    execution_id: str,
    executed_at: datetime,
    command: SetOperatingModeCommand = NOMINAL_TO_SAFE_COMMAND,
) -> VerifiedExecutionRecord:
    """Execute and independently verify one supported reference scenario."""

    observation = execute_reference_workflow(
        spacecraft=spacecraft,
        command=command,
    )

    return build_verified_execution_record(
        execution_id=execution_id,
        executed_at=executed_at,
        observation=observation,
    )
