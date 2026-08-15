"""Tests for verified-execution sequence JSON evidence."""

from copy import deepcopy
from datetime import datetime, timezone
import json
import re

import pytest

import orbirig.evidence as evidence_module
from orbirig.evidence import (
    deserialize_verified_execution_sequence_evidence,
    serialize_verified_execution_sequence_evidence,
)
from orbirig.execution import build_verified_execution_record
from orbirig.models import (
    Acknowledgement,
    CommandExecutionObservation,
    ExecutionOutcome,
    OperatingMode,
    ScenarioId,
    SetOperatingModeCommand,
    SpacecraftState,
    TelemetrySnapshot,
)
from orbirig.verification import verify_execution_sequence


EARLIER = datetime(2026, 8, 15, 10, 0, tzinfo=timezone.utc)
LATER = datetime(2026, 8, 15, 12, 0, tzinfo=timezone.utc)


def _nominal_to_safe_document(
    execution_id: str = "first",
    executed_at: str = "2026-08-15T10:00:00Z",
) -> dict[str, object]:
    return {
        "schema_version": 1,
        "execution": {
            "execution_id": execution_id,
            "scenario_id": "nominal_to_safe_mode",
            "executed_at": executed_at,
        },
        "observation": {
            "command": {
                "command_type": "SET_OPERATING_MODE",
                "target_mode": "SAFE",
            },
            "pre_state": {"operating_mode": "NOMINAL"},
            "acknowledgement": {"accepted": True},
            "post_state": {"operating_mode": "SAFE"},
            "telemetry": {"operating_mode": "SAFE"},
        },
        "invariant_results": [
            {
                "invariant_id": "pre_state_matches_expected",
                "passed": True,
                "expected": "NOMINAL",
                "actual": "NOMINAL",
            },
            {
                "invariant_id": "acknowledgement_is_accepted",
                "passed": True,
                "expected": True,
                "actual": True,
            },
            {
                "invariant_id": "post_state_matches_requested_mode",
                "passed": True,
                "expected": "SAFE",
                "actual": "SAFE",
            },
            {
                "invariant_id": "telemetry_matches_post_state",
                "passed": True,
                "expected": "SAFE",
                "actual": "SAFE",
            },
        ],
        "outcome": "PASS",
    }


def _safe_to_nominal_document(
    execution_id: str = "second",
    executed_at: str = "2026-08-15T12:00:00Z",
) -> dict[str, object]:
    return {
        "schema_version": 1,
        "execution": {
            "execution_id": execution_id,
            "scenario_id": "safe_to_nominal_mode",
            "executed_at": executed_at,
        },
        "observation": {
            "command": {
                "command_type": "SET_OPERATING_MODE",
                "target_mode": "NOMINAL",
            },
            "pre_state": {"operating_mode": "SAFE"},
            "acknowledgement": {"accepted": True},
            "post_state": {"operating_mode": "NOMINAL"},
            "telemetry": {"operating_mode": "NOMINAL"},
        },
        "invariant_results": [
            {
                "invariant_id": "pre_state_matches_expected",
                "passed": True,
                "expected": "SAFE",
                "actual": "SAFE",
            },
            {
                "invariant_id": "acknowledgement_is_accepted",
                "passed": True,
                "expected": True,
                "actual": True,
            },
            {
                "invariant_id": "post_state_matches_requested_mode",
                "passed": True,
                "expected": "NOMINAL",
                "actual": "NOMINAL",
            },
            {
                "invariant_id": "telemetry_matches_post_state",
                "passed": True,
                "expected": "NOMINAL",
                "actual": "NOMINAL",
            },
        ],
        "outcome": "PASS",
    }


