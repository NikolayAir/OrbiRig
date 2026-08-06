"""Verified execution construction and reference orchestration."""

from datetime import datetime

from orbirig.models import (
    CommandExecutionObservation,
    SUPPORTED_SCENARIO_COMMAND,
    VerifiedExecutionRecord,
)
from orbirig.reference_sut import ReferenceSpacecraft
from orbirig.verification import evaluate_invariants
from orbirig.workflow import execute_reference_workflow


def build_verified_execution_record(
    *,
    execution_id: str,
    executed_at: datetime,
    observation: CommandExecutionObservation,
) -> VerifiedExecutionRecord:
    """Verify an observation and build its immutable execution record."""

    invariant_results = evaluate_invariants(
        command=observation.command,
        pre_state=observation.pre_state,
        acknowledgement=observation.acknowledgement,
        post_state=observation.post_state,
        telemetry=observation.telemetry,
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
) -> VerifiedExecutionRecord:
    """Execute and independently verify the supported reference scenario."""

    observation = execute_reference_workflow(
        spacecraft=spacecraft,
        command=SUPPORTED_SCENARIO_COMMAND,
    )

    return build_verified_execution_record(
        execution_id=execution_id,
        executed_at=executed_at,
        observation=observation,
    )
