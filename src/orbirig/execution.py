"""Verified execution construction and orchestration."""

from collections.abc import Sequence
from datetime import datetime

from orbirig.models import ScenarioId, VerifiedExecutionRecord, command_for_scenario
from orbirig.reference_sut import ReferenceSpacecraft
from orbirig.subprocess_collection import collect_subprocess_observation
from orbirig.verification import build_verified_execution_record
from orbirig.workflow import execute_reference_workflow


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


def execute_verified_subprocess_workflow(
    *,
    argv: Sequence[str],
    timeout: float,
    execution_id: str,
    executed_at: datetime,
    scenario_id: ScenarioId = ScenarioId.NOMINAL_TO_SAFE_MODE,
) -> VerifiedExecutionRecord:
    """Collect and canonically verify one subprocess observation."""

    command = command_for_scenario(scenario_id)
    observation = collect_subprocess_observation(
        argv=argv,
        command=command,
        timeout=timeout,
    )

    return build_verified_execution_record(
        execution_id=execution_id,
        executed_at=executed_at,
        scenario_id=scenario_id,
        observation=observation,
    )
