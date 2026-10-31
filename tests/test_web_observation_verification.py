"""HTTP boundary tests for interactive observation verification."""

import json

import pytest
from fastapi.testclient import TestClient

from orbirig import web

CLIENT = TestClient(web.app)
CLIENT_WITH_SERVER_ERRORS = TestClient(
    web.app,
    raise_server_exceptions=False,
)
ENDPOINT = "/api/verify/observation"


def _observation_document(
    *,
    target_mode: str = "SAFE",
    pre_mode: str = "NOMINAL",
    accepted: bool = True,
    post_mode: str = "SAFE",
    telemetry_mode: str = "SAFE",
) -> dict[str, object]:
    return {
        "evidence_format_version": 1,
        "command": {
            "command_type": "SET_OPERATING_MODE",
            "target_mode": target_mode,
        },
        "pre_state": {"operating_mode": pre_mode},
        "acknowledgement": {"accepted": accepted},
        "post_state": {"operating_mode": post_mode},
        "telemetry": {"operating_mode": telemetry_mode},
    }


def _verification_request(
    *,
    execution_id: object = "exec-web-verify-001",
    executed_at: object = "2026-08-25T18:30:00Z",
    scenario_id: object = "nominal_to_safe_mode",
    observation_evidence: object | None = None,
) -> dict[str, object]:
    return {
        "execution_id": execution_id,
        "executed_at": executed_at,
        "scenario_id": scenario_id,
        "observation_evidence": (
            json.dumps(_observation_document(), indent=2)
            if observation_evidence is None
            else observation_evidence
        ),
    }


def _post(
    document: dict[str, object],
    *,
    client: TestClient = CLIENT,
):
    return client.post(ENDPOINT, json=document)


def _assert_error(response, code: str) -> None:
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == code


def _deeply_nested_json() -> str:
    # Python 3.14+ checks C-stack usage and can decode 10,000 nested arrays.
    depth = 500_000
    return "[" * depth + "null" + "]" * depth


def test_canonical_pass_returns_verified_execution_presentation() -> None:
    response = _post(_verification_request())

    assert response.status_code == 200
    payload = response.json()
    assert payload["execution"] == {
        "execution_id": "exec-web-verify-001",
        "executed_at": "2026-08-25T18:30:00Z",
        "scenario_id": "nominal_to_safe_mode",
    }
    assert payload["observation"] == {
        "command": {
            "command_type": "SET_OPERATING_MODE",
            "target_mode": "SAFE",
        },
        "pre_state": {"operating_mode": "NOMINAL"},
        "acknowledgement": {"accepted": True},
        "post_state": {"operating_mode": "SAFE"},
        "telemetry": {"operating_mode": "SAFE"},
    }
    assert payload["outcome"] == "PASS"
    assert all(result["passed"] for result in payload["invariant_results"])