def _nominal_rejection_document(
    execution_id: str = "third",
    executed_at: str = "2026-08-15T14:00:00Z",
) -> dict[str, object]:
    return {
        "schema_version": 1,
        "execution": {
            "execution_id": execution_id,
            "scenario_id": "nominal_to_nominal_rejection",
            "executed_at": executed_at,
        },
        "observation": {
            "command": {
                "command_type": "SET_OPERATING_MODE",
                "target_mode": "NOMINAL",
            },
            "pre_state": {"operating_mode": "NOMINAL"},
            "acknowledgement": {"accepted": False},
            "post_state": {"operating_mode": "NOMINAL"},
            "telemetry": {"operating_mode": "NOMINAL"},
        },
        "invariant_results": [
            {
                "invariant_id": "pre_state_matches_expected",
                "passed": True,
                "expected": "NOMINAL",
                "actual": "NOMINAL",
            },
            {
                "invariant_id": "acknowledgement_is_rejected",
                "passed": True,
                "expected": False,
                "actual": False,
            },
            {
                "invariant_id": "post_state_matches_pre_state",
                "passed": True,
                "expected": "NOMINAL",
                "actual": "NOMINAL",
            },
            {
                "invariant_id": "telemetry_matches_post_state",
                "passed": True,
                "expected": "NOMINAL",
                "actual": "NOMINAL",
            },
        ],
        "outcome": "PASS",
    }


def _boundary_document(
    previous_execution_id: str,
    next_execution_id: str,
    mode: str,
) -> dict[str, object]:
    return {
        "previous_execution_id": previous_execution_id,
        "next_execution_id": next_execution_id,
        "expected_operating_mode": mode,
        "observed_operating_mode": mode,
        "passed": True,
    }


def _valid_sequence_document() -> dict[str, object]:
    return {
        "schema_version": 1,
        "records": [
            _nominal_to_safe_document(),
            _safe_to_nominal_document(),
        ],
        "continuity_results": [
            _boundary_document("first", "second", "SAFE"),
        ],
        "outcome": "PASS",
    }


def _valid_three_record_document() -> dict[str, object]:
    document = _valid_sequence_document()
    document["records"].append(_nominal_rejection_document())
    document["continuity_results"].append(
        _boundary_document("second", "third", "NOMINAL"),
    )
    return document


def _serialized(document: object) -> str:
    return json.dumps(document)


def _record(
    *,
    execution_id: str,
    scenario_id: ScenarioId,
    executed_at: datetime,
    accepted: bool | None = None,
):
    target_mode = (
        OperatingMode.SAFE
        if scenario_id is ScenarioId.NOMINAL_TO_SAFE_MODE
        else OperatingMode.NOMINAL
    )
    pre_mode = (
        OperatingMode.SAFE
        if scenario_id is ScenarioId.SAFE_TO_NOMINAL_MODE
        else OperatingMode.NOMINAL
    )
    expected_accepted = (
        scenario_id is not ScenarioId.NOMINAL_TO_NOMINAL_REJECTION
    )
    observation = CommandExecutionObservation(
        command=SetOperatingModeCommand(target_mode),
        pre_state=SpacecraftState(pre_mode),
        acknowledgement=Acknowledgement(
            expected_accepted if accepted is None else accepted,
        ),
        post_state=SpacecraftState(target_mode),
        telemetry=TelemetrySnapshot(target_mode),
    )

    return build_verified_execution_record(
        execution_id=execution_id,
        executed_at=executed_at,
        scenario_id=scenario_id,
        observation=observation,
    )


def _passing_sequence(
    *,
    first_id: str = "first",
    second_id: str = "second",
    first_time: datetime = EARLIER,
    second_time: datetime = LATER,
):
    return verify_execution_sequence(
        (
            _record(
                execution_id=first_id,
                scenario_id=ScenarioId.NOMINAL_TO_SAFE_MODE,
                executed_at=first_time,
            ),
            _record(
                execution_id=second_id,
                scenario_id=ScenarioId.SAFE_TO_NOMINAL_MODE,
                executed_at=second_time,
            ),
        ),
    )


def test_independently_constructed_sequence_json_is_deserialised():
    sequence = deserialize_verified_execution_sequence_evidence(
        _serialized(_valid_sequence_document()),
    )

    assert tuple(record.execution_id for record in sequence.records) == (
        "first",
        "second",
    )
    assert sequence.records[0].scenario_id is ScenarioId.NOMINAL_TO_SAFE_MODE
    assert sequence.records[1].scenario_id is ScenarioId.SAFE_TO_NOMINAL_MODE
    assert sequence.continuity_results[0].expected_operating_mode is OperatingMode.SAFE
    assert sequence.continuity_results[0].passed is True
    assert sequence.outcome is ExecutionOutcome.PASS


