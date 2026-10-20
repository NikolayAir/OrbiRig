"""CLI contracts checked with observations independent of the reference SUT."""

import io
import json
import sys
from pathlib import Path
from typing import Any

import pytest

from orbirig import cli
from orbirig.evidence import (
    deserialize_verified_execution_evidence,
    serialize_verified_execution_evidence,
)
from orbirig.models import ExecutionOutcome


def _observation(
    *,
    target: str = "SAFE",
    pre: str = "NOMINAL",
    accepted: bool = True,
    post: str = "SAFE",
    telemetry: str = "SAFE",
) -> dict[str, Any]:
    return {
        "evidence_format_version": 1,
        "command": {"command_type": "SET_OPERATING_MODE", "target_mode": target},
        "pre_state": {"operating_mode": pre},
        "acknowledgement": {"accepted": accepted},
        "post_state": {"operating_mode": post},
        "telemetry": {"operating_mode": telemetry},
    }


def _expected_pass() -> dict[str, Any]:
    return {
        "schema_version": 1,
        "execution": {
            "execution_id": "test-001",
            "scenario_id": "nominal_to_safe_mode",
            "executed_at": "2026-10-21T10:00:00Z",
        },
        "observation": {
            "command": {"command_type": "SET_OPERATING_MODE", "target_mode": "SAFE"},
            "pre_state": {"operating_mode": "NOMINAL"},
            "acknowledgement": {"accepted": True},
            "post_state": {"operating_mode": "SAFE"},
            "telemetry": {"operating_mode": "SAFE"},
        },
        "invariant_results": [
            {
                "invariant_id": "pre_state_matches_expected",
                "passed": True, "expected": "NOMINAL", "actual": "NOMINAL",
            },
            {
                "invariant_id": "acknowledgement_is_accepted",
                "passed": True, "expected": True, "actual": True,
            },
            {
                "invariant_id": "post_state_matches_requested_mode",
                "passed": True, "expected": "SAFE", "actual": "SAFE",
            },
            {
                "invariant_id": "telemetry_matches_post_state",
                "passed": True, "expected": "SAFE", "actual": "SAFE",
            },
        ],
        "outcome": "PASS",
    }


def _json_bytes(document: object) -> bytes:
    return (json.dumps(document, indent=2) + "\n").encode("utf-8")


@pytest.fixture
def observation_file(tmp_path: Path) -> Path:
    file = tmp_path / "recorded observation.json"
    file.write_bytes(_json_bytes(_observation()))
    return file


def _args(
    file: Path,
    *,
    scenario: str = "nominal_to_safe_mode",
    execution_id: str = "test-001",
    executed_at: str = "2026-10-21T10:00:00Z",
) -> list[str]:
    return [
        "verify-observation", str(file), "--scenario", scenario,
        "--execution-id", execution_id, "--executed-at", executed_at,
    ]


def _run(args: list[str]) -> int:
    try:
        return cli.main(args)
    except SystemExit as exc:
        assert type(exc.code) is int
        return exc.code


def test_pass_writes_only_exact_canonical_json(observation_file, capsysbinary):
    assert _run(_args(observation_file)) == 0
    captured = capsysbinary.readouterr()
    assert captured.err == b""
    assert captured.out == _json_bytes(_expected_pass())
    assert b"\r" not in captured.out
    assert deserialize_verified_execution_evidence(
        captured.out.decode("utf-8"),
    ).outcome is ExecutionOutcome.PASS


def test_fail_is_complete_canonical_reconstructible_evidence(observation_file, capsysbinary):
    observation_file.write_bytes(_json_bytes(_observation(telemetry="NOMINAL")))
    assert _run(_args(observation_file)) == 1
    captured = capsysbinary.readouterr()
    expected = _expected_pass()
    expected["observation"]["telemetry"]["operating_mode"] = "NOMINAL"
    expected["invariant_results"][-1].update(passed=False, actual="NOMINAL")
    expected["outcome"] = "FAIL"
    assert captured.err == b""
    assert captured.out == _json_bytes(expected)
    record = deserialize_verified_execution_evidence(captured.out.decode("utf-8"))
    assert record.outcome is ExecutionOutcome.FAIL
    assert serialize_verified_execution_evidence(record).encode("utf-8") == captured.out


