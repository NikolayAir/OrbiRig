"""Opt-in interoperability checks against the real, independently compiled C# target."""

import json
import os
import shutil
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

PROJECT = Path(__file__).resolve().parents[1] / "examples/dotnet_stateful_target/StatefulTarget.csproj"
EXECUTED_AT = datetime(2026, 11, 1, tzinfo=UTC)
SAFE_COMMAND = b'{"command_type":"SET_OPERATING_MODE","target_mode":"SAFE"}\n'


@pytest.fixture(scope="module")
def target(tmp_path_factory):
    # Do not probe SDKs or build during ordinary Python-only development. CI
    # opts in explicitly, so a missing tool or broken build cannot become a skip.
    if os.environ.get("ORBIRIG_TEST_DOTNET") != "1":
        pytest.skip("set ORBIRIG_TEST_DOTNET=1 to build and verify the .NET example")
    if sys.platform not in ("darwin", "linux"):
        pytest.fail("the .NET example requires macOS or Linux with GNU stat")
    dotnet = shutil.which("dotnet")
    assert dotnet is not None, "ORBIRIG_TEST_DOTNET=1 requires the .NET 10 SDK on PATH"
    build_dir = tmp_path_factory.mktemp("dotnet-target-build")
    output = build_dir / "app"
    completed = subprocess.run(
        [dotnet, "build", str(PROJECT), "--configuration", "Release", "--nologo",
         "--disable-build-servers", "--artifacts-path", str(build_dir / "artifacts"),
         "--output", str(output)],
        # Resolve the example's global.json even if a newer SDK is installed.
        cwd=PROJECT.parent, capture_output=True, text=True, timeout=120, check=False,
    )
    assert completed.returncode == 0, completed.stdout + completed.stderr
    dll = output / "StatefulTarget.dll"
    assert dll.is_file()
    return [dotnet, str(dll)]


@pytest.fixture
def state_file(tmp_path):
    state = tmp_path / "state.json"
    state.write_bytes(b'{ "operating_mode" : "NOMINAL" }\n')
    return state


def _argv(target, state_file, *flags):
    return [*target, "--state-file", str(state_file), *flags]


def _execute(target, state_file, scenario, execution_id="dotnet-execution", *flags):
    return execute_verified_subprocess_workflow(
        argv=_argv(target, state_file, *flags), timeout=10.0,
        execution_id=execution_id, executed_at=EXECUTED_AT, scenario_id=scenario,
    )


def _raw(target, state_file, command=SAFE_COMMAND, *flags, **kwargs):
    return subprocess.run(
        _argv(target, state_file, *flags), input=command,
        capture_output=True, timeout=10.0, check=False, **kwargs,
    )


def _reported(record):
    observation = record.observation
    return (
        observation.pre_state.operating_mode, observation.acknowledgement.accepted,
        observation.post_state.operating_mode, observation.telemetry.operating_mode,
    )


def _assert_error(completed):
    # Status 2 and the prefix come only from the target's own error handling, so
    # a runtime start-up failure or an unhandled exception cannot pass as one.
    assert completed.returncode == 2
    assert completed.stdout == b""
    assert b"dotnet stateful target:" in completed.stderr


