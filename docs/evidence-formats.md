# Evidence format reference

[README](../README.md) · [Verification concepts](verification.md) · [Python workflows](python.md)

Evidence is the JSON representation of recorded observations and verification results. All readers in `orbirig.evidence` treat submitted JSON as untrusted. The three supported forms have separate version contracts:

| Evidence form | Version field | Current version | Python model |
| --- | --- | --- | --- |
| Observation | `evidence_format_version` | `1` | `CommandExecutionObservation` |
| Verified execution | `schema_version` | `1` | `VerifiedExecutionRecord` |
| Verified execution sequence | `schema_version` | `1` | `VerifiedExecutionSequence` |

The evidence form must be known when choosing a reader. Package versions and these format/schema versions are independent; changing one does not imply changing the others.

## Shared JSON rules

Readers reject malformed JSON, duplicate object member names at any nesting level, unsupported versions, missing or unexpected fields, incorrect primitive types and unsupported enum values. Version fields must be JSON integers, not booleans. Modes are exactly `NOMINAL` or `SAFE`; the only command type is `SET_OPERATING_MODE`.

The serializers write deterministic JSON with two-space indentation, a stable field and array order, and one final LF newline. The same input models produce the same JSON text. JSON object field order is not required on input; result-array order is part of the verified contract.

## Observation evidence

The complete observation v1 shape is illustrated by [nominal-to-safe.json](examples/nominal-to-safe.json):

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

`serialize_execution_evidence(...)` writes this form. `deserialize_execution_evidence(...)` returns a `CommandExecutionObservation`. There is no scenario, execution metadata, invariant result or outcome in an observation document. Successfully reading it does not establish verification success.

## Verified execution evidence

The top-level object contains exactly:

| Field | Contents |
| --- | --- |
| `schema_version` | Integer `1` |
| `execution` | `execution_id`, `scenario_id` and `executed_at` |
| `observation` | The command, pre-state, acknowledgement, post-state and telemetry; no nested version field |
| `invariant_results` | Ordered checks, each with `invariant_id`, `passed`, `expected` and `actual` |
| `outcome` | `PASS` or `FAIL`, derived from all checks |

Scenario strings are listed in the [scenario table](verification.md#supported-scenarios). `passed` is a boolean; `expected` and `actual` are booleans for acknowledgement checks and mode strings for state and telemetry checks.

`serialize_verified_execution_evidence(...)` writes a record. `deserialize_verified_execution_evidence(...)` validates metadata and reconstructs the observation, then calls the canonical Python verifier with the saved scenario. The stored invariant identifiers, order, values, pass flags and outcome must match the recomputed record exactly. A consistent `FAIL` record is valid; a stored `PASS` that contradicts the checks is invalid.

The [CLI example](cli.md#verify-the-bundled-example) produces a complete record without requiring hand-written derived results.

### Execution IDs

`execution_id` must be a string containing at least one non-whitespace character. Unicode surrogate code points (U+D800–U+DFFF) are rejected because they cannot be encoded as valid UTF-8 text. Other valid Unicode characters, including emoji, are preserved without replacement or normalisation.

Paired surrogate escapes in JSON, such as `\ud83d\ude80`, decode to the valid character `🚀` and are accepted. Decoded IDs containing unpaired surrogates are rejected, including in older version `1` evidence. The validation applies to new records, saved records and nested sequence members.

### UTC execution timestamps

`executed_at` describes when the recorded execution took place, not when verification ran. New Python records require a timezone-aware `datetime` with a zero UTC offset. Saved evidence, the HTTP verification endpoint and the CLI share the same timestamp-text validation.

Use `YYYY-MM-DDTHH:MM:SS[.fraction](Z|+00:00)`, for example `2026-10-21T10:00:00Z`. Dates and times must be valid, hours must be `00`–`23` and the timezone must be explicitly zero. Non-zero offsets are rejected rather than converted.

Fractional seconds must be exactly representable in microseconds. Digits after the sixth decimal place are accepted only when all are zero: `.1234560` preserves `.123456`, while `.1234567` is rejected.

The following lossless input forms are also accepted:

- Compact calendar dates, ISO week dates, a single character such as a space instead of `T`, compact times, omitted minutes or seconds, and a decimal comma.
- Zero offsets with either sign, with hours alone or with minutes and optional seconds, with or without colons. Fractional offset digits must all be zero.
- Fractions after hours or minutes only when all their digits are zero.

Canonical output uses `Z` and at most six fractional digits. Precision-losing timestamps, non-zero offsets and unsupported forms are rejected consistently across supported Python versions, including when reading older version `1` evidence.

## Verified sequence evidence

The top-level object contains exactly `schema_version`, `records`, `continuity_results` and `outcome`.

`records` is an ordered array of at least two complete verified-execution documents, each with its own `schema_version`. `continuity_results` has one result for every adjacent pair, in the same order. Each result contains exactly:

- `previous_execution_id` and `next_execution_id`;
- `expected_operating_mode` (the previous post-state mode) and `observed_operating_mode` (the next pre-state mode);
- `passed`, a boolean stating whether those modes match.

The sequence outcome is `PASS` only when every record and every continuity result passes. Supplied order is preserved; duplicate execution IDs and equal or non-monotonic timestamps remain valid.

`serialize_verified_execution_sequence_evidence(...)` writes this form. `deserialize_verified_execution_sequence_evidence(...)` reconstructs each record through the verified-execution reader, recomputes continuity in saved order and derives the aggregate outcome. Stored boundaries and outcome must match exactly. A consistent `FAIL` sequence is valid evidence.

See [Python sequence verification](python.md#verify-an-ordered-sequence) for a complete example.
