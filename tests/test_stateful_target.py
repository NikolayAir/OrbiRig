"""Real subprocess commands against an independent, file-backed test target."""

import json
import runpy
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path

import pytest

import orbirig.execution as execution_module
from orbirig.evidence import (
    deserialize_verified_execution_evidence,
    deserialize_verified_execution_sequence_evidence,
    serialize_verified_execution_evidence,
    serialize_verified_execution_sequence_evidence,
)
from orbirig.execution import execute_verified_subprocess_workflow
from orbirig.models import ExecutionOutcome, InvariantId, OperatingMode, ScenarioId
from orbirig.subprocess_collection import ObservationCollectionError
from orbirig.verification import verify_execution_sequence

TARGET = Path(__file__).resolve().parents[1] / "examples/stateful_target.py"
EXECUTED_AT = datetime(2026, 11, 1, tzinfo=UTC)
SAFE_COMMAND = b'{"command_type":"SET_OPERATING_MODE","target_mode":"SAFE"}\n'


@pytest.fixture
def state_file(tmp_path):
    path = tmp_path / "target-state.json"
    path.write_bytes(b'{ "operating_mode" : "NOMINAL" }\n')
    return path


def _argv(state_file: Path, *, stale: bool = False) -> list[str]:
    # Isolated mode and disabled site packages ensure that the target cannot
    # obtain its behaviour from an installed OrbiRig or another dependency.
    return [
        sys.executable, "-I", "-S", str(TARGET), "--state-file", str(state_file),
        *(["--stale-telemetry"] if stale else []),
    ]


def _execute(state_file: Path, scenario: ScenarioId, execution_id: str, *, stale: bool = False):
    return execute_verified_subprocess_workflow(
        argv=_argv(state_file, stale=stale), timeout=5.0,
        execution_id=execution_id, executed_at=EXECUTED_AT, scenario_id=scenario,
    )


def _raw(state_file: Path, command: bytes = SAFE_COMMAND):
    return subprocess.run(
        _argv(state_file), input=command, capture_output=True, timeout=5.0, check=False,
    )


def test_separate_processes_preserve_state_and_produce_a_continuous_passing_sequence(state_file):
    first = _execute(state_file, ScenarioId.NOMINAL_TO_SAFE_MODE, "to-safe")
    assert json.loads(state_file.read_bytes()) == {"operating_mode": "SAFE"}
    second = _execute(state_file, ScenarioId.SAFE_TO_NOMINAL_MODE, "to-nominal")
    assert json.loads(state_file.read_bytes()) == {"operating_mode": "NOMINAL"}

    # These expectations are written independently of the target's output.
    for record, expected in [(first, ("NOMINAL", True, "SAFE", "SAFE")),
                             (second, ("SAFE", True, "NOMINAL", "NOMINAL"))]:
        observation = record.observation
        assert (
            observation.pre_state.operating_mode,
            observation.acknowledgement.accepted,
            observation.post_state.operating_mode,
            observation.telemetry.operating_mode,
        ) == expected
        assert record.outcome is ExecutionOutcome.PASS
        assert tuple((result.expected, result.actual, result.passed) for result in record.invariant_results) == tuple(
            (value, value, True) for value in expected
        )

    sequence = verify_execution_sequence([first, second])
    assert sequence.records == (first, second)
    assert sequence.outcome is ExecutionOutcome.PASS
    assert len(sequence.continuity_results) == 1
    boundary = sequence.continuity_results[0]
    assert (boundary.previous_execution_id, boundary.next_execution_id) == ("to-safe", "to-nominal")
    assert boundary.expected_operating_mode is OperatingMode.SAFE
    assert boundary.observed_operating_mode is OperatingMode.SAFE
    assert boundary.passed is True
    saved = serialize_verified_execution_sequence_evidence(sequence)
    assert deserialize_verified_execution_sequence_evidence(saved) == sequence


