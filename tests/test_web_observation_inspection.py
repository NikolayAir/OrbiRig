"""HTTP boundary tests for read-only observation-evidence inspection."""

import json

from fastapi.testclient import TestClient

import orbirig.web as web


CLIENT = TestClient(web.app)
OBSERVATION_ENDPOINT = "/api/inspect/observation"


def _observation_document() -> dict[str, object]:
    return {
        "evidence_format_version": 1,
        "command": {
            "command_type": "SET_OPERATING_MODE",
            "target_mode": "SAFE",
        },
        "pre_state": {
            "operating_mode": "NOMINAL",
        },
        "acknowledgement": {
            "accepted": True,
        },
        "post_state": {
            "operating_mode": "SAFE",
        },
        "telemetry": {
            "operating_mode": "SAFE",
        },
    }


def _serialized_observation() -> str:
    return json.dumps(_observation_document(), indent=2)


def _post_evidence(content: str | bytes, **headers: str):
    return CLIENT.post(
        OBSERVATION_ENDPOINT,
        content=content,
        headers={"content-type": "text/plain", **headers},
    )


def test_valid_raw_observation_evidence_returns_presentation_data():
    response = _post_evidence(_serialized_observation())

    assert response.status_code == 200
    assert response.json() == {
        "command": {
            "command_type": "SET_OPERATING_MODE",
            "target_mode": "SAFE",
        },
        "pre_state": {
            "operating_mode": "NOMINAL",
        },
        "acknowledgement": {
            "accepted": True,
        },
        "post_state": {
            "operating_mode": "SAFE",
        },
        "telemetry": {
            "operating_mode": "SAFE",
        },
    }


def test_submitted_text_reaches_deserialiser_unchanged(monkeypatch):
    submitted = _serialized_observation()
    received = []
    deserialize = web.deserialize_execution_evidence

    def capture(serialized: str):
        received.append(serialized)
        return deserialize(serialized)

    monkeypatch.setattr(web, "deserialize_execution_evidence", capture)

    response = _post_evidence(submitted)

    assert response.status_code == 200
    assert received == [submitted]


def test_malformed_observation_evidence_is_rejected():
    response = _post_evidence('{"evidence_format_version": 1')

    assert response.status_code == 422
    assert response.json() == {"detail": "observation evidence is invalid"}


def test_duplicate_root_member_is_rejected_without_json_normalisation():
    serialized = _serialized_observation().replace(
        '  "evidence_format_version": 1,',
        '  "evidence_format_version": 1,\n'
        '  "evidence_format_version": 1,',
        1,
    )

    response = _post_evidence(serialized)

    assert response.status_code == 422
    assert response.json() == {"detail": "observation evidence is invalid"}


def test_duplicate_nested_member_is_rejected_without_json_normalisation():
    serialized = _serialized_observation().replace(
        '    "accepted": true',
        '    "accepted": true,\n'
        '    "accepted": true',
        1,
    )

    response = _post_evidence(serialized)

    assert response.status_code == 422
    assert response.json() == {"detail": "observation evidence is invalid"}


def test_invalid_utf8_is_rejected_before_deserialisation(monkeypatch):
    def unexpected_deserialisation(serialized: str):
        raise AssertionError(
            f"deserialiser unexpectedly received {serialized!r}",
        )

    monkeypatch.setattr(
        web,
        "deserialize_execution_evidence",
        unexpected_deserialisation,
    )

    response = _post_evidence(b"\xff")

    assert response.status_code == 400
    assert response.json() == {"detail": "evidence must be valid UTF-8"}


def test_unsupported_content_type_is_rejected():
    response = CLIENT.post(
        OBSERVATION_ENDPOINT,
        content=_serialized_observation(),
        headers={"content-type": "application/json"},
    )

    assert response.status_code == 415
    assert response.json() == {
        "detail": "only text/plain evidence is supported",
    }


def test_successful_response_contains_no_verification_classification():
    response = _post_evidence(_serialized_observation())
    rendered = json.dumps(response.json())

    assert response.status_code == 200
    assert "scenario_id" not in rendered
    assert "PASS" not in rendered
    assert "FAIL" not in rendered