@pytest.mark.parametrize(("scenario", "document", "acknowledgement_check"), [
    ("nominal_to_safe_mode", _observation(), "acknowledgement_is_accepted"),
    (
        "nominal_to_nominal_rejection",
        _observation(target="NOMINAL", accepted=False, post="NOMINAL", telemetry="NOMINAL"),
        "acknowledgement_is_rejected",
    ),
    (
        "safe_to_nominal_mode",
        _observation(target="NOMINAL", pre="SAFE", post="NOMINAL", telemetry="NOMINAL"),
        "acknowledgement_is_accepted",
    ),
])
def test_each_explicit_scenario_can_pass(
    observation_file, capsysbinary, scenario, document, acknowledgement_check,
):
    observation_file.write_bytes(_json_bytes(document))
    assert _run(_args(observation_file, scenario=scenario)) == 0
    captured = capsysbinary.readouterr()
    evidence = json.loads(captured.out)
    assert captured.err == b""
    assert evidence["execution"]["scenario_id"] == scenario
    assert evidence["outcome"] == "PASS"
    assert all(result["passed"] for result in evidence["invariant_results"])
    assert evidence["invariant_results"][1]["invariant_id"] == acknowledgement_check


def test_rejected_observation_does_not_choose_its_scenario(observation_file, capsysbinary):
    observation_file.write_bytes(_json_bytes(_observation(
        target="NOMINAL", accepted=False, post="NOMINAL", telemetry="NOMINAL",
    )))
    assert _run(_args(observation_file, scenario="safe_to_nominal_mode")) == 1
    captured = capsysbinary.readouterr()
    evidence = json.loads(captured.out)
    assert captured.err == b""
    assert evidence["execution"]["scenario_id"] == "safe_to_nominal_mode"
    assert evidence["outcome"] == "FAIL"
    assert [result for result in evidence["invariant_results"] if not result["passed"]] == [
        {
            "invariant_id": "pre_state_matches_expected",
            "passed": False, "expected": "SAFE", "actual": "NOMINAL",
        },
        {
            "invariant_id": "acknowledgement_is_accepted",
            "passed": False, "expected": True, "actual": False,
        },
    ]


def test_scenario_command_mismatch_is_an_input_error(observation_file, capsysbinary):
    assert _run(_args(observation_file, scenario="safe_to_nominal_mode")) == 2
    captured = capsysbinary.readouterr()
    assert captured.out == b""
    assert b"observation command does not match the selected scenario" in captured.err
    assert b"Traceback" not in captured.err


@pytest.mark.parametrize("raw", [
    b"", b"{not-json}", b"[]", b"{}", b"null",
    _json_bytes({**_observation(), "evidence_format_version": 2}),
    _json_bytes({**_observation(), "evidence_format_version": True}),
    _json_bytes({**_observation(), "scenario_id": "nominal_to_safe_mode"}),
    _json_bytes({**_observation(), "acknowledgement": {"accepted": 1}}),
    _json_bytes(_observation(telemetry="UNKNOWN")),
    _json_bytes(_observation()).replace(b'"evidence_format_version": 1',
        b'"evidence_format_version": 1, "evidence_format_version": 1'),
    _json_bytes(_observation()).replace(b'"accepted": true',
        b'"accepted": true, "accepted": false'),
    _json_bytes(_observation()).replace(b'"accepted": true',
        b'"accepted": true, "accepted": true'),
    _json_bytes(_observation()) + b"{}",
    b"\xff", b"\xef\xbb\xbf" + _json_bytes(_observation()),
], ids=[
    "empty", "malformed", "array", "missing-fields", "null", "unsupported-version",
    "boolean-version", "embedded-scenario", "non-boolean-acknowledgement", "unknown-mode",
    "duplicate-root", "duplicate-nested-conflicting", "duplicate-nested-identical",
    "multiple-documents", "invalid-utf8", "utf8-bom",
])
def test_invalid_evidence_has_no_verification_output(observation_file, capsysbinary, raw):
    observation_file.write_bytes(raw)
    assert _run(_args(observation_file)) == 2
    captured = capsysbinary.readouterr()
    assert captured.out == b""
    assert b"orbirig: error:" in captured.err
    assert b"Traceback" not in captured.err