def test_serialisation_has_exact_deterministic_shape():
    sequence = _passing_sequence()
    expected = json.dumps(_valid_sequence_document(), indent=2) + "\n"

    assert serialize_verified_execution_sequence_evidence(sequence) == expected
    assert isinstance(json.loads(expected)["records"][0], dict)


def test_writer_to_reader_round_trip_preserves_sequence():
    sequence = _passing_sequence()

    assert deserialize_verified_execution_sequence_evidence(
        serialize_verified_execution_sequence_evidence(sequence),
    ) == sequence


def test_canonical_fail_from_failed_member_round_trips():
    sequence = verify_execution_sequence(
        (
            _record(
                execution_id="first",
                scenario_id=ScenarioId.NOMINAL_TO_SAFE_MODE,
                executed_at=EARLIER,
            ),
            _record(
                execution_id="failed-second",
                scenario_id=ScenarioId.SAFE_TO_NOMINAL_MODE,
                executed_at=LATER,
                accepted=False,
            ),
        ),
    )

    loaded = deserialize_verified_execution_sequence_evidence(
        serialize_verified_execution_sequence_evidence(sequence),
    )

    assert loaded == sequence
    assert loaded.continuity_results[0].passed is True
    assert loaded.outcome is ExecutionOutcome.FAIL


def test_canonical_fail_from_discontinuity_round_trips():
    sequence = verify_execution_sequence(
        (
            _record(
                execution_id="first",
                scenario_id=ScenarioId.NOMINAL_TO_SAFE_MODE,
                executed_at=EARLIER,
            ),
            _record(
                execution_id="second",
                scenario_id=ScenarioId.NOMINAL_TO_NOMINAL_REJECTION,
                executed_at=LATER,
            ),
        ),
    )

    loaded = deserialize_verified_execution_sequence_evidence(
        serialize_verified_execution_sequence_evidence(sequence),
    )

    assert all(record.outcome is ExecutionOutcome.PASS for record in loaded.records)
    assert loaded.continuity_results[0].passed is False
    assert loaded.outcome is ExecutionOutcome.FAIL


def test_three_record_order_and_boundary_order_round_trip():
    sequence = deserialize_verified_execution_sequence_evidence(
        _serialized(_valid_three_record_document()),
    )

    assert tuple(record.execution_id for record in sequence.records) == (
        "first",
        "second",
        "third",
    )
    assert tuple(
        (result.previous_execution_id, result.next_execution_id)
        for result in sequence.continuity_results
    ) == (("first", "second"), ("second", "third"))


def test_duplicate_execution_ids_are_preserved():
    sequence = _passing_sequence(first_id="duplicate", second_id="duplicate")

    loaded = deserialize_verified_execution_sequence_evidence(
        serialize_verified_execution_sequence_evidence(sequence),
    )

    assert tuple(record.execution_id for record in loaded.records) == (
        "duplicate",
        "duplicate",
    )
    assert loaded.continuity_results[0].previous_execution_id == "duplicate"
    assert loaded.continuity_results[0].next_execution_id == "duplicate"


@pytest.mark.parametrize(
    ("first_time", "second_time"),
    [(EARLIER, EARLIER), (LATER, EARLIER)],
    ids=["equal", "decreasing"],
)
def test_timestamp_values_do_not_change_persisted_order(
    first_time,
    second_time,
):
    sequence = _passing_sequence(
        first_time=first_time,
        second_time=second_time,
    )

    loaded = deserialize_verified_execution_sequence_evidence(
        serialize_verified_execution_sequence_evidence(sequence),
    )

    assert loaded.records[0].executed_at == first_time
    assert loaded.records[1].executed_at == second_time
    assert tuple(record.execution_id for record in loaded.records) == (
        "first",
        "second",
    )


