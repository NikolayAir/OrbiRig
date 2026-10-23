"""Integer conversion limits at the shared external JSON boundary."""

import sys
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from orbirig import web
from orbirig.evidence import _load_strict_json, _StrictJSONError


@pytest.fixture(params=[
    sys.int_info.str_digits_check_threshold,
    sys.int_info.default_max_str_digits,
])
def integer_limit(request: pytest.FixtureRequest) -> Iterator[int]:
    previous = sys.get_int_max_str_digits()
    limit: int = request.param
    sys.set_int_max_str_digits(limit)
    try:
        yield limit
    finally:
        sys.set_int_max_str_digits(previous)


@pytest.mark.parametrize("sign", ["", "-"])
def test_excessive_integer_is_a_controlled_decoding_error(integer_limit, sign):
    literal = sign + "9" * (integer_limit + 1)

    with pytest.raises(_StrictJSONError, match="integer"):
        _load_strict_json(literal, invalid_json_message="invalid JSON")

    assert sys.get_int_max_str_digits() == integer_limit


def test_integer_at_the_configured_limit_is_preserved(integer_limit):
    value = _load_strict_json(
        "9" * integer_limit,
        invalid_json_message="invalid JSON",
    )

    assert type(value) is int
    assert value == 10 ** integer_limit - 1
    assert sys.get_int_max_str_digits() == integer_limit


def test_explicitly_disabled_integer_limit_is_preserved():
    previous = sys.get_int_max_str_digits()
    digits = sys.int_info.default_max_str_digits + 1
    sys.set_int_max_str_digits(0)
    try:
        value = _load_strict_json("9" * digits, invalid_json_message="invalid JSON")
        assert type(value) is int
        assert value == 10 ** digits - 1
        assert sys.get_int_max_str_digits() == 0
    finally:
        sys.set_int_max_str_digits(previous)


@pytest.mark.parametrize("sign", ["", "-"])
def test_excessive_request_integer_is_invalid_request(integer_limit, sign):
    response = TestClient(web.app, raise_server_exceptions=False).post(
        "/api/verify/observation",
        content='{"execution_id":' + sign + "9" * (integer_limit + 1) + "}",
        headers={"Content-Type": "application/json"},
    )

    assert response.status_code == 422
    assert response.json() == {
        "detail": {
            "code": "invalid_request",
            "message": "verification request JSON is invalid",
        },
    }
    assert sys.get_int_max_str_digits() == integer_limit
