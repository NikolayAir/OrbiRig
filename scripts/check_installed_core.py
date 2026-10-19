"""Smoke check run by verify_distributions.py using only an installed wheel."""

import importlib
import importlib.metadata
import importlib.util
import json
import os
import sys
from dataclasses import replace
from datetime import UTC, datetime
from pathlib import Path


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
        "evidence", "execution", "models", "reference_sut",
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
    for name, module in tuple(sys.modules.items()):
        if name == "orbirig" or name.startswith("orbirig."):
            assert module.__file__ is not None
            assert Path(module.__file__).resolve().is_relative_to(installed), (
                f"{name} was imported outside the installed package: {module.__file__}"
            )
    print(f"Installed OrbiRig {distribution.version}: {installed}", flush=True)


if __name__ == "__main__":
    main()
