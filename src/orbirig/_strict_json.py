"""Strict JSON reading shared by evidence files and HTTP requests."""

import json


class _StrictJSONError(ValueError):
    """Raised when JSON decoding rejects malformed or unsupported input."""


def _parse_json_integer(serialized: str) -> int:
    """Convert a JSON integer, reporting an exceeded digit limit as a decoding error."""

    try:
        return int(serialized)
    except ValueError as exc:
        raise _StrictJSONError("JSON integer exceeds the conversion limit") from exc


def _reject_duplicate_object_members(
    pairs: list[tuple[str, object]],
) -> dict[str, object]:
    """Construct one JSON object while rejecting duplicate member names."""

    document = {}

    for name, value in pairs:
        if name in document:
            raise _StrictJSONError("duplicate JSON object member name")

        document[name] = value

    return document


def _load_strict_json(
    serialized: str | bytes,
    *,
    invalid_json_message: str,
) -> object:
    """Decode JSON, rejecting duplicate members, overlong integers and excessive nesting."""

    try:
        return json.loads(
            serialized,
            parse_int=_parse_json_integer,
            # The default JSON reader keeps only the last value when a field name repeats.
            # Check every field first so repeated names are rejected instead.
            object_pairs_hook=_reject_duplicate_object_members,
        )
    except (json.JSONDecodeError, RecursionError) as exc:
        raise _StrictJSONError(invalid_json_message) from exc