@pytest.mark.parametrize("stale", [False, True])
def test_expected_rejection_passes_without_rewriting_state(state_file, stale):
    before = state_file.read_bytes()
    record = _execute(state_file, ScenarioId.NOMINAL_TO_NOMINAL_REJECTION, "reject-no-change", stale=stale)

    assert record.observation.command.target_mode is OperatingMode.NOMINAL
    assert record.observation.pre_state.operating_mode is OperatingMode.NOMINAL
    assert record.observation.acknowledgement.accepted is False
    assert record.observation.post_state.operating_mode is OperatingMode.NOMINAL
    assert record.observation.telemetry.operating_mode is OperatingMode.NOMINAL
    assert record.outcome is ExecutionOutcome.PASS
    assert all(result.passed for result in record.invariant_results)
    assert state_file.read_bytes() == before


@pytest.mark.parametrize(("initial", "scenario", "following", "expected", "actual"), [
    ("NOMINAL", ScenarioId.NOMINAL_TO_SAFE_MODE, ScenarioId.SAFE_TO_NOMINAL_MODE, OperatingMode.SAFE, OperatingMode.NOMINAL),
    ("SAFE", ScenarioId.SAFE_TO_NOMINAL_MODE, ScenarioId.NOMINAL_TO_SAFE_MODE, OperatingMode.NOMINAL, OperatingMode.SAFE),
])
def test_stale_telemetry_fails_but_the_next_process_sees_committed_state(
    state_file, initial, scenario, following, expected, actual,
):
    state_file.write_text(json.dumps({"operating_mode": initial}), encoding="utf-8")
    failed = _execute(state_file, scenario, "stale-telemetry", stale=True)

    assert failed.outcome is ExecutionOutcome.FAIL
    assert failed.observation.acknowledgement.accepted is True
    assert failed.observation.post_state.operating_mode is expected
    assert failed.observation.telemetry.operating_mode is actual
    assert tuple(result.passed for result in failed.invariant_results) == (True, True, True, False)
    check = failed.invariant_results[3]
    assert check.invariant_id is InvariantId.TELEMETRY_MATCHES_POST_STATE
    assert check.expected is expected
    assert check.actual is actual
    assert json.loads(state_file.read_bytes()) == {"operating_mode": expected}
    assert deserialize_verified_execution_evidence(serialize_verified_execution_evidence(failed)) == failed

    following_record = _execute(state_file, following, "after-fault")
    assert following_record.observation.pre_state.operating_mode is expected
    assert following_record.outcome is ExecutionOutcome.PASS
    assert json.loads(state_file.read_bytes()) == {"operating_mode": actual}
    sequence = verify_execution_sequence([failed, following_record])
    assert sequence.continuity_results[0].passed is True
    assert sequence.outcome is ExecutionOutcome.FAIL
    assert deserialize_verified_execution_sequence_evidence(
        serialize_verified_execution_sequence_evidence(sequence),
    ) == sequence


def test_valid_state_differing_from_the_selected_scenario_is_verified_instead_of_reset(state_file):
    before = b'{ "operating_mode" : "SAFE" }\n'
    state_file.write_bytes(before)
    record = _execute(state_file, ScenarioId.NOMINAL_TO_SAFE_MODE, "unexpected-pre-state")

    assert record.observation.pre_state.operating_mode is OperatingMode.SAFE
    assert record.observation.acknowledgement.accepted is False
    assert record.observation.post_state.operating_mode is OperatingMode.SAFE
    assert tuple(result.passed for result in record.invariant_results) == (False, False, True, True)
    assert record.outcome is ExecutionOutcome.FAIL
    assert state_file.read_bytes() == before


def test_target_parses_commands_rather_than_matching_a_fixed_byte_string(state_file):
    completed = _raw(state_file, b' {\n "target_mode": "SAFE", "command_type": "SET_OPERATING_MODE"\n}\n')
    assert completed.returncode == 0
    assert completed.stderr == b""
    assert json.loads(completed.stdout) == {
        "evidence_format_version": 1,
        "command": {"command_type": "SET_OPERATING_MODE", "target_mode": "SAFE"},
        "pre_state": {"operating_mode": "NOMINAL"},
        "acknowledgement": {"accepted": True},
        "post_state": {"operating_mode": "SAFE"},
        "telemetry": {"operating_mode": "SAFE"},
    }
    assert json.loads(state_file.read_bytes()) == {"operating_mode": "SAFE"}