def test_separate_processes_pass_a_round_trip_with_explicit_continuity(target, state_file):
    first = _execute(target, state_file, ScenarioId.NOMINAL_TO_SAFE_MODE, "to-safe")
    assert json.loads(state_file.read_bytes()) == {"operating_mode": "SAFE"}
    second = _execute(target, state_file, ScenarioId.SAFE_TO_NOMINAL_MODE, "to-nominal")
    assert json.loads(state_file.read_bytes()) == {"operating_mode": "NOMINAL"}

    # Expectations come from the test, never from the target or ReferenceSpacecraft.
    for record, expected in [(first, ("NOMINAL", True, "SAFE", "SAFE")),
                             (second, ("SAFE", True, "NOMINAL", "NOMINAL"))]:
        assert _reported(record) == expected
        assert record.outcome is ExecutionOutcome.PASS
        assert tuple((check.expected, check.actual, check.passed) for check in record.invariant_results) == tuple(
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
    assert deserialize_verified_execution_sequence_evidence(
        serialize_verified_execution_sequence_evidence(sequence),
    ) == sequence


@pytest.mark.parametrize("flags", [
    (), ("--stale-telemetry",), ("--fail-after-commit",),
    ("--stale-telemetry", "--fail-after-commit"),
])
def test_expected_rejection_passes_without_rewriting_state(target, state_file, flags):
    before = state_file.read_bytes()
    inode = state_file.stat().st_ino
    record = _execute(target, state_file, ScenarioId.NOMINAL_TO_NOMINAL_REJECTION, "rejected", *flags)

    assert _reported(record) == ("NOMINAL", False, "NOMINAL", "NOMINAL")
    assert record.outcome is ExecutionOutcome.PASS
    assert all(check.passed for check in record.invariant_results)
    assert state_file.read_bytes() == before
    assert state_file.stat().st_ino == inode


@pytest.mark.parametrize("mode", ["NOMINAL", "SAFE"])
def test_response_fault_is_ignored_for_rejection_without_diagnostics(target, state_file, mode):
    before = f'{{ "operating_mode" : "{mode}" }}\n'.encode()
    state_file.write_bytes(before)
    command = json.dumps({"command_type": "SET_OPERATING_MODE", "target_mode": mode}).encode()
    completed = _raw(target, state_file, command, "--fail-after-commit")
    assert completed.returncode == 0
    assert completed.stderr == b""
    assert json.loads(completed.stdout)["acknowledgement"] == {"accepted": False}
    assert state_file.read_bytes() == before


@pytest.mark.parametrize("flags", [
    ("--fail-after-commit",), ("--stale-telemetry", "--fail-after-commit"),
])
@pytest.mark.parametrize(("initial", "requested"), [("NOMINAL", "SAFE"), ("SAFE", "NOMINAL")])
def test_response_fault_returns_no_observation_after_committing(target, state_file, initial, requested, flags):
    state_file.write_text(json.dumps({"operating_mode": initial}), encoding="utf-8")
    command = json.dumps({"command_type": "SET_OPERATING_MODE", "target_mode": requested}).encode()
    completed = _raw(target, state_file, command, *flags)

    assert completed.returncode == 3
    assert completed.stdout == b""
    assert completed.stderr.splitlines() == [
        b"dotnet stateful target: simulated response failure after state commit",
    ]
    assert json.loads(state_file.read_bytes()) == {"operating_mode": requested}
    assert list(state_file.parent.iterdir()) == [state_file]


def test_closed_output_pipe_is_reported_after_the_change_is_saved(target, state_file):
    # A real delivery failure, unlike the simulated --fail-after-commit fault. The
    # reader is gone before the target writes, as when a collecting process exits early.
    read_end, write_end = os.pipe()
    os.close(read_end)
    try:
        completed = subprocess.run(
            _argv(target, state_file), input=SAFE_COMMAND, stdout=write_end,
            stderr=subprocess.PIPE, timeout=10.0, check=False,
        )
    finally:
        os.close(write_end)

    assert completed.returncode == 2
    assert b"dotnet stateful target:" in completed.stderr
    # The change was committed before delivery, and the error does not undo it.
    assert json.loads(state_file.read_bytes()) == {"operating_mode": "SAFE"}
    assert list(state_file.parent.iterdir()) == [state_file]


def test_output_appended_to_a_file_keeps_the_earlier_content(target, state_file, tmp_path):
    # On macOS a FileStream on a file writes at its own offset and replaces the earlier
    # line; Linux appends regardless, so only macOS can fail here. Open the descriptor
    # as a shell does for >>: Python's open(..., "ab") would first move the shared
    # offset to the end of the file and hide that mistake.
    output = tmp_path / "output.txt"
    output.write_bytes(b"earlier\n")
    descriptor = os.open(output, os.O_WRONLY | os.O_APPEND)
    try:
        completed = subprocess.run(
            _argv(target, state_file), input=SAFE_COMMAND, stdout=descriptor,
            stderr=subprocess.PIPE, timeout=10.0, check=False,
        )
    finally:
        os.close(descriptor)

    assert completed.returncode == 0
    assert completed.stderr == b""
    earlier, observation = output.read_bytes().splitlines()
    assert earlier == b"earlier"
    assert json.loads(observation)["post_state"] == {"operating_mode": "SAFE"}
    assert set(tmp_path.iterdir()) == {state_file, output}


@pytest.mark.parametrize("flags", [
    ("--fail-after-commit",), ("--stale-telemetry", "--fail-after-commit"),
])
@pytest.mark.parametrize(("initial", "scenario", "following", "committed"), [
    ("NOMINAL", ScenarioId.NOMINAL_TO_SAFE_MODE, ScenarioId.SAFE_TO_NOMINAL_MODE, "SAFE"),
    ("SAFE", ScenarioId.SAFE_TO_NOMINAL_MODE, ScenarioId.NOMINAL_TO_SAFE_MODE, "NOMINAL"),
])
def test_post_commit_collection_error_builds_no_record_and_the_next_command_passes(
    target, state_file, monkeypatch, initial, scenario, following, committed, flags,
):
    state_file.write_text(json.dumps({"operating_mode": initial}), encoding="utf-8")

    def unexpected_record(**kwargs):
        raise AssertionError("a response failure must not produce a PASS or FAIL record")

    # Fail if collection reaches verification at all, not only if a record is returned.
    with monkeypatch.context() as verification:
        verification.setattr(execution_module, "build_verified_execution_record", unexpected_record)
        with pytest.raises(ObservationCollectionError, match="exited with status 3"):
            _execute(target, state_file, scenario, "response-failure", *flags)
    assert json.loads(state_file.read_bytes()) == {"operating_mode": committed}

    following_record = _execute(target, state_file, following, "after-response-failure")
    assert _reported(following_record) == (committed, True, initial, initial)
    assert following_record.outcome is ExecutionOutcome.PASS
    assert tuple((check.expected, check.actual, check.passed) for check in following_record.invariant_results) == (
        (committed, committed, True), (True, True, True),
        (initial, initial, True), (initial, initial, True),
    )
    assert json.loads(state_file.read_bytes()) == {"operating_mode": initial}


@pytest.mark.parametrize("source", ["command", "state"])
def test_response_fault_does_not_bypass_validation(target, state_file, source):
    command = SAFE_COMMAND
    if source == "command":
        command = b'{"command_type":"SET_OPERATING_MODE","target_mode":true}'
    else:
        state_file.write_bytes(b'{"operating_mode":true}')
    before = state_file.read_bytes()
    completed = _raw(target, state_file, command, "--fail-after-commit")
    _assert_error(completed)
    assert b"after state commit" not in completed.stderr
    assert state_file.read_bytes() == before


@pytest.mark.parametrize(("initial", "scenario", "following", "wanted", "stale"), [
    ("NOMINAL", ScenarioId.NOMINAL_TO_SAFE_MODE, ScenarioId.SAFE_TO_NOMINAL_MODE, "SAFE", "NOMINAL"),
    ("SAFE", ScenarioId.SAFE_TO_NOMINAL_MODE, ScenarioId.NOMINAL_TO_SAFE_MODE, "NOMINAL", "SAFE"),
])
def test_stale_telemetry_is_valid_fail_evidence_and_state_is_committed(
    target, state_file, initial, scenario, following, wanted, stale,
):
    state_file.write_text(json.dumps({"operating_mode": initial}), encoding="utf-8")
    record = _execute(target, state_file, scenario, "stale", "--stale-telemetry")

    assert _reported(record) == (initial, True, wanted, stale)
    assert record.outcome is ExecutionOutcome.FAIL
    assert tuple(check.passed for check in record.invariant_results) == (True, True, True, False)
    check = record.invariant_results[3]
    assert check.invariant_id is InvariantId.TELEMETRY_MATCHES_POST_STATE
    assert (check.expected, check.actual) == (wanted, stale)
    assert json.loads(state_file.read_bytes()) == {"operating_mode": wanted}
    assert deserialize_verified_execution_evidence(serialize_verified_execution_evidence(record)) == record

    next_record = _execute(target, state_file, following, "after-stale")
    assert _reported(next_record) == (wanted, True, initial, initial)
    assert next_record.outcome is ExecutionOutcome.PASS
    sequence = verify_execution_sequence([record, next_record])
    assert sequence.continuity_results[0].passed is True
    assert sequence.outcome is ExecutionOutcome.FAIL


def test_unexpected_valid_state_is_verified_without_reset_or_scenario_inference(target, state_file):
    before = b'{ "operating_mode" : "SAFE" }\n'
    state_file.write_bytes(before)
    record = _execute(target, state_file, ScenarioId.NOMINAL_TO_SAFE_MODE)

    assert _reported(record) == ("SAFE", False, "SAFE", "SAFE")
    assert tuple(check.passed for check in record.invariant_results) == (False, False, True, True)
    assert record.outcome is ExecutionOutcome.FAIL
    assert state_file.read_bytes() == before


def test_repeated_isolated_runs_produce_identical_verified_evidence(target, tmp_path):
    results = []
    for index in range(2):
        state_file = tmp_path / f"state-{index}.json"
        state_file.write_bytes(b'{"operating_mode":"NOMINAL"}\n')
        records = [
            _execute(target, state_file, ScenarioId.NOMINAL_TO_SAFE_MODE, "to-safe"),
            _execute(target, state_file, ScenarioId.SAFE_TO_NOMINAL_MODE, "to-nominal"),
        ]
        assert [_reported(record) for record in records] == [
            ("NOMINAL", True, "SAFE", "SAFE"), ("SAFE", True, "NOMINAL", "NOMINAL"),
        ]
        sequence = verify_execution_sequence(records)
        assert sequence.outcome is ExecutionOutcome.PASS
        results.append(serialize_verified_execution_sequence_evidence(sequence))
    assert results[0] == results[1]


def test_state_files_are_independent(target, state_file, tmp_path):
    other = tmp_path / "other.json"
    other.write_bytes(state_file.read_bytes())
    _execute(target, state_file, ScenarioId.NOMINAL_TO_SAFE_MODE)
    record = _execute(target, other, ScenarioId.NOMINAL_TO_NOMINAL_REJECTION)
    assert record.outcome is ExecutionOutcome.PASS
    assert json.loads(other.read_bytes()) == {"operating_mode": "NOMINAL"}
    assert json.loads(state_file.read_bytes()) == {"operating_mode": "SAFE"}


def test_json_field_order_whitespace_and_escaped_names_are_accepted(target, state_file):
    completed = _raw(target, state_file, b' {\n "target_mode":"SAFE", "command_\\u0074ype":"SET_OPERATING_MODE"\n}\n')
    assert completed.returncode == 0
    assert completed.stderr == b""
    assert completed.stdout.endswith(b"\n")
    assert json.loads(completed.stdout) == {
        "evidence_format_version": 1,
        "command": {"command_type": "SET_OPERATING_MODE", "target_mode": "SAFE"},
        "pre_state": {"operating_mode": "NOMINAL"},
        "acknowledgement": {"accepted": True},
        "post_state": {"operating_mode": "SAFE"},
        "telemetry": {"operating_mode": "SAFE"},
    }


@pytest.mark.parametrize("command", [
    b"", b"{", b"[]", b"null", b"{}", SAFE_COMMAND + SAFE_COMMAND,
    b'{"command_type":"RESET","target_mode":"SAFE"}',
    b'{"command_type":true,"target_mode":"SAFE"}',
    b'{"Command_type":"SET_OPERATING_MODE","target_mode":"SAFE"}',
    b'{"command_type":"SET_OPERATING_MODE","target_mode":"safe"}',
    b'{"command_type":"SET_OPERATING_MODE","target_mode":true}',
    b'{"command_type":"SET_OPERATING_MODE","target_mode":null}',
    b'{"command_type":"SET_OPERATING_MODE","target_mode":"SAFE","extra":1}',
    b'{"command_type":"SET_OPERATING_MODE","target_mode":"NOMINAL","target_mode":"SAFE"}',
    b'{"command_type":"SET_OPERATING_MODE","target_mode":"NOMINAL","target_\\u006dode":"SAFE"}',
    b'{"command_type":"SET_OPERATING_MODE","target_mode":{"x":1,"x":2}}',
    b'{"command_type":"SET_OPERATING_MODE","target_mode":"SAFE",}',
    b'{/* comment */"command_type":"SET_OPERATING_MODE","target_mode":"SAFE"}',
    b'{"command_type":"SET_OPERATING_MODE","target_mode":"SA\xffFE"}',
    b'{"command_type":"SET_OPERATING_MODE","target_mode":"\\ud800"}',
    b"\xef\xbb\xbf" + SAFE_COMMAND,
])
def test_invalid_command_preserves_the_exact_state(target, state_file, command):
    # Starting in SAFE also detects an accidental reset to the default NOMINAL.
    state_file.write_bytes(b'{ "operating_mode" : "SAFE" }\n')
    before = state_file.read_bytes()
    _assert_error(_raw(target, state_file, command))
    assert state_file.read_bytes() == before
    assert list(state_file.parent.iterdir()) == [state_file]


@pytest.mark.parametrize("data", [
    b"", b"{", b"[]", b"null", b"{}", b'{"operating_mode":"UNKNOWN"}',
    b'{"operating_mode":true}', b'{"operating_mode":0}', b'{"operating_mode":null}',
    b'{"Operating_mode":"SAFE"}', b'{"operating_mode":"NOMINAL","extra":1}',
    b'{"operating_mode":"SAFE","operating_mode":"NOMINAL"}',
    b'{"operating_mode":"SAFE","operating_\\u006dode":"NOMINAL"}',
    b'{"operating_mode":{"x":1,"x":2}}', b'{"operating_mode":"NOMINAL",}',
    b'{"operating_mode":"NO\xffMINAL"}', b'{"operating_mode":"\\ud800"}',
    b'{"operating_mode":"NOMINAL"} {}',
    b"\xef\xbb\xbf" + b'{"operating_mode":"NOMINAL"}', b'{/* comment */"operating_mode":"NOMINAL"}',
])
def test_invalid_state_is_a_collection_error_without_a_verification_record(
    target, state_file, data, monkeypatch,
):
    state_file.write_bytes(data)
    _assert_error(_raw(target, state_file))

    def unexpected_record(**kwargs):
        raise AssertionError("invalid stored state must not produce a PASS or FAIL record")

    monkeypatch.setattr(execution_module, "build_verified_execution_record", unexpected_record)
    with pytest.raises(ObservationCollectionError, match="exited with status 2"):
        _execute(target, state_file, ScenarioId.NOMINAL_TO_SAFE_MODE)
    assert state_file.read_bytes() == data
    assert list(state_file.parent.iterdir()) == [state_file]


@pytest.mark.parametrize("source", ["command", "state"])
def test_nested_duplicate_names_are_rejected_by_the_json_reader(target, state_file, source):
    nested = b'{"x":1,"\\u0078":2}'
    if source == "command":
        command = b'{"command_type":"SET_OPERATING_MODE","target_mode":' + nested + b'}'
    else:
        state_file.write_bytes(b'{"operating_mode":' + nested + b'}')
        command = SAFE_COMMAND
    before = state_file.read_bytes()
    completed = _raw(target, state_file, command)
    _assert_error(completed)
    # An invalid mode would also be rejected. Require the duplicate-field error
    # to establish that validation reached nested objects before interpreting them.
    assert b"without repeated field names" in completed.stderr
    assert state_file.read_bytes() == before


def test_missing_state_is_never_created(target, tmp_path):
    state = tmp_path / "missing.json"
    _assert_error(_raw(target, state))
    assert not state.exists()
    assert list(tmp_path.iterdir()) == []


@pytest.mark.parametrize("kind", ["symlink", "dangling", "hardlink", "directory", "fifo", "socket"])
def test_linked_and_special_state_paths_are_rejected_before_reading(target, state_file, tmp_path, kind, monkeypatch):
    import socket

    path = tmp_path / "unsafe-state"
    before = state_file.read_bytes()
    inode = state_file.stat().st_ino
    server = None
    if kind == "symlink":
        path.symlink_to(state_file)
    elif kind == "dangling":
        path.symlink_to(tmp_path / "absent.json")
    elif kind == "hardlink":
        os.link(state_file, path)
    elif kind == "directory":
        path.mkdir()
    elif kind == "fifo":
        os.mkfifo(path)
    else:
        server = socket.socket(socket.AF_UNIX)
        # macOS Unix sockets have a shorter pathname limit than pytest's temp paths.
        monkeypatch.chdir(tmp_path)
        server.bind(path.name)
    status = path.lstat()
    try:
        _assert_error(_raw(target, path))
        if kind == "hardlink":
            # Both aliases must be rejected, even the original name.
            _assert_error(_raw(target, state_file))
        assert path.lstat() == status
        assert state_file.read_bytes() == before
        assert state_file.stat().st_ino == inode
        assert set(tmp_path.iterdir()) == {state_file, path}
    finally:
        if server is not None:
            server.close()


def test_long_and_shell_sensitive_filenames_work_without_a_shell(target, tmp_path):
    state = tmp_path / ("- state ' ; $() 🚀 " + "s" * 210 + ".json")
    state.write_bytes(b'{"operating_mode":"NOMINAL"}\n')
    record = _execute(target, state, ScenarioId.NOMINAL_TO_SAFE_MODE)
    assert record.outcome is ExecutionOutcome.PASS
    assert json.loads(state.read_bytes()) == {"operating_mode": "SAFE"}
    assert list(tmp_path.iterdir()) == [state]


@pytest.mark.parametrize(("umask", "expected_mode"), [(0o000, 0o600), (0o200, 0o400)])
def test_replacement_file_is_created_with_owner_only_permissions_subject_to_the_umask(
    target, state_file, umask, expected_mode,
):
    import stat

    # The caller's umask is set explicitly. Under a typical umask such as 077, a
    # target that stopped requesting owner-only permissions would still pass.
    completed = _raw(target, state_file, preexec_fn=lambda: os.umask(umask))
    assert completed.returncode == 0
    assert json.loads(state_file.read_bytes()) == {"operating_mode": "SAFE"}
    assert stat.S_IMODE(state_file.stat().st_mode) == expected_mode
    assert list(state_file.parent.iterdir()) == [state_file]


def test_unwritable_state_directory_preserves_state(target, state_file):
    before = state_file.read_bytes()
    directory = state_file.parent
    previous_mode = directory.stat().st_mode & 0o777
    directory.chmod(0o500)
    try:
        if os.access(directory, os.W_OK):
            pytest.skip("this user can bypass directory permissions")
        _assert_error(_raw(target, state_file))
        assert state_file.read_bytes() == before
        assert list(directory.iterdir()) == [state_file]
    finally:
        directory.chmod(previous_mode)


def test_partial_temporary_write_is_cleaned_up_without_truncating_state(target, state_file):
    import resource
    import signal

    def limit_file_writes():
        # Force a real file write error without adding a third fault mode to the
        # target. Ignoring SIGXFSZ makes the kernel report EFBIG to the writer.
        resource.setrlimit(resource.RLIMIT_FSIZE, (8, 8))
        signal.signal(signal.SIGXFSZ, signal.SIG_IGN)

    # On Linux the .NET runtime sizes its executable memory from RLIMIT_FSIZE, so
    # an 8-byte limit stops it starting ("Failed to create CoreCLR", exit 137)
    # before any C# code runs. Disabling write-xor-execute for this child only
    # lets the failure occur in the target's own temporary-file write.
    environment = {**os.environ, "DOTNET_EnableWriteXorExecute": "0"}
    before = state_file.read_bytes()
    _assert_error(_raw(target, state_file, preexec_fn=limit_file_writes, env=environment))
    assert state_file.read_bytes() == before
    assert list(state_file.parent.iterdir()) == [state_file]


@pytest.mark.skipif(sys.platform != "darwin", reason="requires macOS immutable file flags")
@pytest.mark.parametrize("flags", [(), ("--fail-after-commit",)])
def test_failed_replacement_preserves_the_original_and_removes_the_temporary_file(target, state_file, flags):
    import stat

    before = state_file.read_bytes()
    status = state_file.stat()
    try:
        # The directory permits temporary writes, but the immutable destination
        # forbids replacement. This exercises a real rename error after writing.
        # os.chflags exists only on macOS and BSD, while CI runs Pyright for Linux,
        # so both calls to it in this test need a Pyright suppression.
        os.chflags(state_file, status.st_flags | stat.UF_IMMUTABLE)  # pyright: ignore[reportAttributeAccessIssue]
        completed = _raw(target, state_file, SAFE_COMMAND, *flags)
        _assert_error(completed)
        assert b"after state commit" not in completed.stderr
        assert state_file.read_bytes() == before
        assert state_file.stat().st_ino == status.st_ino
        assert list(state_file.parent.iterdir()) == [state_file]
    finally:
        # Always restore the original flags: an immutable file could not be
        # deleted when the temporary directory is removed.
        os.chflags(state_file, status.st_flags)  # pyright: ignore[reportAttributeAccessIssue]


@pytest.mark.parametrize("arguments", [
    [], ["--state-file"], ["--state-file", ""], ["--unknown"],
    ["--stale"], ["--stale-telemetry", "--stale-telemetry"],
    ["--fail-after-commit", "--fail-after-commit"],
])
def test_invalid_arguments_cannot_change_state(target, state_file, arguments):
    before = state_file.read_bytes()
    completed = subprocess.run(
        [*target, *arguments], input=SAFE_COMMAND,
        capture_output=True, timeout=10.0, check=False,
    )
    _assert_error(completed)
    assert state_file.read_bytes() == before


@pytest.mark.parametrize("filename", [
    "--stale-telemetry", "--fail-after-commit", "--state-file", "--unknown",
])
def test_state_path_cannot_consume_an_option_even_when_that_file_exists(target, tmp_path, filename):
    state = tmp_path / filename
    before = b'{ "operating_mode" : "NOMINAL" }\n'
    state.write_bytes(before)
    completed = subprocess.run(
        [*target, "--state-file", filename], cwd=tmp_path, input=SAFE_COMMAND,
        capture_output=True, timeout=10.0, check=False,
    )
    _assert_error(completed)
    assert b"requires a pathname" in completed.stderr
    assert state.read_bytes() == before
    assert list(tmp_path.iterdir()) == [state]

    # An explicit relative path still supports legitimate names beginning with '-'.
    explicit = subprocess.run(
        [*target, "--state-file", f"./{filename}"], cwd=tmp_path, input=SAFE_COMMAND,
        capture_output=True, timeout=10.0, check=False,
    )
    assert explicit.returncode == 0
    assert explicit.stderr == b""
    assert json.loads(explicit.stdout)["post_state"] == {"operating_mode": "SAFE"}
    assert json.loads(state.read_bytes()) == {"operating_mode": "SAFE"}
