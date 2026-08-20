"""Tests for subprocess observation collection and orchestration."""

import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

import pytest

import orbirig.execution as execution_module
import orbirig.subprocess_collection as collection_module
from orbirig.evidence import deserialize_execution_evidence
from orbirig.execution import execute_verified_subprocess_workflow
from orbirig.models import (
    ExecutionOutcome,
    InvariantId,
    OperatingMode,
    ScenarioId,
    SetOperatingModeCommand,
)
from orbirig.subprocess_collection import (
    ObservationCollectionError,
    collect_subprocess_observation,
)


FIXTURE_PATH = Path(__file__).parent / "fixtures" / "subprocess_observation_peer.py"
EXECUTED_AT = datetime(2026, 8, 20, 12, tzinfo=timezone.utc)
SAFE_COMMAND = SetOperatingModeCommand(target_mode=OperatingMode.SAFE)


def _argv(mode: str) -> list[str]:
    return [
        sys.executable,
        "-I",
        "-S",
        str(FIXTURE_PATH),
        mode,
    ]


def _collect(mode: str, *, timeout: float = 2.0):
    return collect_subprocess_observation(
        argv=_argv(mode),
        command=SAFE_COMMAND,
        timeout=timeout,
    )


@pytest.mark.parametrize("target_mode", tuple(OperatingMode))
def test_exact_compact_command_document_is_sent_for_each_target_mode(
    target_mode,
):
    command = SetOperatingModeCommand(target_mode=target_mode)

    observation = collect_subprocess_observation(
        argv=_argv("pass"),
        command=command,
        timeout=2.0,
    )

    assert observation.command == command


def test_successful_external_collection_reconstructs_observation():
    observation = _collect("pass")

    assert observation.command == SAFE_COMMAND
    assert observation.pre_state.operating_mode is OperatingMode.NOMINAL
    assert observation.acknowledgement.accepted is True
    assert observation.post_state.operating_mode is OperatingMode.SAFE
    assert observation.telemetry.operating_mode is OperatingMode.SAFE


def test_stderr_diagnostic_does_not_invalidate_successful_collection():
    observation = _collect("stderr-diagnostic")

    assert observation.command == SAFE_COMMAND
    assert observation.post_state.operating_mode is OperatingMode.SAFE
    assert observation.telemetry.operating_mode is OperatingMode.SAFE


def test_external_collection_is_repeatable_for_fixed_inputs():
    assert _collect("pass") == _collect("pass")


def test_verified_subprocess_workflow_produces_canonical_pass():
    record = execute_verified_subprocess_workflow(
        argv=_argv("pass"),
        timeout=2.0,
        execution_id="external-pass",
        executed_at=EXECUTED_AT,
    )

    assert record.outcome is ExecutionOutcome.PASS
    assert all(result.passed for result in record.invariant_results)


def test_verified_subprocess_workflow_uses_selected_scenario_command():
    record = execute_verified_subprocess_workflow(
        argv=_argv("pass"),
        timeout=2.0,
        execution_id="external-selected-scenario",
        executed_at=EXECUTED_AT,
        scenario_id=ScenarioId.NOMINAL_TO_NOMINAL_REJECTION,
    )

    assert record.scenario_id is ScenarioId.NOMINAL_TO_NOMINAL_REJECTION
    assert record.observation.command.target_mode is OperatingMode.NOMINAL


def test_behavioural_mismatch_produces_canonical_fail_with_diagnosis():
    record = execute_verified_subprocess_workflow(
        argv=_argv("telemetry-mismatch"),
        timeout=2.0,
        execution_id="external-fail",
        executed_at=EXECUTED_AT,
    )

    failures = tuple(result for result in record.invariant_results if not result.passed)

    assert record.outcome is ExecutionOutcome.FAIL
    assert len(failures) == 1
    assert failures[0].invariant_id is InvariantId.TELEMETRY_MATCHES_POST_STATE
    assert failures[0].expected is OperatingMode.SAFE
    assert failures[0].actual is OperatingMode.NOMINAL


def test_launch_failure_is_normalized(tmp_path):
    missing_executable = tmp_path / "missing-observation-peer"

    with pytest.raises(
        ObservationCollectionError,
        match="failed to launch observation subprocess",
    ) as raised:
        collect_subprocess_observation(
            argv=[str(missing_executable)],
            command=SAFE_COMMAND,
            timeout=2.0,
        )

    assert isinstance(raised.value.__cause__, FileNotFoundError)


