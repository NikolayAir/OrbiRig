"""HTTP boundary tests for verified-execution-sequence evidence inspection."""

from datetime import datetime, timezone

from fastapi.testclient import TestClient

from orbirig import web
from orbirig.evidence import serialize_verified_execution_sequence_evidence
from orbirig.execution import build_verified_execution_record
from orbirig.models import (
    Acknowledgement,
    CommandExecutionObservation,
    OperatingMode,
    ScenarioId,
    SetOperatingModeCommand,
    SpacecraftState,
    TelemetrySnapshot,
)
from orbirig.verification import verify_execution_sequence


CLIENT = TestClient(web.app)
ENDPOINT = "/api/inspect/verified-execution-sequence"
EARLIER = datetime(2026, 8, 17, 10, tzinfo=timezone.utc)
MIDDLE = datetime(2026, 8, 17, 12, tzinfo=timezone.utc)
LATER = datetime(2026, 8, 17, 14, tzinfo=timezone.utc)


def _record(
    *,
    execution_id: str,
    executed_at: datetime,
    scenario_id: ScenarioId,
    pre_mode: OperatingMode,
    accepted: bool,
    post_mode: OperatingMode,
):
    target_mode = (
        OperatingMode.SAFE
        if scenario_id is ScenarioId.NOMINAL_TO_SAFE_MODE
        else OperatingMode.NOMINAL
    )
    observation = CommandExecutionObservation(
        command=SetOperatingModeCommand(target_mode),
        pre_state=SpacecraftState(pre_mode),
        acknowledgement=Acknowledgement(accepted),
        post_state=SpacecraftState(post_mode),
        telemetry=TelemetrySnapshot(post_mode),
    )
    return build_verified_execution_record(
        execution_id=execution_id,
        executed_at=executed_at,
        scenario_id=scenario_id,
        observation=observation,
    )


def _passing_sequence():
    return verify_execution_sequence(
        (
            _record(
                execution_id="exec-b",
                executed_at=LATER,
                scenario_id=ScenarioId.NOMINAL_TO_SAFE_MODE,
                pre_mode=OperatingMode.NOMINAL,
                accepted=True,
                post_mode=OperatingMode.SAFE,
            ),
            _record(
                execution_id="exec-a",
                executed_at=EARLIER,
                scenario_id=ScenarioId.SAFE_TO_NOMINAL_MODE,
                pre_mode=OperatingMode.SAFE,
                accepted=True,
                post_mode=OperatingMode.NOMINAL,
            ),
            _record(
                execution_id="exec-c",
                executed_at=MIDDLE,
                scenario_id=ScenarioId.NOMINAL_TO_NOMINAL_REJECTION,
                pre_mode=OperatingMode.NOMINAL,
                accepted=False,
                post_mode=OperatingMode.NOMINAL,
            ),
        ),
    )


def _discontinuous_sequence():
    return verify_execution_sequence(
        (
            _record(
                execution_id="exec-b",
                executed_at=LATER,
                scenario_id=ScenarioId.NOMINAL_TO_SAFE_MODE,
                pre_mode=OperatingMode.NOMINAL,
                accepted=True,
                post_mode=OperatingMode.SAFE,
            ),
            _record(
                execution_id="exec-c",
                executed_at=MIDDLE,
                scenario_id=ScenarioId.NOMINAL_TO_NOMINAL_REJECTION,
                pre_mode=OperatingMode.NOMINAL,
                accepted=False,
                post_mode=OperatingMode.NOMINAL,
            ),
        ),
    )


def _post_evidence(content: str | bytes, *, content_type: str = "text/plain"):
    return CLIENT.post(
        ENDPOINT,
        content=content,
        headers={"Content-Type": content_type},
    )


def test_submitted_text_reaches_sequence_deserialiser_unchanged(monkeypatch) -> None:
    serialized = "  " + serialize_verified_execution_sequence_evidence(
        _passing_sequence(),
    )
    received: list[str] = []
    original_deserialiser = web.deserialize_verified_execution_sequence_evidence

    def capturing_deserialiser(value: str):
        received.append(value)
        return original_deserialiser(value)

    monkeypatch.setattr(
        web,
        "deserialize_verified_execution_sequence_evidence",
        capturing_deserialiser,
    )

    response = _post_evidence(
        serialized,
        content_type="text/plain; charset=utf-8",
    )

    assert response.status_code == 200
    assert received == [serialized]


def test_valid_sequence_presentation_preserves_record_and_boundary_order() -> None:
    response = _post_evidence(
        serialize_verified_execution_sequence_evidence(_passing_sequence()),
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["outcome"] == "PASS"
    assert [
        record["execution"]["execution_id"]
        for record in payload["records"]
    ] == ["exec-b", "exec-a", "exec-c"]
    assert [
        record["execution"]["executed_at"]
        for record in payload["records"]
    ] == [
        "2026-08-17T14:00:00Z",
        "2026-08-17T10:00:00Z",
        "2026-08-17T12:00:00Z",
    ]
    assert [
        (
            result["previous_execution_id"],
            result["next_execution_id"],
            result["expected_operating_mode"],
            result["observed_operating_mode"],
            result["passed"],
        )
        for result in payload["continuity_results"]
    ] == [
        ("exec-b", "exec-a", "SAFE", "SAFE", True),
        ("exec-a", "exec-c", "NOMINAL", "NOMINAL", True),
    ]
    assert payload["records"][0]["invariant_results"][0] == {
        "invariant_id": "pre_state_matches_expected",
        "expected": "NOMINAL",
        "actual": "NOMINAL",
        "passed": True,
    }


def test_continuity_fail_sequence_is_presented_as_valid_evidence() -> None:
    response = _post_evidence(
        serialize_verified_execution_sequence_evidence(
            _discontinuous_sequence(),
        ),
    )

    assert response.status_code == 200
    payload = response.json()
    assert [record["outcome"] for record in payload["records"]] == [
        "PASS",
        "PASS",
    ]
    assert payload["continuity_results"] == [
        {
            "previous_execution_id": "exec-b",
            "next_execution_id": "exec-c",
            "expected_operating_mode": "SAFE",
            "observed_operating_mode": "NOMINAL",
            "passed": False,
        },
    ]
    assert payload["outcome"] == "FAIL"


def test_invalid_sequence_evidence_is_rejected() -> None:
    response = _post_evidence('{"schema_version": 1}')

    assert response.status_code == 422
    assert response.json() == {
        "detail": "verified execution sequence evidence is invalid",
    }


def test_invalid_utf8_is_rejected_before_sequence_deserialisation(
    monkeypatch,
) -> None:
    def unexpected_deserialisation(serialized: str):
        raise AssertionError(f"deserialiser received {serialized!r}")

    monkeypatch.setattr(
        web,
        "deserialize_verified_execution_sequence_evidence",
        unexpected_deserialisation,
    )

    response = _post_evidence(b"\xff")

    assert response.status_code == 400
    assert response.json() == {"detail": "evidence must be valid UTF-8"}


def test_unsupported_content_type_is_rejected() -> None:
    response = _post_evidence(
        serialize_verified_execution_sequence_evidence(_passing_sequence()),
        content_type="application/json",
    )

    assert response.status_code == 415
    assert response.json() == {
        "detail": "only text/plain evidence is supported",
    }