@pytest.mark.parametrize("timestamp", [
    "2026-10-21T10:00:00Z", "2026-10-21T10:00:00+00:00",
    "2026-10-21T10:00:00.1Z", "2026-10-21T10:00:00.123456+00:00",
])
def test_valid_timestamp_is_serialised_canonically(observation_file, capsysbinary, timestamp):
    assert _run(_args(observation_file, executed_at=timestamp)) == 0
    evidence = json.loads(capsysbinary.readouterr().out)
    expected = {
        "2026-10-21T10:00:00.1Z": "2026-10-21T10:00:00.100000Z",
        "2026-10-21T10:00:00.123456+00:00": "2026-10-21T10:00:00.123456Z",
    }.get(timestamp, "2026-10-21T10:00:00Z")
    assert evidence["execution"]["executed_at"] == expected


@pytest.mark.parametrize("timestamp", [
    "", "not-a-timestamp", "2026-10-21", "2026-10-21T10:00:00",
    "2026-10-21T10:00:00+02:00", "2026-10-21T10:00:00-00:00",
    "2026-10-21 10:00:00Z", "20261021T100000Z", "2026-10-21T10:00Z",
    "2026-10-21T10:00:00.Z", "2026-10-21T10:00:00.1234567Z",
    "2026-10-21T10:00:00,1Z", "2026-10-21T10:00:00z",
    "2026-10-21T10:00:00+00:00:00", "2026-10-21T10:00:00Z\n",
    "2026-02-30T10:00:00Z", "2026-10-21T24:00:00Z", "2026-10-21T10:00:60Z",
])
def test_invalid_timestamp_is_an_argument_error(observation_file, capsysbinary, timestamp):
    assert _run(_args(observation_file, executed_at=timestamp)) == 2
    captured = capsysbinary.readouterr()
    assert captured.out == b""
    assert b"--executed-at" in captured.err
    assert b"Traceback" not in captured.err


@pytest.mark.parametrize("execution_id", ["", "   ", "\t\n"])
def test_empty_execution_id_is_invalid_metadata(observation_file, capsysbinary, execution_id):
    assert _run(_args(observation_file, execution_id=execution_id)) == 2
    captured = capsysbinary.readouterr()
    assert captured.out == b""
    assert b"invalid execution metadata" in captured.err


def test_non_ascii_execution_id_and_whitespace_are_preserved(observation_file, capsysbinary):
    execution_id = "  essai-ёж  "
    assert _run(_args(observation_file, execution_id=execution_id)) == 0
    captured = capsysbinary.readouterr()
    expected = _expected_pass()
    expected["execution"]["execution_id"] = execution_id
    assert captured.out == _json_bytes(expected)
    assert captured.err == b""


@pytest.mark.parametrize("missing", ["file", "--scenario", "--execution-id", "--executed-at"])
def test_each_required_argument_is_required(observation_file, capsysbinary, missing):
    args = _args(observation_file)
    if missing == "file":
        del args[1]
    else:
        index = args.index(missing)
        del args[index:index + 2]
    assert _run(args) == 2
    captured = capsysbinary.readouterr()
    assert captured.out == b""
    assert b"required" in captured.err


@pytest.mark.parametrize("arguments", [
    [], ["unknown-command"], ["--scen", "nominal_to_safe_mode"],
])
def test_invalid_root_arguments_have_no_json(capsysbinary, arguments):
    assert _run(arguments) == 2
    captured = capsysbinary.readouterr()
    assert captured.out == b""
    assert b"error:" in captured.err


@pytest.mark.parametrize(("option", "replacement"), [
    ("--scenario", "--scen"), ("--execution-id", "--execution-i"),
    ("--executed-at", "--executed-a"),
])
def test_options_cannot_be_abbreviated(observation_file, capsysbinary, option, replacement):
    args = _args(observation_file)
    args[args.index(option)] = replacement
    assert _run(args) == 2
    captured = capsysbinary.readouterr()
    assert captured.out == b""
    assert b"error:" in captured.err


def test_invalid_scenario_has_no_json(observation_file, capsysbinary):
    assert _run(_args(observation_file, scenario="unknown")) == 2
    captured = capsysbinary.readouterr()
    assert captured.out == b""
    assert b"invalid choice" in captured.err


def test_dash_does_not_read_stdin(tmp_path, monkeypatch, capsysbinary):
    class ForbiddenInput:
        def read(self, *_args):
            pytest.fail("the CLI must not read stdin")
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(sys, "stdin", ForbiddenInput())
    assert _run(_args(Path("-"))) == 3
    captured = capsysbinary.readouterr()
    assert captured.out == b""
    assert b"cannot read '-'" in captured.err