def test_canonical_fail_is_a_completed_verification_result() -> None:
    evidence = json.dumps(
        _observation_document(telemetry_mode="NOMINAL"),
    )

    response = _post(
        _verification_request(observation_evidence=evidence),
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


def test_explicit_non_default_scenario_controls_verification() -> None:
    evidence = json.dumps(
        _observation_document(
            target_mode="NOMINAL",
            pre_mode="SAFE",
            post_mode="NOMINAL",
            telemetry_mode="NOMINAL",
        ),
    )

    response = _post(
        _verification_request(
            scenario_id="safe_to_nominal_mode",
            observation_evidence=evidence,
        ),
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["execution"]["scenario_id"] == "safe_to_nominal_mode"
    assert payload["outcome"] == "PASS"


def test_unsupported_scenario_has_stable_error_category() -> None:
    response = _post(_verification_request(scenario_id="unknown"))

    _assert_error(response, "invalid_scenario")


def test_verification_request_requires_json_content_type() -> None:
    response = CLIENT.post(
        ENDPOINT,
        content="plain text",
        headers={"Content-Type": "text/plain"},
    )

    assert response.status_code == 415
    assert response.json()["detail"]["code"] == "invalid_request"


def test_malformed_outer_request_has_stable_error_category() -> None:
    response = CLIENT.post(
        ENDPOINT,
        content="{not-json}",
        headers={"Content-Type": "application/json"},
    )

    _assert_error(response, "invalid_request")


def test_excessively_nested_outer_request_is_invalid_request() -> None:
    response = CLIENT.post(
        ENDPOINT,
        content=_deeply_nested_json(),
        headers={"Content-Type": "application/json"},
    )

    _assert_error(response, "invalid_request")


@pytest.mark.parametrize(
    "duplicate_name",
    ["execution_id", r"execution_\u0069d"],
    ids=["literal-name", "escaped-name"],
)
def test_duplicate_outer_member_is_invalid_request(duplicate_name) -> None:
    serialized = json.dumps(_verification_request(), indent=2).replace(
        '  "execution_id": "exec-web-verify-001",',
        f'  "execution_id": "first",\n  "{duplicate_name}": "second",',
        1,
    )

    response = CLIENT.post(
        ENDPOINT,
        content=serialized,
        headers={"Content-Type": "application/json"},
    )

    _assert_error(response, "invalid_request")


@pytest.mark.parametrize(
    ("document", "code"),
    [
        ({}, "invalid_request"),
        (
            _verification_request(execution_id=1),
            "invalid_execution_metadata",
        ),
        (_verification_request(scenario_id=1), "invalid_scenario"),
        (
            _verification_request(observation_evidence=1),
            "invalid_observation_evidence",
        ),
    ],
    ids=[
        "invalid-fields",
        "non-string-execution-metadata",
        "non-string-scenario",
        "non-string-observation-evidence",
    ],
)
def test_invalid_outer_request_fields_have_stable_error_categories(
    document: dict[str, object],
    code: str,
) -> None:
    response = _post(document)

    _assert_error(response, code)


def test_invalid_observation_evidence_has_stable_error_category() -> None:
    response = _post(
        _verification_request(observation_evidence="{not-json}"),
    )

    _assert_error(response, "invalid_observation_evidence")


def test_empty_execution_id_has_stable_error_category() -> None:
    response = _post(_verification_request(execution_id="  "))

    _assert_error(response, "invalid_execution_metadata")


@pytest.mark.parametrize("execution_id", ["before\ud800after", "before\udfffafter"])
def test_surrogate_execution_id_has_no_verification_result(execution_id):
    response = CLIENT_WITH_SERVER_ERRORS.post(
        ENDPOINT,
        content=json.dumps(_verification_request(execution_id=execution_id)),
        headers={"Content-Type": "application/json"},
    )

    assert response.status_code == 422
    assert response.json() == {
        "detail": {
            "code": "invalid_execution_metadata",
            "message": "execution ID or UTC execution timestamp is invalid",
        },
    }


@pytest.mark.parametrize("ensure_ascii", [True, False], ids=["escaped", "literal"])
def test_unicode_execution_id_is_preserved_in_verification(ensure_ascii):
    execution_id = "  essai-e\u0301-🚀-𐐷  "
    response = CLIENT.post(
        ENDPOINT,
        content=json.dumps(
            _verification_request(execution_id=execution_id),
            ensure_ascii=ensure_ascii,
        ),
        headers={"Content-Type": "application/json"},
    )

    assert response.status_code == 200
    assert response.json()["execution"]["execution_id"] == execution_id
    assert response.json()["outcome"] == "PASS"


def test_invalid_execution_timestamp_has_stable_error_category() -> None:
    response = _post(_verification_request(executed_at="not-a-timestamp"))

    _assert_error(response, "invalid_execution_metadata")


def test_non_utc_execution_timestamp_has_stable_error_category() -> None:
    response = _post(
        _verification_request(executed_at="2026-08-25T20:30:00+02:00"),
    )

    _assert_error(response, "invalid_execution_metadata")


@pytest.mark.parametrize(("timestamp", "expected"), [
    ("2026-08-15 12:00:00-0000", "2026-08-15T12:00:00Z"),
    ("2026W336T120000+00:00:00.0000000", "2026-08-15T12:00:00Z"),
    ("2026-08-15T12:00:00.000001Z", "2026-08-15T12:00:00.000001Z"),
    ("2026-08-15T12:00:00,1234560Z", "2026-08-15T12:00:00.123456Z"),
    ("2026-08-15T12:00:00.999999Z", "2026-08-15T12:00:00.999999Z"),
    ("2026-W33-120000.5Z", "2026-08-10T12:00:00.500000Z"),
    ("2026-W33-230000,1234560Z", "2026-08-10T23:00:00.123456Z"),
])
def test_lossless_execution_timestamp_forms_preserve_time(timestamp, expected):
    response = _post(_verification_request(executed_at=timestamp))

    assert response.status_code == 200
    assert response.json()["execution"]["executed_at"] == expected
    assert response.json()["outcome"] == "PASS"


@pytest.mark.parametrize("timestamp", [
    "2026-08-15T12:00:00.1234567Z",
    "2026-08-15T12:00:00,0000001+00:00",
    "2026-08-15T12:00:00+00:00:00.5",
    "2026-08-15T12:00:00-00:00:00.5",
    "2026-08-15T12:00:00+00:00:00.0000001",
    "2026-08-15T12:00:00+00:00:01",
    "2026-08-15T24:00:00Z",
    "2026-08-15T12.5Z",
    "2026-08-15T12:00,5Z",
    "2026-W33-240000Z",
    "2026-W33-2400.0000000Z",
    "2026-W33-120000.1234567Z",
])
def test_unsupported_timestamp_is_invalid_metadata_without_verification(timestamp):
    response = _post(_verification_request(executed_at=timestamp))

    _assert_error(response, "invalid_execution_metadata")
    assert set(response.json()) == {"detail"}


@pytest.mark.parametrize(("timestamp", "message"), [
    (
        "2026-08-15T12:00:00.1234567Z",
        (
            "fractional seconds may have more than 6 decimal places "
            "only if the extra digits are zero"
        ),
    ),
    (
        "2026-08-15T12:00:00+00:00:00.5",
        "timestamp must be ISO 8601 with a zero UTC offset and hours 00–23",
    ),
    (
        "2026-08-15T12.5Z",
        "non-zero fractions of hours or minutes are unsupported",
    ),
    ("2026-02-30T12:00:00Z", "timestamp must be a valid UTC date and time"),
])
def test_invalid_timestamp_reports_the_controlled_reason(timestamp, message):
    response = _post(_verification_request(executed_at=timestamp))

    assert response.status_code == 422
    assert response.json() == {
        "detail": {"code": "invalid_execution_metadata", "message": message},
    }


def test_scenario_command_mismatch_has_stable_error_category() -> None:
    response = _post(
        _verification_request(scenario_id="safe_to_nominal_mode"),
    )

    _assert_error(response, "scenario_command_mismatch")


@pytest.mark.parametrize(
    "duplicate_name",
    ["accepted", r"\u0061ccepted"],
    ids=["literal-name", "escaped-name"],
)
def test_duplicate_inner_member_reaches_strict_evidence_boundary(duplicate_name) -> None:
    # The outer request must preserve the inner escape sequence until evidence parsing.
    serialized = json.dumps(_observation_document(), indent=2).replace(
        '    "accepted": true',
        f'    "accepted": true,\n    "{duplicate_name}": true',
        1,
    )

    response = _post(
        _verification_request(observation_evidence=serialized),
    )

    _assert_error(response, "invalid_observation_evidence")


def test_inner_evidence_text_reaches_deserialiser_unchanged(
    monkeypatch,
) -> None:
    serialized = "  " + json.dumps(_observation_document()) + "\n"
    received: list[str] = []
    original_deserialiser = web.deserialize_execution_evidence

    def capturing_deserialiser(value: str):
        received.append(value)
        return original_deserialiser(value)

    monkeypatch.setattr(
        web,
        "deserialize_execution_evidence",
        capturing_deserialiser,
    )

    response = _post(
        _verification_request(observation_evidence=serialized),
    )

    assert response.status_code == 200
    assert received == [serialized]


def test_unexpected_outer_parser_error_remains_a_server_error(
    monkeypatch,
) -> None:
    def fail_unexpectedly(*_args, **_kwargs):
        raise ValueError("unexpected parser failure")

    monkeypatch.setattr(web, "_load_strict_json", fail_unexpectedly)

    response = _post(
        _verification_request(),
        client=CLIENT_WITH_SERVER_ERRORS,
    )

    assert response.status_code == 500


@pytest.mark.parametrize("function", [
    "parse_utc_timestamp", "build_verified_execution_record",
])
def test_unexpected_internal_error_remains_a_server_error(monkeypatch, function) -> None:
    def fail_unexpectedly(*_args, **_kwargs):
        raise ValueError("unexpected verification failure")

    monkeypatch.setattr(
        web,
        function,
        fail_unexpectedly,
    )

    response = _post(
        _verification_request(),
        client=CLIENT_WITH_SERVER_ERRORS,
    )

    assert response.status_code == 500
