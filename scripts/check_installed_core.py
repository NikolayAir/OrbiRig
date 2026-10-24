"""Smoke check run by verify_distributions.py using only an installed wheel."""

import importlib
import importlib.metadata
import importlib.util
import json
import os
import subprocess
import sys
from dataclasses import replace
from datetime import UTC, datetime
from pathlib import Path


def check_cli(distribution: importlib.metadata.Distribution) -> None:
    """Exercise the generated console script with independent recorded input."""
    from orbirig.evidence import (
        deserialize_verified_execution_evidence,
        serialize_verified_execution_evidence,
    )
    from orbirig.models import ExecutionOutcome

    assert [
        (entry.name, entry.value)
        for entry in distribution.entry_points if entry.group == "console_scripts"
    ] == [("orbirig", "orbirig.cli:main")], "Incorrect installed console entry point"
    command = Path(sys.executable).with_name("orbirig.exe" if os.name == "nt" else "orbirig")
    assert command.is_file(), "Missing installed console script"
    file = Path.cwd() / "recorded observation.json"
    observation = {
        "evidence_format_version": 1,
        "command": {"command_type": "SET_OPERATING_MODE", "target_mode": "SAFE"},
        "pre_state": {"operating_mode": "NOMINAL"},
        "acknowledgement": {"accepted": True},
        "post_state": {"operating_mode": "SAFE"},
        "telemetry": {"operating_mode": "SAFE"},
    }
    arguments = [
        str(command), "verify-observation", str(file),
        "--scenario", "nominal_to_safe_mode", "--execution-id", "installed-cli",
        "--executed-at", "2026-10-21T10:00:00Z",
    ]

    def run(args: list[str], code: int) -> subprocess.CompletedProcess[bytes]:
        result = subprocess.run(args, capture_output=True, timeout=10, check=False)
        assert result.returncode == code, (result.returncode, result.stderr)
        if code in (0, 1):
            assert result.stderr == b"", result.stderr
        else:
            assert result.stdout == b"", result.stdout
            assert b"error:" in result.stderr and b"Traceback" not in result.stderr
        return result

    file.write_text(json.dumps(observation), encoding="utf-8")
    passed = run(arguments, 0)
    evidence = json.loads(passed.stdout)
    assert evidence["schema_version"] == 1
    assert evidence["execution"] == {
        "execution_id": "installed-cli",
        "scenario_id": "nominal_to_safe_mode",
        "executed_at": "2026-10-21T10:00:00Z",
    }
    assert evidence["observation"] == {
        key: value for key, value in observation.items() if key != "evidence_format_version"
    }
    assert evidence["outcome"] == "PASS"
    assert [
        (item["invariant_id"], item["passed"], item["expected"], item["actual"])
        for item in evidence["invariant_results"]
    ] == [
        ("pre_state_matches_expected", True, "NOMINAL", "NOMINAL"),
        ("acknowledgement_is_accepted", True, True, True),
        ("post_state_matches_requested_mode", True, "SAFE", "SAFE"),
        ("telemetry_matches_post_state", True, "SAFE", "SAFE"),
    ]
    assert passed.stdout == (json.dumps(evidence, indent=2) + "\n").encode("utf-8")
    assert b"\r" not in passed.stdout
    assert deserialize_verified_execution_evidence(
        passed.stdout.decode("utf-8"),
    ).outcome is ExecutionOutcome.PASS
    assert run(arguments, 0).stdout == passed.stdout

    for timestamp, expected in (
        ("2026W336T120000,1234560-00:00", "2026-08-15T12:00:00.123456Z"),
        ("2026-08-15 12:00:00+00:00:00.0000000", "2026-08-15T12:00:00Z"),
        ("2026-W33-120000.5Z", "2026-08-10T12:00:00.500000Z"),
    ):
        timestamp_arguments = arguments.copy()
        timestamp_arguments[timestamp_arguments.index("--executed-at") + 1] = timestamp
        result = run(timestamp_arguments, 0)
        assert json.loads(result.stdout)["execution"]["executed_at"] == expected
        assert not result.stderr

    for timestamp in (
        "2026-08-15T12:00:00.1234567Z",
        "2026-08-15T12:00:00+00:00:00.5",
        "2026-08-15T12:00:00-00:00:00.0000001",
        "2026-W33-240000Z",
    ):
        timestamp_arguments = arguments.copy()
        timestamp_arguments[timestamp_arguments.index("--executed-at") + 1] = timestamp
        result = run(timestamp_arguments, 2)
        assert not result.stdout
        assert b"--executed-at" in result.stderr
        assert b"Traceback" not in result.stderr

    observation["telemetry"] = {"operating_mode": "NOMINAL"}
    file.write_text(json.dumps(observation), encoding="utf-8")
    failed = run(arguments, 1)
    evidence = json.loads(failed.stdout)
    assert evidence["outcome"] == "FAIL"
    assert [item for item in evidence["invariant_results"] if not item["passed"]] == [{
        "invariant_id": "telemetry_matches_post_state", "passed": False,
        "expected": "SAFE", "actual": "NOMINAL",
    }]
    record = deserialize_verified_execution_evidence(failed.stdout.decode("utf-8"))
    assert record.outcome is ExecutionOutcome.FAIL
    assert serialize_verified_execution_evidence(record).encode("utf-8") == failed.stdout

    invalid_scenario = arguments.copy()
    invalid_scenario[invalid_scenario.index("--scenario") + 1] = "unknown"
    assert b"invalid choice" in run(invalid_scenario, 2).stderr
    file.write_bytes(b'{"evidence_format_version": 1, "evidence_format_version": 1}')
    assert b"duplicate JSON object member" in run(arguments, 2).stderr
    for object_name in (None, "telemetry"):
        for field_name, escaped_name in (
            ("field\x1b[31mname", b"'field\\x1b[31mname'"),
            ("field\rname", b"'field\\rname'"),
            ("field\nname", b"'field\\nname'"),
            ("field\x00\t\b\x07\x7f\x9bname", b"'field\\x00\\t\\x08\\x07\\x7f\\x9bname'"),
            # U+202E is RIGHT-TO-LEFT OVERRIDE.
            ("field\u202ename", b"'field\\u202ename'"),
            ("field'\"name", b"'field\\'\"name'"),
            ("field\\nname", b"'field\\\\nname'"),
            ("extra", b"'extra'"),
        ):
            invalid_observation = observation.copy()
            if object_name is None:
                invalid_observation[field_name] = None
            else:
                invalid_observation[object_name] = {**observation[object_name], field_name: None}
            file.write_text(json.dumps(invalid_observation), encoding="utf-8")
            result = run(arguments, 2)
            path = b"observation evidence" if object_name is None else b"telemetry"
            diagnostic = (
                b"orbirig: error: invalid observation evidence: " + path
                + b" has invalid fields (unexpected fields: " + escaped_name + b")"
            )
            assert all(
                32 <= byte < 127
                for byte in result.stderr.removesuffix(os.linesep.encode("ascii"))
            ), result.stderr
            assert result.stderr == diagnostic + os.linesep.encode("ascii"), result.stderr
    file.write_bytes(b"\xff")
    assert b"valid UTF-8" in run(arguments, 2).stderr
    file.unlink()
    assert b"cannot read" in run(arguments, 3).stderr
    help_result = run([str(command), "verify-observation", "--help"], 0)
    assert b"usage: orbirig verify-observation" in help_result.stdout

    # The reader is closed before launch, so this cannot race with the child.
    file.write_text(json.dumps(observation), encoding="utf-8")
    for invocation in (arguments, [str(command), "--help"], [str(command), "verify-observation", "--help"]):
        reader, writer = os.pipe()
        os.close(reader)
        with os.fdopen(writer, "wb") as output:
            broken_pipe = subprocess.run(
                invocation, stdout=output, stderr=subprocess.PIPE, timeout=10, check=False,
            )
        assert broken_pipe.returncode == 3, broken_pipe.stderr
        assert b"cannot write stdout" in broken_pipe.stderr
        assert b"Traceback" not in broken_pipe.stderr
        assert b"Exception ignored" not in broken_pipe.stderr
    print("Installed CLI: PASS, FAIL, input errors, file errors, help and broken pipe passed", flush=True)


