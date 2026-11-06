"""Safe, useful HTTP diagnostics across the untrusted evidence boundary."""

import json
from copy import deepcopy
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from orbirig import web
from orbirig.web import app

CLIENT = TestClient(app, raise_server_exceptions=False)
EXAMPLES = Path(__file__).resolve().parents[1] / "docs/examples"


def _record():
    return json.loads((EXAMPLES / "verified-execution.json").read_text(encoding="utf-8"))


def _inspect(document, kind="verified-execution-sequence"):
    return CLIENT.post(f"/api/inspect/{kind}", content=json.dumps(document), headers={"content-type": "text/plain"})


@pytest.mark.parametrize("kind,filename,missing", [
    ("observation", "verified-execution.json", "acknowledgement, command, evidence_format_version, post_state, pre_state, telemetry"),
    ("observation", "verified-sequence.json", "acknowledgement, command, evidence_format_version, post_state, pre_state, telemetry"),
    ("verified-execution", "nominal-to-safe.json", "execution, invariant_results, observation, outcome, schema_version"),
    ("verified-execution", "verified-sequence.json", "execution, invariant_results, observation"),
    ("verified-execution-sequence", "nominal-to-safe.json", "continuity_results, outcome, records, schema_version"),
    ("verified-execution-sequence", "verified-execution.json", "continuity_results, records"),
])
def test_selected_evidence_type_rejects_other_supported_documents(kind, filename, missing):
    document = json.loads((EXAMPLES / filename).read_text(encoding="utf-8"))

    response = _inspect(document, kind)

    assert response.status_code == 422
    assert response.json() == {"detail": (
        f"{kind.replace('-', ' ')} evidence is invalid. {kind.replace('-', ' ')} evidence: "
        f"missing required fields: {missing}; unexpected fields are present"
    )}


@pytest.mark.parametrize("value,reason", [
    (None, "must be a string"), (True, "must be a string"),
    ([], "must be a string"), ({}, "must be a string"),
    (float("nan"), "must be a string"), (float("inf"), "must be a string"),
    ("private-input\n/path/<script>" * 1000, "unsupported value"),
    ("\ud800", "unsupported value"),
])
def test_long_sequence_identifies_the_bad_member_without_echoing_values(value, reason):
    records = [deepcopy(_record()) for _ in range(100)]
    records[57]["observation"]["telemetry"]["operating_mode"] = value
    document = {"schema_version": 1, "records": records, "continuity_results": [], "outcome": "PASS"}

    response = _inspect(document)

    assert response.status_code == 422
    assert response.json() == {"detail": (
        "verified execution sequence evidence is invalid. "
        f"records[57].observation.telemetry.operating_mode: {reason}"
    )}
    assert len(response.content) < 512


def test_stored_results_mismatch_has_its_member_path():
    records = [_record(), _record()]
    records[1]["invariant_results"][0]["passed"] = False
    response = _inspect({"schema_version": 1, "records": records, "continuity_results": [], "outcome": "PASS"})
    assert response.status_code == 422
    assert response.json()["detail"].endswith("records[1].invariant_results: stored checks do not match recomputed checks")


@pytest.mark.parametrize("kind,filename", [
    ("observation", "nominal-to-safe.json"), ("verified-execution", "verified-execution.json"),
    ("verified-execution-sequence", "verified-sequence.json"),
])
def test_unexpected_member_names_are_never_exposed(kind, filename):
    document = json.loads((EXAMPLES / filename).read_text(encoding="utf-8"))
    document["private-key\n/path/<script>" * 1000] = "private-value"
    response = _inspect(document, kind)
    assert response.status_code == 422
    assert "unexpected fields are present" in response.json()["detail"]
    assert "private-" not in response.text
    assert len(response.content) < 512


def test_verification_preserves_code_and_reports_observation_path():
    document = json.loads((EXAMPLES / "nominal-to-safe.json").read_text(encoding="utf-8"))
    document["acknowledgement"]["accepted"] = "false"
    response = CLIENT.post("/api/verify/observation", json={
        "execution_id": "diagnostic", "executed_at": "2026-11-01T10:00:00Z",
        "scenario_id": "nominal_to_safe_mode", "observation_evidence": json.dumps(document),
    })
    assert response.status_code == 422
    assert response.json() == {"detail": {
        "code": "invalid_observation_evidence",
        "message": "observation evidence is invalid. acknowledgement.accepted: must be a boolean",
    }}


@pytest.mark.parametrize("kind,reader", [
    ("observation", "deserialize_execution_evidence"),
    ("verified-execution", "deserialize_verified_execution_evidence"),
    ("verified-execution-sequence", "deserialize_verified_execution_sequence_evidence"),
])
def test_unknown_value_errors_do_not_expose_arbitrary_exception_text(monkeypatch, kind, reader):
    def reject(_serialized):
        raise ValueError("private input or internal path /home/example")

    monkeypatch.setattr(web, reader, reject)
    response = _inspect({}, kind)

    assert response.status_code == 422
    assert response.json() == {"detail": kind.replace("-", " ") + " evidence is invalid"}
