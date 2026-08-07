"""Tests for independent invariant evaluation."""

from orbirig.models import (
    Acknowledgement,
    InvariantId,
    OperatingMode,
    SetOperatingModeCommand,
    SpacecraftState,
    TelemetrySnapshot,
)
from orbirig.verification import (
    evaluate_invariants,
    evaluate_nominal_to_nominal_rejection_invariants,
)


def _evaluate(
    *,
    pre_mode: OperatingMode = OperatingMode.NOMINAL,
    accepted: bool = True,
    post_mode: OperatingMode = OperatingMode.SAFE,
    telemetry_mode: OperatingMode = OperatingMode.SAFE,
):
    return evaluate_invariants(
        command=SetOperatingModeCommand(
            target_mode=OperatingMode.SAFE,
        ),
        pre_state=SpacecraftState(operating_mode=pre_mode),
        acknowledgement=Acknowledgement(accepted=accepted),
        post_state=SpacecraftState(operating_mode=post_mode),
        telemetry=TelemetrySnapshot(
            operating_mode=telemetry_mode,
        ),
    )


def _failed_ids(results):
    return tuple(
        result.invariant_id
        for result in results
        if not result.passed
    )


def _result_by_id(results, invariant_id):
    return next(
        result
        for result in results
        if result.invariant_id is invariant_id
    )


def test_consistent_observations_pass_in_stable_order():
    results = _evaluate()

    assert tuple(result.invariant_id for result in results) == (
        InvariantId.PRE_STATE_MATCHES_EXPECTED,
        InvariantId.ACKNOWLEDGEMENT_IS_ACCEPTED,
        InvariantId.POST_STATE_MATCHES_REQUESTED_MODE,
        InvariantId.TELEMETRY_MATCHES_POST_STATE,
    )
    assert all(result.passed for result in results)


def test_verifier_detects_unexpected_pre_state():
    results = _evaluate(pre_mode=OperatingMode.SAFE)

    assert _failed_ids(results) == (
        InvariantId.PRE_STATE_MATCHES_EXPECTED,
    )

    failure = _result_by_id(
        results,
        InvariantId.PRE_STATE_MATCHES_EXPECTED,
    )
    assert failure.expected is OperatingMode.NOMINAL
    assert failure.actual is OperatingMode.SAFE


def test_verifier_detects_rejected_acknowledgement():
    results = _evaluate(accepted=False)

    assert _failed_ids(results) == (
        InvariantId.ACKNOWLEDGEMENT_IS_ACCEPTED,
    )

    failure = _result_by_id(
        results,
        InvariantId.ACKNOWLEDGEMENT_IS_ACCEPTED,
    )
    assert failure.expected is True
    assert failure.actual is False


def test_verifier_detects_post_state_mismatch():
    results = _evaluate(
        post_mode=OperatingMode.NOMINAL,
        telemetry_mode=OperatingMode.NOMINAL,
    )

    assert _failed_ids(results) == (
        InvariantId.POST_STATE_MATCHES_REQUESTED_MODE,
    )

    failure = _result_by_id(
        results,
        InvariantId.POST_STATE_MATCHES_REQUESTED_MODE,
    )
    assert failure.expected is OperatingMode.SAFE
    assert failure.actual is OperatingMode.NOMINAL


def test_verifier_detects_telemetry_mismatch():
    results = _evaluate(
        telemetry_mode=OperatingMode.NOMINAL,
    )

    assert _failed_ids(results) == (
        InvariantId.TELEMETRY_MATCHES_POST_STATE,
    )

    failure = _result_by_id(
        results,
        InvariantId.TELEMETRY_MATCHES_POST_STATE,
    )
    assert failure.expected is OperatingMode.SAFE
    assert failure.actual is OperatingMode.NOMINAL


def _evaluate_nominal_to_nominal_rejection(
    *,
    pre_mode: OperatingMode = OperatingMode.NOMINAL,
    accepted: bool = False,
    post_mode: OperatingMode = OperatingMode.NOMINAL,
    telemetry_mode: OperatingMode = OperatingMode.NOMINAL,
):
    return evaluate_nominal_to_nominal_rejection_invariants(
        pre_state=SpacecraftState(
            operating_mode=pre_mode,
        ),
        acknowledgement=Acknowledgement(
            accepted=accepted,
        ),
        post_state=SpacecraftState(
            operating_mode=post_mode,
        ),
        telemetry=TelemetrySnapshot(
            operating_mode=telemetry_mode,
        ),
    )


def test_expected_nominal_rejection_passes_in_stable_order():
    results = _evaluate_nominal_to_nominal_rejection()

    assert tuple(result.invariant_id for result in results) == (
        InvariantId.PRE_STATE_MATCHES_EXPECTED,
        InvariantId.ACKNOWLEDGEMENT_IS_REJECTED,
        InvariantId.POST_STATE_MATCHES_PRE_STATE,
        InvariantId.TELEMETRY_MATCHES_POST_STATE,
    )
    assert all(result.passed for result in results)


def test_nominal_rejection_verifier_detects_unexpected_pre_state():
    results = _evaluate_nominal_to_nominal_rejection(
        pre_mode=OperatingMode.SAFE,
        post_mode=OperatingMode.SAFE,
        telemetry_mode=OperatingMode.SAFE,
    )

    assert _failed_ids(results) == (
        InvariantId.PRE_STATE_MATCHES_EXPECTED,
    )


def test_nominal_rejection_verifier_detects_unexpected_acceptance():
    results = _evaluate_nominal_to_nominal_rejection(
        accepted=True,
    )

    assert _failed_ids(results) == (
        InvariantId.ACKNOWLEDGEMENT_IS_REJECTED,
    )

    failure = _result_by_id(
        results,
        InvariantId.ACKNOWLEDGEMENT_IS_REJECTED,
    )
    assert failure.expected is False
    assert failure.actual is True


def test_nominal_rejection_verifier_detects_state_mutation():
    results = _evaluate_nominal_to_nominal_rejection(
        post_mode=OperatingMode.SAFE,
        telemetry_mode=OperatingMode.SAFE,
    )

    assert _failed_ids(results) == (
        InvariantId.POST_STATE_MATCHES_PRE_STATE,
    )

    failure = _result_by_id(
        results,
        InvariantId.POST_STATE_MATCHES_PRE_STATE,
    )
    assert failure.expected is OperatingMode.NOMINAL
    assert failure.actual is OperatingMode.SAFE


def test_nominal_rejection_verifier_detects_telemetry_mismatch():
    results = _evaluate_nominal_to_nominal_rejection(
        telemetry_mode=OperatingMode.SAFE,
    )

    assert _failed_ids(results) == (
        InvariantId.TELEMETRY_MATCHES_POST_STATE,
    )

    failure = _result_by_id(
        results,
        InvariantId.TELEMETRY_MATCHES_POST_STATE,
    )
    assert failure.expected is OperatingMode.NOMINAL
    assert failure.actual is OperatingMode.SAFE
