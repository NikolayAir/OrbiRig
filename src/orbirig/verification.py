"""Independent command-to-telemetry consistency verification."""

from collections.abc import Sequence
from datetime import datetime

from orbirig.models import (
    Acknowledgement,
    CommandExecutionObservation,
    ContinuityBoundaryResult,
    InvariantId,
    InvariantResult,
    OperatingMode,
    ScenarioId,
    SpacecraftState,
    TelemetrySnapshot,
    VerifiedExecutionRecord,
    VerifiedExecutionSequence,
    command_for_scenario,
)


def _evaluate_accepted_transition_invariants(
    *,
    expected_pre_mode: OperatingMode,
    expected_target_mode: OperatingMode,
    pre_state: SpacecraftState,
    acknowledgement: Acknowledgement,
    post_state: SpacecraftState,
    telemetry: TelemetrySnapshot,
) -> tuple[InvariantResult, ...]:
    """Evaluate shared accepted-transition invariants in a stable order."""

    return (
        InvariantResult(
            invariant_id=InvariantId.PRE_STATE_MATCHES_EXPECTED,
            passed=pre_state.operating_mode is expected_pre_mode,
            expected=expected_pre_mode,
            actual=pre_state.operating_mode,
        ),
        InvariantResult(
            invariant_id=InvariantId.ACKNOWLEDGEMENT_IS_ACCEPTED,
            passed=acknowledgement.accepted is True,
            expected=True,
            actual=acknowledgement.accepted,
        ),
        InvariantResult(
            invariant_id=InvariantId.POST_STATE_MATCHES_REQUESTED_MODE,
            passed=post_state.operating_mode is expected_target_mode,
            expected=expected_target_mode,
            actual=post_state.operating_mode,
        ),
        InvariantResult(
            invariant_id=InvariantId.TELEMETRY_MATCHES_POST_STATE,
            passed=telemetry.operating_mode is post_state.operating_mode,
            expected=post_state.operating_mode,
            actual=telemetry.operating_mode,
        ),
    )


def evaluate_nominal_to_safe_invariants(
    *,
    pre_state: SpacecraftState,
    acknowledgement: Acknowledgement,
    post_state: SpacecraftState,
    telemetry: TelemetrySnapshot,
) -> tuple[InvariantResult, ...]:
    """Evaluate NOMINAL-to-SAFE acceptance invariants in a stable order."""

    return _evaluate_accepted_transition_invariants(
        expected_pre_mode=OperatingMode.NOMINAL,
        expected_target_mode=OperatingMode.SAFE,
        pre_state=pre_state,
        acknowledgement=acknowledgement,
        post_state=post_state,
        telemetry=telemetry,
    )


def evaluate_safe_to_nominal_invariants(
    *,
    pre_state: SpacecraftState,
    acknowledgement: Acknowledgement,
    post_state: SpacecraftState,
    telemetry: TelemetrySnapshot,
) -> tuple[InvariantResult, ...]:
    """Evaluate SAFE-to-NOMINAL acceptance invariants in a stable order."""

    return _evaluate_accepted_transition_invariants(
        expected_pre_mode=OperatingMode.SAFE,
        expected_target_mode=OperatingMode.NOMINAL,
        pre_state=pre_state,
        acknowledgement=acknowledgement,
        post_state=post_state,
        telemetry=telemetry,
    )


def evaluate_nominal_to_nominal_rejection_invariants(
    *,
    pre_state: SpacecraftState,
    acknowledgement: Acknowledgement,
    post_state: SpacecraftState,
    telemetry: TelemetrySnapshot,
) -> tuple[InvariantResult, ...]:
    """Evaluate NOMINAL-to-NOMINAL rejection invariants in a stable order."""

    return (
        InvariantResult(
            invariant_id=InvariantId.PRE_STATE_MATCHES_EXPECTED,
            passed=pre_state.operating_mode is OperatingMode.NOMINAL,
            expected=OperatingMode.NOMINAL,
            actual=pre_state.operating_mode,
        ),
        InvariantResult(
            invariant_id=InvariantId.ACKNOWLEDGEMENT_IS_REJECTED,
            passed=acknowledgement.accepted is False,
            expected=False,
            actual=acknowledgement.accepted,
        ),
        InvariantResult(
            invariant_id=InvariantId.POST_STATE_MATCHES_PRE_STATE,
            passed=(
                post_state.operating_mode
                is pre_state.operating_mode
            ),
            expected=pre_state.operating_mode,
            actual=post_state.operating_mode,
        ),
        InvariantResult(
            invariant_id=InvariantId.TELEMETRY_MATCHES_POST_STATE,
            passed=(
                telemetry.operating_mode
                is post_state.operating_mode
            ),
            expected=post_state.operating_mode,
            actual=telemetry.operating_mode,
        ),
    )


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

    return VerifiedExecutionRecord(
        execution_id=execution_id,
        executed_at=executed_at,
        scenario_id=scenario_id,
        observation=observation,
        invariant_results=_evaluate_observation_invariants(
            scenario_id=scenario_id,
            observation=observation,
        ),
    )


def verify_execution_sequence(
    records: Sequence[VerifiedExecutionRecord],
) -> VerifiedExecutionSequence:
    """Verify operating-mode continuity in authoritative input order."""

    ordered_records = tuple(records)

    if len(ordered_records) < 2:
        raise ValueError(
            "verified execution sequence requires at least two records",
        )

    continuity_results = tuple(
        ContinuityBoundaryResult(
            previous_execution_id=previous.execution_id,
            next_execution_id=next_record.execution_id,
            expected_operating_mode=(
                previous.observation.post_state.operating_mode
            ),
            observed_operating_mode=(
                next_record.observation.pre_state.operating_mode
            ),
        )
        for previous, next_record in zip(
            ordered_records,
            ordered_records[1:],
        )
    )

    return VerifiedExecutionSequence(
        records=ordered_records,
        continuity_results=continuity_results,
    )
