"""Evidence request limits exercised through the HTTP and ASGI boundaries."""

import asyncio
import json
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from httpx import ASGITransport, AsyncClient

from orbirig import web
from orbirig.evidence import (
    deserialize_execution_evidence,
    serialize_verified_execution_evidence,
    serialize_verified_execution_sequence_evidence,
)
from orbirig.models import ScenarioId
from orbirig.verification import (
    build_verified_execution_record,
    verify_execution_sequence,
)

LIMIT = 4 * 1024 * 1024
ENDPOINTS = [
    "/api/inspect/observation",
    "/api/verify/observation",
    "/api/inspect/verified-execution",
    "/api/inspect/verified-execution-sequence",
]
# Escaped keys and CRLF line endings expose changes to submitted evidence text.
OBSERVATION = r'''{
  "evidence_format_version": 1,
  "\u0063ommand": {"command_type": "SET_OPERATING_MODE", "target_mode": "SAFE"},
  "pre_state": {"operating_mode": "NOMINAL"},
  "acknowledgement": {"accepted": true},
  "post_state": {"operating_mode": "SAFE"},
  "telemetry": {"operating_mode": "NOMINAL"}
}'''.replace("\n", "\r\n")


def _content_type(endpoint: str) -> str:
    return "application/json" if endpoint == ENDPOINTS[1] else "text/plain"


def _submission(endpoint: str) -> tuple[bytes, str, str]:
    """Return valid evidence with a deliberate verification mismatch."""

    if endpoint == ENDPOINTS[0]:
        return OBSERVATION.encode(), OBSERVATION, "deserialize_execution_evidence"
    metadata = {
        "execution_id": "exécution-é",
        "executed_at": "2026-10-17T12:00:00Z",
        "scenario_id": "nominal_to_safe_mode",
    }
    if endpoint == ENDPOINTS[1]:
        body = json.dumps(
            {**metadata, "observation_evidence": OBSERVATION},
            ensure_ascii=False,
        ).encode()
        return body, OBSERVATION, "deserialize_execution_evidence"
    record = build_verified_execution_record(
        execution_id=metadata["execution_id"],
        executed_at=datetime(2026, 10, 17, 12, tzinfo=UTC),
        scenario_id=ScenarioId.NOMINAL_TO_SAFE_MODE,
        observation=deserialize_execution_evidence(OBSERVATION),
    )
    if endpoint == ENDPOINTS[2]:
        serialized = serialize_verified_execution_evidence(record)
        deserialiser = "deserialize_verified_execution_evidence"
    else:
        serialized = serialize_verified_execution_sequence_evidence(
            verify_execution_sequence((record, record)),
        )
        deserialiser = "deserialize_verified_execution_sequence_evidence"
    # Serialisers escape non-ASCII characters; send their literal UTF-8 form.
    serialized = serialized.replace(r"\u00e9", "é").replace("\n", "\r\n")
    return serialized.encode(), serialized, deserialiser


def _forbid_processing(monkeypatch) -> None:
    def unexpected(*_args, **_kwargs):
        pytest.fail("Oversized requests must not parse or verify evidence.")

    for name in (
        "_load_strict_json",
        "deserialize_execution_evidence",
        "deserialize_verified_execution_evidence",
        "deserialize_verified_execution_sequence_evidence",
        "build_verified_execution_record",
    ):
        monkeypatch.setattr(web, name, unexpected)


def _assert_too_large(response) -> None:
    assert response.status_code == 413
    assert response.json() == {
        "detail": "evidence request body must not exceed 4194304 bytes (4 MiB)",
    }


@pytest.mark.parametrize("endpoint", ENDPOINTS)
@pytest.mark.parametrize("extra", [0, 1])
def test_actual_byte_limit_is_inclusive(monkeypatch, endpoint, extra):
    body, submitted, deserialiser_name = _submission(endpoint)
    body += b" " * (LIMIT - len(body) + extra)
    assert len(body) == LIMIT + extra
    received = []
    if extra:
        _forbid_processing(monkeypatch)
    else:
        original = getattr(web, deserialiser_name)

        def capture(value):
            received.append(value)
            return original(value)

        monkeypatch.setattr(web, deserialiser_name, capture)
    response = TestClient(web.app).post(
        endpoint, content=body, headers={"content-type": _content_type(endpoint)},
    )
    if extra:
        _assert_too_large(response)
    else:
        assert response.status_code == 200
        expected = submitted if endpoint == ENDPOINTS[1] else body.decode("utf-8")
        assert received == [expected]
        if endpoint != ENDPOINTS[0]:
            assert response.json()["outcome"] == "FAIL"


@pytest.mark.parametrize("endpoint", ENDPOINTS)
@pytest.mark.parametrize("length", [None, "1"])
def test_stream_rejects_crossing_chunk_without_consuming_later_chunks(
    monkeypatch, endpoint, length,
):
    _forbid_processing(monkeypatch)

    async def exercise():
        async def chunks():
            yield b" " * (LIMIT - 1)
            yield b" "  # At the byte limit; one more byte must trigger HTTP 413.
            yield b"x"
            pytest.fail("The request must not consume chunks after the excess.")

        headers = {"content-type": _content_type(endpoint)}
        if length is not None:
            headers["content-length"] = length
        async with AsyncClient(
            transport=ASGITransport(app=web.app), base_url="http://test",
        ) as client:
            request = client.build_request(
                "POST", endpoint, content=chunks(), headers=headers,
            )
            assert request.headers.get("content-length") == length
            return await client.send(request)

    _assert_too_large(asyncio.run(exercise()))