def main() -> None:
    if not __debug__:
        raise RuntimeError("Installed core checks require Python assertions; do not use -O")
    expected_version, source, artifact = sys.argv[1:]
    checkout = Path(source).resolve()
    assert sys.flags.isolated, "Run this check with Python -I"
    assert not os.environ.get("PYTHONPATH"), "PYTHONPATH must be unset"
    assert sys.prefix != sys.base_prefix, "A separate virtual environment is required"
    assert not Path.cwd().resolve().is_relative_to(checkout), "cwd is inside checkout"
    assert not any(
        Path(entry).resolve().is_relative_to(checkout) for entry in sys.path
    ), "Checkout is on sys.path"
    assert {dist.metadata["Name"] for dist in importlib.metadata.distributions()} == {
        "orbirig"
    }, "The smoke environment must contain only OrbiRig"
    distribution = importlib.metadata.distribution("orbirig")
    assert distribution.version == expected_version, "Incorrect installed version"
    direct_url = json.loads(distribution.read_text("direct_url.json") or "{}")
    assert "archive_info" in direct_url and "dir_info" not in direct_url, (
        "Expected a wheel installation, not an editable/source installation"
    )
    assert direct_url.get("url") == Path(artifact).as_uri(), "Wrong installed artefact"
    installed = Path(str(distribution.locate_file("orbirig"))).resolve()
    assert installed.is_relative_to(Path(sys.prefix).resolve()), "Package is outside venv"
    assert not installed.is_relative_to(checkout), "Package is inside checkout"
    for name in ("fastapi", "uvicorn"):
        assert importlib.util.find_spec(name) is None, f"Unexpected web dependency: {name}"
    for name in (
        "cli", "evidence", "execution", "models", "reference_sut",
        "subprocess_collection", "verification", "workflow",
    ):
        importlib.import_module(f"orbirig.{name}")

    from orbirig.evidence import (
        deserialize_verified_execution_evidence,
        serialize_verified_execution_evidence,
    )
    from orbirig.execution import execute_verified_reference_workflow
    from orbirig.models import (
        ExecutionOutcome,
        InvariantId,
        OperatingMode,
        ScenarioId,
        TelemetrySnapshot,
    )
    from orbirig.reference_sut import ReferenceSpacecraft
    from orbirig.verification import build_verified_execution_record

    executed_at = datetime(2026, 1, 1, tzinfo=UTC)
    record = execute_verified_reference_workflow(
        spacecraft=ReferenceSpacecraft(),
        execution_id="installed-core",
        executed_at=executed_at,
        scenario_id=ScenarioId.NOMINAL_TO_SAFE_MODE,
    )
    assert record.scenario_id is ScenarioId.NOMINAL_TO_SAFE_MODE
    assert record.outcome is ExecutionOutcome.PASS
    assert tuple(
        (result.invariant_id, result.passed, result.expected, result.actual)
        for result in record.invariant_results
    ) == (
        (InvariantId.PRE_STATE_MATCHES_EXPECTED, True, OperatingMode.NOMINAL, OperatingMode.NOMINAL),
        (InvariantId.ACKNOWLEDGEMENT_IS_ACCEPTED, True, True, True),
        (InvariantId.POST_STATE_MATCHES_REQUESTED_MODE, True, OperatingMode.SAFE, OperatingMode.SAFE),
        (InvariantId.TELEMETRY_MATCHES_POST_STATE, True, OperatingMode.SAFE, OperatingMode.SAFE),
    )
    assert deserialize_verified_execution_evidence(
        serialize_verified_execution_evidence(record)
    ) == record

    inconsistent = replace(
        record.observation,
        telemetry=TelemetrySnapshot(operating_mode=OperatingMode.NOMINAL),
    )
    failed = build_verified_execution_record(
        execution_id="installed-mismatch",
        executed_at=executed_at,
        scenario_id=ScenarioId.NOMINAL_TO_SAFE_MODE,
        observation=inconsistent,
    )
    assert failed.outcome is ExecutionOutcome.FAIL
    assert tuple(result.invariant_id for result in failed.invariant_results if not result.passed) == (
        InvariantId.TELEMETRY_MATCHES_POST_STATE,
    )
    assert deserialize_verified_execution_evidence(
        serialize_verified_execution_evidence(failed)
    ) == failed
    check_cli(distribution)
    for name, module in tuple(sys.modules.items()):
        if name == "orbirig" or name.startswith("orbirig."):
            assert module.__file__ is not None
            assert Path(module.__file__).resolve().is_relative_to(installed), (
                f"{name} was imported outside the installed package: {module.__file__}"
            )
    print(f"Installed OrbiRig {distribution.version}: {installed}", flush=True)


if __name__ == "__main__":
    main()
