"""UTC text must retain explicit time values on every supported interpreter."""

from datetime import UTC, datetime

import pytest

from orbirig.models import InvalidExecutionMetadataError, parse_utc_timestamp

NOON = datetime(2026, 8, 15, 12, tzinfo=UTC)


@pytest.mark.parametrize(("timestamp", "expected"), [
    ("2026-08-15T12:00:00Z", NOON),
    ("2026-08-15T12:00:00.1Z", NOON.replace(microsecond=100000)),
    ("2026-08-15T12:00:00.000001Z", NOON.replace(microsecond=1)),
    ("2026-08-15T12:00:00.999999Z", NOON.replace(microsecond=999999)),
    ("2026-08-15T12:00:00.123456000000Z", NOON.replace(microsecond=123456)),
    ("2026-08-15T12:00:00.000000000000Z", NOON),
    ("20260815T120000,1234560Z", NOON.replace(microsecond=123456)),
    ("2026-08-15.12:00:00.000001Z", NOON.replace(microsecond=1)),
    ("2026-08-15+12:00:00Z", NOON),
    ("2026-08-15-12:00:00Z", NOON),
    ("2026-08-15🚀12:00:00Z", NOON),
    ("2026-08-15012:00:00Z", NOON),
    ("2026-08-15\n12:00:00Z", NOON),
    ("2026-08-15 120000Z", NOON),
    ("2026-W33-6T12:00:00Z", NOON),
    ("2026W336T120000Z", NOON),
    ("2026-W33T12:00:00Z", datetime(2026, 8, 10, 12, tzinfo=UTC)),
    ("2026W33T120000Z", datetime(2026, 8, 10, 12, tzinfo=UTC)),
    ("2026-W33-120000.5Z", datetime(2026, 8, 10, 12, 0, 0, 500000, tzinfo=UTC)),
    ("2026-W33-230000,123456Z", datetime(2026, 8, 10, 23, 0, 0, 123456, tzinfo=UTC)),
    ("2026-W33-122359.000001Z", datetime(2026, 8, 10, 12, 23, 59, 1, tzinfo=UTC)),
    ("2026-W33-122459.000001Z", datetime(2026, 8, 10, 12, 24, 59, 1, tzinfo=UTC)),
    ("2026-W33-120000.1234560Z", datetime(2026, 8, 10, 12, 0, 0, 123456, tzinfo=UTC)),
    ("2026-W33-120000.0000000Z", datetime(2026, 8, 10, 12, tzinfo=UTC)),
    ("2026-W33-1200.0000000Z", datetime(2026, 8, 10, 12, tzinfo=UTC)),
    ("2026-W33-6-120000.5Z", NOON.replace(microsecond=500000)),
    ("2026-W33-6T120000.5Z", NOON.replace(microsecond=500000)),
    ("2026-W33-6١120000.5Z", NOON.replace(microsecond=500000)),
    ("2026W336-120000.5Z", NOON.replace(microsecond=500000)),
    ("2026-08-15T12Z", NOON),
    ("2026-08-15T12:00Z", NOON),
    ("2026-08-15T1200Z", NOON),
    ("2026-08-15T12.0000000Z", NOON),
    ("2026-08-15T12:00,0000000Z", NOON),
    ("2026-08-15T12:00:00+00", NOON),
    ("2026-08-15T12:00:00-0000", NOON),
    ("2026-08-15T12:00:00+00:00", NOON),
    ("2026-08-15T12:00:00-00:00:00", NOON),
    ("2026-08-15T12:00:00+000000.000000000", NOON),
    ("2026-08-15T12:00:00-00:00:00,000000000", NOON),
    ("2026-08-15T12:00:00+00.000000000", NOON),
    ("2026-08-15T12:00:00-00:00,000000000", NOON),
    ("2024-02-29T23:59:59Z", datetime(2024, 2, 29, 23, 59, 59, tzinfo=UTC)),
    ("0001-01-01T00:00:00Z", datetime(1, 1, 1, tzinfo=UTC)),
    ("9999-12-31T23:59:59.999999Z", datetime.max.replace(tzinfo=UTC)),
])
def test_lossless_utc_forms_preserve_explicit_time_values(timestamp, expected):
    parsed = parse_utc_timestamp(timestamp)

    assert parsed == expected
    assert parsed.tzinfo is UTC


@pytest.mark.parametrize("timestamp", [
    "2026-08-15T12:00:00.1234567Z",
    "2026-08-15T12:00:00,0000001Z",
    "20260815T120000.9999999+00:00",
    "2026-W33-6T12:00:00.123456000000000001Z",
    "2026-08-15.12:00:00.0000001Z",
    "2026-08-15T12:00:00+01:00",
    "2026-08-15T12:00:00-0001",
    "2026-08-15T12:00:00+00:00:01",
    "2026-08-15T12:00:00+00:00:00.5",
    "2026-08-15T12:00:00-00:00:00,5",
    "2026-08-15T12:00:00+000000.0000001",
    "2026-08-15T12:00:00-00:00:00.000000000000001",
    "2026-08-15T12:00:00+00.5",
    "2026-08-15T12:00:00-00:00,5",
    "2026-08-15T12:00:00+00:00:60",
    "2026-08-15T12:00:00+00:00:00:00",
    "2026-08-15T12:00:00+00:0000",
    "2026-08-15T12:00:00+00:00Z",
    "2026-08-15T12:00:00+00:00:00.",
    "2026-08-15T12:00:00+00:00:00.0000000junk",
    "2026-08-15T12.5Z",
    "2026-08-15T12:00,5Z",
    "2026-08-15T1200.0000001Z",
    "2026-08-15T24:00:00Z",
    "2026-08-15T24Z",
    "2026-W33-240000Z",
    "2026-W33-2400Z",
    "2026-W33-240000.0000000+00:00:00.0",
    "2026-W33-120000.1234567Z",
    "2026-W33-1200.5Z",
    "2026-W33-12.5Z",
    "2026-W33-126000Z",
    "2026-W33-120060Z",
    "2026-08-15T12:60:00Z",
    "2026-08-15T12:00:60Z",
    "2026-08-15T12:00:00.Z",
    "2026-08-15T12:00:00z",
    "2026-08-15T12:00:00Z\n",
    "2026-08-15T12:00:00Z ",
    "2026-08-15TT12:00:00Z",
    "2026-08-15T12:00:00",
    "2026-08-15",
    "2026-02-29T12:00:00Z",
    "2026-W54-6T12:00:00Z",
    "2026-W33-0T12:00:00Z",
    "0000-01-01T00:00:00Z",
    "",
])
def test_unsupported_or_inexact_timestamps_are_invalid_metadata(timestamp):
    with pytest.raises(InvalidExecutionMetadataError):
        parse_utc_timestamp(timestamp)
