"""Independent command-to-telemetry consistency verification."""

from orbirig.models import (
    Acknowledgement,
    InvariantId,
    InvariantResult,
    OperatingMode,
    SetOperatingModeCommand,
    SpacecraftState,
    TelemetrySnapshot,
)


def evaluate_invariants(
    *,
    command: SetOperatingModeCommand,
    pre_state: SpacecraftState,
    acknowledgement: Acknowledgement,
    post_state: SpacecraftState,
    telemetry: TelemetrySnapshot,
) -> tuple[InvariantResult, ...]:
    """Evaluate NOMINAL-to-SAFE acceptance invariants in a stable order."""

    return (
        InvariantResult(
            invariant_id=InvariantId.PRE_STATE_MATCHES_EXPECTED,
            passed=pre_state.operating_mode is OperatingMode.NOMINAL,
            expected=OperatingMode.NOMINAL,
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
            passed=post_state.operating_mode is command.target_mode,
            expected=command.target_mode,
            actual=post_state.operating_mode,
        ),
        InvariantResult(
            invariant_id=InvariantId.TELEMETRY_MATCHES_POST_STATE,
            passed=telemetry.operating_mode is post_state.operating_mode,
            expected=post_state.operating_mode,
            actual=telemetry.operating_mode,
        ),
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
