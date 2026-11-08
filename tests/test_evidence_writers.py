"""Writers reject manually assembled, inconsistent derived evidence."""

from dataclasses import replace
from datetime import UTC, datetime

import pytest

from orbirig.evidence import (
    deserialize_verified_execution_evidence,
    deserialize_verified_execution_sequence_evidence,
    serialize_verified_execution_evidence,
    serialize_verified_execution_sequence_evidence,
)
from orbirig.models import (
    Acknowledgement,
    CommandExecutionObservation,
    ContinuityBoundaryResult,
    InvariantId,
    OperatingMode,
    ScenarioId,
    SetOperatingModeCommand,
    SpacecraftState,
    TelemetrySnapshot,
)
from orbirig.verification import (
    build_verified_execution_record,
    verify_execution_sequence,
)


def _record(*, failed=False):
    return build_verified_execution_record(
        execution_id="writer-test", executed_at=datetime(2026, 11, 1, tzinfo=UTC),
        scenario_id=ScenarioId.NOMINAL_TO_SAFE_MODE,
        observation=CommandExecutionObservation(
            command=SetOperatingModeCommand(target_mode=OperatingMode.SAFE),
            pre_state=SpacecraftState(OperatingMode.NOMINAL),
            acknowledgement=Acknowledgement(True),
            post_state=SpacecraftState(OperatingMode.SAFE),
            telemetry=TelemetrySnapshot(OperatingMode.NOMINAL if failed else OperatingMode.SAFE),
        ),
    )


@pytest.mark.parametrize("mutation", ["missing", "reordered", "id", "expected", "actual", "passed", "bool-type"])
def test_record_and_sequence_writers_reject_noncanonical_checks(mutation):
    record = _record(failed=True)
    results = list(record.invariant_results)
    if mutation == "missing":
        results.pop()
    elif mutation == "reordered":
        results.reverse()
    else:
        changes = {
            "id": {"invariant_id": InvariantId.ACKNOWLEDGEMENT_IS_REJECTED},
            "expected": {"expected": OperatingMode.NOMINAL},
            "actual": {"actual": OperatingMode.SAFE},
            "passed": {"passed": True},
            "bool-type": {"passed": 0},
        }
        results[-1] = replace(results[-1], **changes[mutation])
    forged = replace(record, invariant_results=tuple(results))
    before = forged.invariant_results

    with pytest.raises(ValueError):
        serialize_verified_execution_evidence(forged)
    with pytest.raises(ValueError):
        serialize_verified_execution_sequence_evidence(verify_execution_sequence([forged, record]))
    assert forged.invariant_results == before


def test_sequence_writer_rejects_invented_continuity():
    record = _record()
    sequence = verify_execution_sequence([record, record])
    forged = replace(sequence, continuity_results=(ContinuityBoundaryResult(
        previous_execution_id="invented", next_execution_id=record.execution_id,
        expected_operating_mode=OperatingMode.SAFE, observed_operating_mode=OperatingMode.SAFE,
    ),))

    with pytest.raises(ValueError, match="continuity_results"):
        serialize_verified_execution_sequence_evidence(forged)


@pytest.mark.parametrize("failed", [False, True])
def test_canonical_writer_output_remains_deterministic_and_readable(failed):
    record = _record(failed=failed)
    serialized = serialize_verified_execution_evidence(record)
    assert serialized == serialize_verified_execution_evidence(record)
    assert deserialize_verified_execution_evidence(serialized) == record
    sequence = verify_execution_sequence([record, record])
    serialized_sequence = serialize_verified_execution_sequence_evidence(sequence)
    assert serialized_sequence == serialize_verified_execution_sequence_evidence(sequence)
    assert deserialize_verified_execution_sequence_evidence(serialized_sequence) == sequence
