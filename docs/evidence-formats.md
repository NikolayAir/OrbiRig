# Evidence format reference

[README](../README.md) · [Verification concepts](verification.md) · [Using the Python API](python.md)

Evidence JSON records reported observations and verification results. An observation document contains the command and reported values; a verified record also includes the selected scenario, execution details, checks and outcome. All readers in `orbirig.evidence` validate submitted JSON as untrusted input. The 3 supported forms are versioned separately:

| Evidence form | Version field | Current version | Python model |
| --- | --- | --- | --- |
| Observation | `evidence_format_version` | `1` | `CommandExecutionObservation` |
| Verified execution | `schema_version` | `1` | `VerifiedExecutionRecord` |
| Verified execution sequence | `schema_version` | `1` | `VerifiedExecutionSequence` |

The evidence form must be known when choosing a reader. Package versions and these format/schema versions are independent; changing one does not imply changing the others.

## Shared JSON rules

Readers reject malformed JSON and repeated field names within any object, including nested objects. They also reject unsupported versions, missing or extra fields, incorrect JSON types and unsupported enum values. Version fields must be JSON integers, not booleans. Modes are exactly `NOMINAL` or `SAFE`; the only command type is `SET_OPERATING_MODE`.

Serialisers return JSON text with 2-space indentation, a stable field and array order, and 1 final LF newline. The same input models produce the same text. Reading JSON does not require object fields in a particular order, but result arrays must follow the order defined below. See [saving and reopening evidence](python.md#reopen-saved-verified-evidence) to write the text to UTF-8 files.

## Observation evidence

The complete structure of an observation v1 document is illustrated by [nominal-to-safe.json](examples/nominal-to-safe.json):

```json
{
  "evidence_format_version": 1,
  "command": {
    "command_type": "SET_OPERATING_MODE",
    "target_mode": "SAFE"
  },
  "pre_state": {"operating_mode": "NOMINAL"},
  "acknowledgement": {"accepted": true},
  "post_state": {"operating_mode": "SAFE"},
  "telemetry": {"operating_mode": "SAFE"}
}
```

`accepted` is a JSON boolean. The meaning of each reported value is explained in [verification concepts](verification.md#what-an-observation-records).

`serialize_execution_evidence(...)` returns JSON in this form. `deserialize_execution_evidence(...)` returns a `CommandExecutionObservation`. There is no scenario, execution metadata, invariant result or outcome in an observation document. Successfully reading it does not establish verification success.

## Verified execution evidence

See [verified-execution.json](examples/verified-execution.json) for a complete record with 4 passing checks. The top-level object contains exactly:

| Field | Contents |
| --- | --- |
| `schema_version` | Integer `1` |
| `execution` | `execution_id`, `scenario_id` and `executed_at` |
| `observation` | The command, pre-state, acknowledgement, post-state and telemetry; no nested version field |
| `invariant_results` | Ordered checks, each with `invariant_id`, `passed`, `expected` and `actual` |
| `outcome` | `PASS` or `FAIL`, derived from all checks |

Scenario strings are listed in the [scenario table](verification.md#supported-scenarios). Each result's `passed` field is a boolean. Its `expected` and `actual` values are booleans for acknowledgement checks and mode strings for state and telemetry checks.

The checks appear in this order, using these `invariant_id` values:

| Position | Accepted transition | Expected rejection |
| --- | --- | --- |
| 1 | `pre_state_matches_expected` | `pre_state_matches_expected` |
| 2 | `acknowledgement_is_accepted` | `acknowledgement_is_rejected` |
| 3 | `post_state_matches_requested_mode` | `post_state_matches_pre_state` |
| 4 | `telemetry_matches_post_state` | `telemetry_matches_post_state` |

Their expected behaviour is defined in [verification concepts](verification.md#supported-scenarios).

`serialize_verified_execution_evidence(...)` returns a record's JSON representation. `deserialize_verified_execution_evidence(...)` validates the execution ID and timestamp, reconstructs the observation and recomputes the checks using the saved scenario and observation. The stored invariant identifiers, order, values, pass flags and outcome must match the recomputed record exactly. A saved `FAIL` is valid when its checks and outcome match these results; a stored `PASS` that contradicts them is invalid.

The [CLI example](cli.md#verify-the-bundled-example) produces this form of record and calculates the checks and outcome for you.

### Execution IDs

`execution_id` must be a string containing at least 1 non-whitespace character. Unicode surrogate code points (U+D800–U+DFFF) are rejected because they cannot be encoded as valid UTF-8 text. Other valid Unicode characters, including emoji, are preserved without replacement or normalisation.

Paired surrogate escapes in JSON, such as `\ud83d\ude80`, decode to the valid character `🚀` and are accepted. Decoded IDs containing unpaired surrogates are rejected. The validation applies to new records, saved records and nested sequence members.

### UTC execution timestamps

`executed_at` describes when the recorded execution took place, not when verification ran. New Python records require a timezone-aware `datetime` with a zero UTC offset. Saved evidence, the HTTP verification endpoint and the CLI share the same timestamp-text validation.

Use `YYYY-MM-DDTHH:MM:SS[.fraction](Z|+00:00)`, for example `2026-10-21T10:00:00Z`. Dates and times must be valid, hours must be `00`–`23` and the timezone must be explicitly zero. Non-zero offsets are rejected rather than converted.

Fractional seconds must be exactly representable in microseconds. Digits after the sixth decimal place are accepted only when all are zero: `.1234560` preserves `.123456`, while `.1234567` is rejected.

The following lossless input forms are also accepted:

- Compact calendar dates and ISO week dates.
- A single character, such as a space, instead of the `T` separator.
- Compact times, omitted minutes or seconds, and a decimal comma.
- Zero offsets with either sign, with hours alone or with minutes and optional seconds, with or without colons. Fractional offset digits must all be zero.
- Fractions after hours or minutes only when all their digits are zero.

Serialised timestamps use `Z` and at most 6 fractional digits. Timestamps that would lose precision, non-zero offsets and unsupported forms are rejected across supported Python versions.

## Verified sequence evidence

See [verified-sequence.json](examples/verified-sequence.json) for a complete sequence that changes to `SAFE` and back to `NOMINAL`. The top-level object contains exactly `schema_version`, `records`, `continuity_results` and `outcome`.

`records` is an ordered array of at least 2 complete verified-execution documents. Each has its own `schema_version`. `continuity_results` has 1 result for every adjacent pair, in the same order. Each result contains exactly:

- `previous_execution_id` and `next_execution_id`;
- `expected_operating_mode` (the previous post-state mode) and `observed_operating_mode` (the next pre-state mode);
- `passed`, a boolean stating whether those modes match.

The sequence outcome is `PASS` only when every record and every continuity result passes. Records remain in the order they appear in the JSON. Execution IDs and timestamps may repeat, and timestamps do not have to increase.

`serialize_verified_execution_sequence_evidence(...)` returns JSON in this form. `deserialize_verified_execution_sequence_evidence(...)` reconstructs each record through the verified-execution reader. It then recomputes continuity in saved order and calculates the overall sequence outcome. The saved continuity checks and outcome must match these results exactly, including for `FAIL` sequences.

See [Python sequence verification](python.md#verify-an-ordered-sequence) for a complete example.
