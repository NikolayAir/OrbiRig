"""HTTP boundary tests for verified-execution evidence inspection."""

import copy
import json

import pytest
from fastapi.testclient import TestClient

from orbirig import web


CLIENT = TestClient(web.app)
ENDPOINT = "/api/inspect/verified-execution"


def _verified_execution_document() -> dict[str, object]:
    return {
        "schema_version": 1,
        "execution": {
            "execution_id": "exec-web-001",
            "scenario_id": "nominal_to_safe_mode",
            "executed_at": "2026-08-17T10:15:30Z",
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
                "expected": "NOMINAL",
                "actual": "NOMINAL",
                "passed": True,
            },
            {
                "invariant_id": "acknowledgement_is_accepted",
                "expected": True,
                "actual": True,
                "passed": True,
            },
            {
                "invariant_id": "post_state_matches_requested_mode",
                "expected": "SAFE",
                "actual": "SAFE",
                "passed": True,
            },
            {
                "invariant_id": "telemetry_matches_post_state",
                "expected": "SAFE",
                "actual": "SAFE",
                "passed": True,
            },
        ],
        "outcome": "PASS",
    }


def _serialized_document(document: dict[str, object] | None = None) -> str:
    source = document if document is not None else _verified_execution_document()
    return json.dumps(source, indent=2)


def _fail_document() -> dict[str, object]:
    document = copy.deepcopy(_verified_execution_document())
    observation = document["observation"]
    assert isinstance(observation, dict)
    observation["telemetry"] = {"operating_mode": "NOMINAL"}

    results = document["invariant_results"]
    assert isinstance(results, list)
    telemetry_result = results[-1]
    assert isinstance(telemetry_result, dict)
    telemetry_result["actual"] = "NOMINAL"
    telemetry_result["passed"] = False
    document["outcome"] = "FAIL"
    return document


def test_valid_pass_evidence_returns_verified_execution_presentation() -> None:
    response = CLIENT.post(
        ENDPOINT,
        content=_serialized_document(),
        headers={"Content-Type": "text/plain; charset=utf-8"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "execution": {
            "execution_id": "exec-web-001",
            "executed_at": "2026-08-17T10:15:30Z",
            "scenario_id": "nominal_to_safe_mode",
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
                "expected": "NOMINAL",
                "actual": "NOMINAL",
                "passed": True,
            },
            {
                "invariant_id": "acknowledgement_is_accepted",
                "expected": True,
                "actual": True,
                "passed": True,
            },
            {
                "invariant_id": "post_state_matches_requested_mode",
                "expected": "SAFE",
                "actual": "SAFE",
                "passed": True,
            },
            {
                "invariant_id": "telemetry_matches_post_state",
                "expected": "SAFE",
                "actual": "SAFE",
                "passed": True,
            },
        ],
        "outcome": "PASS",
    }


def test_valid_fail_evidence_is_presented_as_valid_evidence() -> None:
    response = CLIENT.post(
        ENDPOINT,
        content=_serialized_document(_fail_document()),
        headers={"Content-Type": "text/plain"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["outcome"] == "FAIL"
    assert payload["invariant_results"][-1] == {
        "invariant_id": "telemetry_matches_post_state",
        "expected": "SAFE",
        "actual": "NOMINAL",
        "passed": False,
    }


def test_submitted_text_reaches_verified_execution_deserialiser_unchanged(
    monkeypatch,
) -> None:
    serialized = "  " + _serialized_document() + "\n"
    received: list[str] = []
    original_deserialiser = web.deserialize_verified_execution_evidence

    def capturing_deserialiser(value: str):
        received.append(value)
        return original_deserialiser(value)

    monkeypatch.setattr(
        web,
        "deserialize_verified_execution_evidence",
        capturing_deserialiser,
    )

    response = CLIENT.post(
        ENDPOINT,
        content=serialized,
        headers={"Content-Type": "text/plain; charset=utf-8"},
    )

    assert response.status_code == 200
    assert received == [serialized]


@pytest.mark.parametrize(
    "serialized",
    [
        "{not-json}",
        json.dumps({"schema_version": 1}),
    ],
)
def test_malformed_or_structurally_invalid_evidence_is_rejected(
    serialized: str,
) -> None:
    response = CLIENT.post(
        ENDPOINT,
        content=serialized,
        headers={"Content-Type": "text/plain"},
    )

    assert response.status_code == 422
    assert response.json() == {"detail": "verified execution evidence is invalid"}


def test_inconsistent_persisted_invariant_result_is_rejected() -> None:
    document = _verified_execution_document()
    results = document["invariant_results"]
    assert isinstance(results, list)
    first_result = results[0]
    assert isinstance(first_result, dict)
    first_result["passed"] = False

    response = CLIENT.post(
        ENDPOINT,
        content=_serialized_document(document),
        headers={"Content-Type": "text/plain"},
    )

    assert response.status_code == 422


def test_inconsistent_persisted_outcome_is_rejected() -> None:
    document = _verified_execution_document()
    document["outcome"] = "FAIL"

    response = CLIENT.post(
        ENDPOINT,
        content=_serialized_document(document),
        headers={"Content-Type": "text/plain"},
    )

    assert response.status_code == 422


def test_duplicate_member_names_reach_strict_deserialisation() -> None:
    serialized = _serialized_document().replace(
        '"schema_version": 1,',
        '"schema_version": 1,\n  "schema_version": 1,',
        1,
    )

    response = CLIENT.post(
        ENDPOINT,
        content=serialized,
        headers={"Content-Type": "text/plain"},
    )

    assert response.status_code == 422


def test_invalid_utf8_is_rejected_before_deserialisation(monkeypatch) -> None:
    def unexpected_deserialisation(serialized: str):
        raise AssertionError(f"deserialiser received {serialized!r}")

    monkeypatch.setattr(
        web,
        "deserialize_verified_execution_evidence",
        unexpected_deserialisation,
    )

    response = CLIENT.post(
        ENDPOINT,
        content=b"\xff",
        headers={"Content-Type": "text/plain"},
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "evidence must be valid UTF-8"}


def test_unsupported_content_type_is_rejected() -> None:
    response = CLIENT.post(
        ENDPOINT,
        content=_serialized_document(),
        headers={"Content-Type": "application/json"},
    )

    assert response.status_code == 415
    assert response.json() == {"detail": "only text/plain evidence is supported"}