@pytest.mark.parametrize("record_count", [0, 1])
def test_fewer_than_two_member_records_are_rejected(record_count):
    document = _valid_sequence_document()
    document["records"] = document["records"][:record_count]
    document["continuity_results"] = []

    with pytest.raises(ValueError, match="requires at least two records"):
        deserialize_verified_execution_sequence_evidence(_serialized(document))


def test_unsupported_sequence_schema_version_is_rejected():
    document = _valid_sequence_document()
    document["schema_version"] = 2

    with pytest.raises(
        ValueError,
        match="unsupported sequence schema_version",
    ):
        deserialize_verified_execution_sequence_evidence(_serialized(document))


def test_malformed_json_is_rejected():
    with pytest.raises(
        ValueError,
        match="invalid verified execution sequence evidence JSON",
    ):
        deserialize_verified_execution_sequence_evidence(
            '{"schema_version": 1',
        )


@pytest.mark.parametrize(
    ("original", "duplicate"),
    [
        (
            '"schema_version": 1',
            '"schema_version": 1, "schema_version": 1',
        ),
        (
            '"execution_id": "first"',
            '"execution_id": "first", "execution_id": "other"',
        ),
        (
            '"previous_execution_id": "first"',
            '"previous_execution_id": "first", '
            '"previous_execution_id": "other"',
        ),
    ],
    ids=["root", "nested-record", "nested-boundary"],
)
def test_duplicate_member_names_are_rejected(original, duplicate):
    serialized = _serialized(_valid_sequence_document()).replace(
        original,
        duplicate,
        1,
    )

    with pytest.raises(
        ValueError,
        match="duplicate JSON object member name",
    ):
        deserialize_verified_execution_sequence_evidence(serialized)


@pytest.mark.parametrize(
    ("mutation", "message"),
    [
        ("missing-root", "missing fields: outcome"),
        ("unexpected-root", "unexpected fields: extra"),
        ("missing-record", "missing fields: outcome"),
        ("unexpected-boundary", "unexpected fields: extra"),
    ],
)
def test_missing_and_unexpected_fields_are_rejected(mutation, message):
    document = _valid_sequence_document()

    if mutation == "missing-root":
        del document["outcome"]
    elif mutation == "unexpected-root":
        document["extra"] = None
    elif mutation == "missing-record":
        del document["records"][0]["outcome"]
    else:
        document["continuity_results"][0]["extra"] = None

    with pytest.raises(ValueError, match=re.escape(message)):
        deserialize_verified_execution_sequence_evidence(_serialized(document))


@pytest.mark.parametrize(
    ("mutation", "message"),
    [
        ("root-array", "must be a JSON object"),
        ("schema-string", "schema_version must be an integer"),
        ("records-object", "records must be a JSON array"),
        ("record-array", "records[0] must be a JSON object"),
        ("results-object", "continuity_results must be a JSON array"),
        ("result-array", "continuity_results[0] must be a JSON object"),
        ("previous-id-number", "previous_execution_id must be a string"),
        ("passed-number", "continuity_results[0].passed must be a boolean"),
        ("outcome-boolean", "outcome must be a string"),
    ],
)
def test_incorrect_container_and_primitive_types_are_rejected(
    mutation,
    message,
):
    document: object = _valid_sequence_document()

    if mutation == "root-array":
        document = []
    elif mutation == "schema-string":
        document["schema_version"] = "1"
    elif mutation == "records-object":
        document["records"] = {}
    elif mutation == "record-array":
        document["records"][0] = []
    elif mutation == "results-object":
        document["continuity_results"] = {}
    elif mutation == "result-array":
        document["continuity_results"][0] = []
    elif mutation == "previous-id-number":
        document["continuity_results"][0]["previous_execution_id"] = 1
    elif mutation == "passed-number":
        document["continuity_results"][0]["passed"] = 1
    else:
        document["outcome"] = True

    with pytest.raises(ValueError, match=re.escape(message)):
        deserialize_verified_execution_sequence_evidence(_serialized(document))