def test_timeout_rejects_complete_stdout_before_deserialisation(
    monkeypatch,
):
    def fail_if_called(serialized):
        raise AssertionError(
            f"deserialiser received timed-out process output: {serialized}",
        )

    monkeypatch.setattr(
        collection_module,
        "deserialize_execution_evidence",
        fail_if_called,
    )

    with pytest.raises(
        ObservationCollectionError,
        match="observation subprocess timed out",
    ) as raised:
        _collect("timeout", timeout=1.0)

    timeout_error = raised.value.__cause__

    assert isinstance(timeout_error, subprocess.TimeoutExpired)
    assert timeout_error.stdout is not None
    timed_out_observation = deserialize_execution_evidence(
        timeout_error.stdout.decode("utf-8"),
    )
    assert timed_out_observation.command == SAFE_COMMAND


def test_non_zero_exit_is_a_collection_error():
    with pytest.raises(
        ObservationCollectionError,
        match="observation subprocess exited with status 7",
    ):
        _collect("non-zero")


def test_non_zero_exit_is_checked_before_utf8_decoding():
    with pytest.raises(
        ObservationCollectionError,
        match="observation subprocess exited with status 7",
    ) as raised:
        _collect("non-zero-invalid-utf8")

    assert raised.value.__cause__ is None


def test_non_zero_exit_rejects_valid_stdout_before_deserialisation(
    monkeypatch,
):
    def fail_if_called(serialized):
        raise AssertionError(
            f"deserialiser received failed-process output: {serialized}",
        )

    monkeypatch.setattr(
        collection_module,
        "deserialize_execution_evidence",
        fail_if_called,
    )

    with pytest.raises(
        ObservationCollectionError,
        match="observation subprocess exited with status 7",
    ):
        _collect("non-zero")


def test_invalid_utf8_is_rejected_before_deserialisation(monkeypatch):
    def fail_if_called(serialized):
        raise AssertionError(
            f"deserialiser received undecoded output: {serialized}",
        )

    monkeypatch.setattr(
        collection_module,
        "deserialize_execution_evidence",
        fail_if_called,
    )

    with pytest.raises(
        ObservationCollectionError,
        match="stdout is not valid UTF-8",
    ) as raised:
        _collect("invalid-utf8")

    assert isinstance(raised.value.__cause__, UnicodeDecodeError)


@pytest.mark.parametrize(
    ("mode", "cause_message"),
    [
        ("malformed", "invalid observation evidence JSON"),
        ("structurally-invalid", "unexpected fields: scenario_id"),
        ("stdout-contaminated", "invalid observation evidence JSON"),
    ],
)
def test_invalid_observation_evidence_is_normalized(
    mode,
    cause_message,
):
    with pytest.raises(
        ObservationCollectionError,
        match="subprocess returned invalid observation evidence",
    ) as raised:
        _collect(mode)

    assert isinstance(raised.value.__cause__, ValueError)
    assert cause_message in str(raised.value.__cause__)


def test_strict_deserialisation_precedes_returned_command_identity(
    monkeypatch,
):
    deserialiser_called = False
    strict_deserialiser = collection_module.deserialize_execution_evidence

    def track_deserialisation(serialized):
        nonlocal deserialiser_called
        deserialiser_called = True
        return strict_deserialiser(serialized)

    monkeypatch.setattr(
        collection_module,
        "deserialize_execution_evidence",
        track_deserialisation,
    )

    with pytest.raises(
        ObservationCollectionError,
        match="command does not match submitted command",
    ) as raised:
        _collect("command-mismatch")

    assert deserialiser_called is True
    assert raised.value.__cause__ is None


def test_collection_failure_does_not_build_a_verified_record(monkeypatch):
    builder_called = False

    def fail_if_called(**kwargs):
        nonlocal builder_called
        builder_called = True
        raise AssertionError(f"record builder called with {kwargs}")

    monkeypatch.setattr(
        execution_module,
        "build_verified_execution_record",
        fail_if_called,
    )

    with pytest.raises(ObservationCollectionError):
        execute_verified_subprocess_workflow(
            argv=_argv("malformed"),
            timeout=2.0,
            execution_id="must-not-exist",
            executed_at=EXECUTED_AT,
        )

    assert builder_called is False


def test_unexpected_deserialiser_error_is_not_misclassified(monkeypatch):
    def raise_unexpected_error(serialized):
        raise RuntimeError(f"unexpected parser defect for {serialized}")

    monkeypatch.setattr(
        collection_module,
        "deserialize_execution_evidence",
        raise_unexpected_error,
    )

    with pytest.raises(RuntimeError, match="unexpected parser defect"):
        _collect("pass")