@pytest.mark.parametrize("arguments", [["--help"], ["verify-observation", "--help"]])
def test_help_does_not_read_input(monkeypatch, capsysbinary, arguments):
    def forbidden_read(_self):
        pytest.fail("help must not read an observation")
    monkeypatch.setattr(Path, "read_bytes", forbidden_read)
    assert _run(arguments) == 0
    captured = capsysbinary.readouterr()
    assert captured.err == b""
    assert b"usage: orbirig" in captured.out


@pytest.mark.parametrize("source", ["missing", "directory", "permission"])
def test_file_errors_are_distinct_from_invalid_evidence(
    observation_file, tmp_path, capsysbinary, monkeypatch, source,
):
    if source == "missing":
        observation_file = tmp_path / "missing.json"
    elif source == "directory":
        observation_file = tmp_path
    else:
        def denied(_self):
            raise PermissionError("read denied")
        monkeypatch.setattr(Path, "read_bytes", denied)
    assert _run(_args(observation_file)) == 3
    captured = capsysbinary.readouterr()
    assert captured.out == b""
    assert b"cannot read" in captured.err
    assert str(observation_file).encode("utf-8") in captured.err
    assert b"Traceback" not in captured.err


def test_raw_evidence_reaches_core_without_normalisation(
    observation_file, capsysbinary, monkeypatch,
):
    raw = b" \r\n" + _json_bytes(_observation()).replace(b"\n", b"\r\n")
    observation_file.write_bytes(raw)
    received = []
    original = cli.deserialize_execution_evidence
    def capture(value):
        received.append(value)
        return original(value)
    monkeypatch.setattr(cli, "deserialize_execution_evidence", capture)
    assert _run(_args(observation_file)) == 0
    assert received == [raw.decode("utf-8")]
    assert capsysbinary.readouterr().out == _json_bytes(_expected_pass())


def test_fixed_inputs_produce_identical_bytes(observation_file, capsysbinary):
    outputs = []
    for _ in range(2):
        assert _run(_args(observation_file)) == 0
        captured = capsysbinary.readouterr()
        assert captured.err == b""
        outputs.append(captured.out)
    assert outputs[0] == outputs[1] == _json_bytes(_expected_pass())


def test_output_bypasses_text_encoding_and_crlf_translation(observation_file, monkeypatch):
    buffer = io.BytesIO()
    stdout = io.TextIOWrapper(buffer, encoding="utf-16", newline="\r\n")
    monkeypatch.setattr(sys, "stdout", stdout)
    assert _run(_args(observation_file)) == 0
    assert buffer.getvalue() == _json_bytes(_expected_pass())


@pytest.mark.parametrize("stage", ["write", "flush", "short-write"])
@pytest.mark.parametrize("arguments", [None, ["--help"], ["verify-observation", "--help"]])
def test_output_errors_return_three_without_a_traceback(
    observation_file, monkeypatch, capsysbinary, stage, arguments,
):
    class FailingBuffer(io.BytesIO):
        def write(self, data):
            if stage == "write":
                super().write(data[:8])
                raise BrokenPipeError("output unavailable")
            if stage == "short-write":
                return super().write(data[:8])
            return super().write(data)
        def flush(self):
            if stage == "flush":
                raise OSError("flush failed")
            super().flush()
    buffer = FailingBuffer()
    stdout = io.TextIOWrapper(buffer, encoding="utf-8")
    monkeypatch.setattr(sys, "stdout", stdout)
    assert _run(_args(observation_file) if arguments is None else arguments) == 3
    assert buffer.closed
    captured = capsysbinary.readouterr()
    assert captured.out == b""
    assert b"cannot write stdout" in captured.err
    assert b"Traceback" not in captured.err


@pytest.mark.parametrize("function", [
    "build_verified_execution_record", "serialize_verified_execution_evidence",
])
def test_internal_value_error_is_not_invalid_evidence_or_verification_fail(
    observation_file, monkeypatch, capsysbinary, function,
):
    def unexpected(*_args, **_kwargs):
        raise ValueError("unexpected core failure")
    monkeypatch.setattr(cli, function, unexpected)
    assert _run(_args(observation_file)) == 4
    captured = capsysbinary.readouterr()
    assert captured.out == b""
    assert b"unexpected internal error" in captured.err
    assert b"Traceback (most recent call last)" in captured.err
    assert b"ValueError: unexpected core failure" in captured.err
    assert b"invalid observation evidence" not in captured.err