@pytest.mark.parametrize(
    "mutation",
    ["member-invariant", "member-outcome", "member-command"],
)
def test_corrupted_nested_verified_execution_is_rejected(mutation):
    document = _valid_sequence_document()
    member = document["records"][0]

    if mutation == "member-invariant":
        member["invariant_results"][0]["passed"] = False
    elif mutation == "member-outcome":
        member["outcome"] = "FAIL"
    else:
        member["observation"]["command"]["target_mode"] = "NOMINAL"

    with pytest.raises(ValueError):
        deserialize_verified_execution_sequence_evidence(_serialized(document))


@pytest.mark.parametrize("mutation", ["missing", "additional"])
def test_noncanonical_continuity_result_count_is_rejected(mutation):
    document = _valid_sequence_document()

    if mutation == "missing":
        document["continuity_results"] = []
    else:
        document["continuity_results"].append(
            deepcopy(document["continuity_results"][0]),
        )

    with pytest.raises(
        ValueError,
        match="continuity_results do not match canonical",
    ):
        deserialize_verified_execution_sequence_evidence(_serialized(document))


def test_continuity_result_order_mismatch_is_rejected():
    document = _valid_three_record_document()
    document["continuity_results"].reverse()

    with pytest.raises(
        ValueError,
        match="continuity_results do not match canonical",
    ):
        deserialize_verified_execution_sequence_evidence(_serialized(document))


@pytest.mark.parametrize(
    "mutation",
    [
        "previous-id",
        "next-id",
        "expected-mode",
        "observed-mode",
        "passed",
    ],
)
def test_corrupted_continuity_result_is_rejected(mutation):
    document = _valid_sequence_document()
    result = document["continuity_results"][0]

    if mutation == "previous-id":
        result["previous_execution_id"] = "other"
    elif mutation == "next-id":
        result["next_execution_id"] = "other"
    elif mutation == "expected-mode":
        result["expected_operating_mode"] = "NOMINAL"
        result["passed"] = False
    elif mutation == "observed-mode":
        result["observed_operating_mode"] = "NOMINAL"
        result["passed"] = False
    else:
        result["passed"] = False

    with pytest.raises(ValueError):
        deserialize_verified_execution_sequence_evidence(_serialized(document))


def test_unsupported_boundary_operating_mode_is_rejected():
    document = _valid_sequence_document()
    document["continuity_results"][0]["expected_operating_mode"] = "SCIENCE"

    with pytest.raises(ValueError, match="unsupported value"):
        deserialize_verified_execution_sequence_evidence(_serialized(document))


def test_aggregate_sequence_outcome_mismatch_is_rejected():
    document = _valid_sequence_document()
    document["outcome"] = "FAIL"

    with pytest.raises(
        ValueError,
        match="outcome does not match canonical sequence result",
    ):
        deserialize_verified_execution_sequence_evidence(_serialized(document))


def test_self_consistent_boundary_still_must_match_canonical_sequence():
    document = _valid_sequence_document()
    boundary = document["continuity_results"][0]
    boundary["expected_operating_mode"] = "NOMINAL"
    boundary["observed_operating_mode"] = "NOMINAL"
    boundary["passed"] = True

    with pytest.raises(
        ValueError,
        match="continuity_results do not match canonical",
    ):
        deserialize_verified_execution_sequence_evidence(_serialized(document))


def test_self_consistent_member_results_still_must_match_canonical_record():
    document = _valid_sequence_document()
    result = document["records"][0]["invariant_results"][0]
    result["expected"] = "SAFE"
    result["actual"] = "SAFE"
    result["passed"] = True

    with pytest.raises(
        ValueError,
        match="invariant_results do not match canonical",
    ):
        deserialize_verified_execution_sequence_evidence(_serialized(document))


def test_each_member_is_canonically_reconstructed_once(monkeypatch):
    original_builder = evidence_module.build_verified_execution_record
    calls = []

    def counting_builder(**kwargs):
        calls.append(kwargs["execution_id"])
        return original_builder(**kwargs)

    monkeypatch.setattr(
        evidence_module,
        "build_verified_execution_record",
        counting_builder,
    )

    deserialize_verified_execution_sequence_evidence(
        _serialized(_valid_sequence_document()),
    )

    assert calls == ["first", "second"]