def test_separate_state_files_do_not_share_state(state_file, tmp_path):
    other = tmp_path / "other-state.json"
    other.write_bytes(state_file.read_bytes())
    _execute(state_file, ScenarioId.NOMINAL_TO_SAFE_MODE, "first-target")
    record = _execute(other, ScenarioId.NOMINAL_TO_NOMINAL_REJECTION, "second-target")

    assert record.outcome is ExecutionOutcome.PASS
    assert json.loads(other.read_bytes()) == {"operating_mode": "NOMINAL"}
    assert json.loads(state_file.read_bytes()) == {"operating_mode": "SAFE"}


@pytest.mark.parametrize("command", [
    b"", b"{", b"[]", b"{}", SAFE_COMMAND + SAFE_COMMAND,
    b'{"command_type":"RESET","target_mode":"SAFE"}',
    b'{"command_type":"SET_OPERATING_MODE","target_mode":"UNKNOWN"}',
    b'{"command_type":"SET_OPERATING_MODE","target_mode":true}',
    b'{"command_type":"SET_OPERATING_MODE","target_mode":"SAFE","extra":1}',
    b'{"command_type":"SET_OPERATING_MODE","target_mode":"NOMINAL","target_mode":"SAFE"}',
    b'{"command_type":"SET_OPERATING_MODE","target_mode":"NOMINAL","target_\\u006dode":"SAFE"}',
    b"\xff",
])
def test_invalid_command_produces_no_observation_and_preserves_state(state_file, command):
    # Use SAFE so an erroneous reset to the initial NOMINAL mode is detected too.
    state_file.write_bytes(b'{ "operating_mode" : "SAFE" }\n')
    before = state_file.read_bytes()
    completed = _raw(state_file, command)

    assert completed.returncode == 2
    assert completed.stdout == b""
    assert b"stateful target:" in completed.stderr
    assert state_file.read_bytes() == before


@pytest.mark.parametrize("data", [
    b"", b"{", b"[]", b"{}", b'{"operating_mode":"UNKNOWN"}',
    b'{"operating_mode":true}', b'{"operating_mode":"NOMINAL","extra":1}',
    b'{"operating_mode":"SAFE","operating_mode":"NOMINAL"}',
    b'{"operating_mode":"SAFE","operating_\\u006dode":"NOMINAL"}', b"\xff",
])
def test_corrupt_state_is_not_repaired_and_cannot_produce_a_verified_record(state_file, data, monkeypatch):
    state_file.write_bytes(data)
    completed = _raw(state_file)
    assert completed.returncode == 2
    assert completed.stdout == b""
    assert b"stored" in completed.stderr

    def unexpected_record(**kwargs):
        raise AssertionError("a target error must not produce a PASS or FAIL record")

    monkeypatch.setattr(execution_module, "build_verified_execution_record", unexpected_record)
    with pytest.raises(ObservationCollectionError, match="exited with status 2"):
        _execute(state_file, ScenarioId.NOMINAL_TO_SAFE_MODE, "corrupt-state")
    assert state_file.read_bytes() == data


def test_missing_state_is_an_error_instead_of_implicit_initialisation(tmp_path):
    missing = tmp_path / "missing.json"
    with pytest.raises(ObservationCollectionError, match="exited with status 2"):
        _execute(missing, ScenarioId.NOMINAL_TO_SAFE_MODE, "missing-state")
    assert not missing.exists()


@pytest.mark.parametrize("stage", ["write", "replace"])
def test_failed_state_commit_preserves_original_bytes_and_removes_temporary_file(state_file, monkeypatch, stage):
    target = runpy.run_path(str(TARGET))
    before = state_file.read_bytes()

    if stage == "replace":
        def fail_replace(*args):
            raise OSError("simulated replacement error")
        monkeypatch.setattr(target["os"], "replace", fail_replace)
    else:
        create = target["tempfile"].NamedTemporaryFile

        def create_with_failed_write(*args, **kwargs):
            stream = create(*args, **kwargs)
            write = stream.write

            def fail_write(text):
                write(text[:5])
                raise OSError("simulated write error")

            stream.write = fail_write
            return stream

        monkeypatch.setattr(target["tempfile"], "NamedTemporaryFile", create_with_failed_write)

    with pytest.raises(OSError, match="simulated"):
        target["_save_mode"](state_file, "SAFE")
    assert state_file.read_bytes() == before
    assert list(state_file.parent.iterdir()) == [state_file]
