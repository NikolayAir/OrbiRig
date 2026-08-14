"""Independent command-to-telemetry consistency verification."""

from collections.abc import Sequence

from orbirig.models import (
    Acknowledgement,
    ContinuityBoundaryResult,
    InvariantId,
    InvariantResult,
    OperatingMode,
    SpacecraftState,
    TelemetrySnapshot,
    VerifiedExecutionRecord,
    VerifiedExecutionSequence,
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