@pytest.mark.parametrize("endpoint", ENDPOINTS)
def test_stream_preserves_accepted_bytes_across_utf8_chunk_boundaries(
    monkeypatch, endpoint,
):
    body, submitted, deserialiser_name = _submission(endpoint)
    received = []
    original = getattr(web, deserialiser_name)

    def capture(value):
        received.append(value)
        return original(value)

    monkeypatch.setattr(web, deserialiser_name, capture)
    # Split every UTF-8 character into individual bytes, including inside IDs.
    async def exercise():
        async def chunks():
            for index in range(len(body)):
                yield body[index:index + 1]
            yield b" " * (LIMIT - len(body))

        async with AsyncClient(
            transport=ASGITransport(app=web.app), base_url="http://test",
        ) as client:
            return await client.post(
                endpoint, content=chunks(),
                headers={"content-type": _content_type(endpoint)},
            )

    response = asyncio.run(exercise())
    assert response.status_code == 200
    expected = (
        submitted if endpoint == ENDPOINTS[1]
        else (body + b" " * (LIMIT - len(body))).decode("utf-8")
    )
    assert received == [expected]


def test_verification_request_bytes_reach_strict_json_loader_unchanged(monkeypatch):
    endpoint = ENDPOINTS[1]
    body = b"\r\n\t" + _submission(endpoint)[0] + b" \r\n"
    received: list[str | bytes] = []
    original = web._load_strict_json

    def capture(serialized: str | bytes, *, invalid_json_message: str):
        received.append(serialized)
        return original(serialized, invalid_json_message=invalid_json_message)

    monkeypatch.setattr(web, "_load_strict_json", capture)

    async def exercise():
        async def chunks():
            for index in range(len(body)):
                yield body[index:index + 1]

        async with AsyncClient(
            transport=ASGITransport(app=web.app), base_url="http://test",
        ) as client:
            return await client.post(
                endpoint, content=chunks(),
                headers={"content-type": _content_type(endpoint)},
            )

    response = asyncio.run(exercise())
    assert response.status_code == 200
    assert response.json()["outcome"] == "FAIL"
    assert received == [body]


@pytest.mark.parametrize("endpoint", ENDPOINTS)
def test_utf8_limit_counts_bytes_before_decoding(monkeypatch, endpoint):
    # This has fewer than LIMIT characters, but LIMIT + 1 encoded bytes.
    body = b'"' + "é".encode() * (LIMIT // 2 - 1) + b'" '
    assert len(body) == LIMIT + 1
    assert len(body.decode()) < LIMIT
    _forbid_processing(monkeypatch)
    response = TestClient(web.app).post(
        endpoint, content=body, headers={"content-type": _content_type(endpoint)},
    )
    _assert_too_large(response)


def test_invalid_verification_request_utf8_retains_invalid_request_category():
    response = TestClient(web.app).post(
        ENDPOINTS[1], content=b"\xff",
        headers={"content-type": "application/json"},
    )
    assert response.status_code == 422
    assert response.json() == {
        "detail": {
            "code": "invalid_request",
            "message": "verification request JSON is invalid",
        },
    }


@pytest.mark.parametrize("endpoint", ENDPOINTS)
@pytest.mark.parametrize("content_type", [None, "application/octet-stream"])
def test_unsupported_content_type_is_rejected_without_reading_body(
    monkeypatch, endpoint, content_type,
):
    _forbid_processing(monkeypatch)

    async def exercise():
        async def chunks():
            pytest.fail("Unsupported content types must not consume the body.")
            yield b"x"

        headers = {"content-length": str(LIMIT + 1)}
        if content_type is not None:
            headers["content-type"] = content_type
        async with AsyncClient(
            transport=ASGITransport(app=web.app), base_url="http://test",
        ) as client:
            return await client.post(endpoint, content=chunks(), headers=headers)

    response = asyncio.run(exercise())
    assert response.status_code == 415
    expected = (
        {
            "code": "invalid_request",
            "message": "verification requests must use application/json",
        }
        if endpoint == ENDPOINTS[1]
        else "only text/plain evidence is supported"
    )
    assert response.json() == {"detail": expected}


@pytest.mark.parametrize("endpoint", ENDPOINTS)
def test_oversized_invalid_utf8_is_rejected_before_decoding(monkeypatch, endpoint):
    _forbid_processing(monkeypatch)
    response = TestClient(web.app).post(
        endpoint, content=b"\xff" + b" " * LIMIT,
        headers={"content-type": _content_type(endpoint)},
    )
    _assert_too_large(response)


@pytest.mark.parametrize("endpoint", ENDPOINTS)
def test_request_read_error_propagates_without_processing_evidence(
    monkeypatch, endpoint,
):
    _forbid_processing(monkeypatch)
    error = OSError("injected request read error")

    async def exercise():
        async def chunks():
            yield b"{"
            raise error

        async with AsyncClient(
            transport=ASGITransport(app=web.app), base_url="http://test",
        ) as client:
            return await client.post(
                endpoint, content=chunks(),
                headers={"content-type": _content_type(endpoint)},
            )

    with pytest.raises(OSError) as raised:
        asyncio.run(exercise())
    assert raised.value is error


@pytest.mark.parametrize(
    ("endpoint", "detail"),
    [
        (ENDPOINTS[0], "observation evidence is invalid"),
        (
            ENDPOINTS[1],
            {
                "code": "invalid_request",
                "message": "verification request JSON is invalid",
            },
        ),
        (ENDPOINTS[2], "verified execution evidence is invalid"),
        (ENDPOINTS[3], "verified execution sequence evidence is invalid"),
    ],
)
def test_empty_body_remains_invalid_input(endpoint, detail):
    response = TestClient(web.app).post(
        endpoint, content=b"", headers={"content-type": _content_type(endpoint)},
    )
    assert response.status_code == 422
    assert response.json() == {"detail": detail}
