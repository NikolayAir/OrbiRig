# Command-line use

[README](../README.md) · [Verification concepts](verification.md) · [Evidence formats](evidence-formats.md)

The `orbirig` command verifies one saved observation against an explicitly selected scenario. It reads a local file and writes a verified execution record as JSON. It does not execute spacecraft commands or collect fresh observations.

## Install

The CLI requires Python 3.12–3.15. From a repository checkout, install [uv](https://docs.astral.sh/uv/getting-started/installation/) and run at the repository root:

```bash
uv sync --locked
```

uv creates `.venv` and installs the core package and console command. Run it with `uv run --no-sync orbirig`; no web dependencies, Node.js or browser are required. The [development guide](../CONTRIBUTING.md#python-environment) explains interpreter selection and optional dependencies.

For a built wheel, install it in an activated Python environment with `python -m pip install /path/to/orbirig-<version>-py3-none-any.whl`, then invoke `orbirig` directly.

## Verify the bundled example

Run from the repository root:

```bash
uv run --no-sync orbirig verify-observation docs/examples/nominal-to-safe.json \
  --scenario nominal_to_safe_mode \
  --execution-id example-001 \
  --executed-at 2026-10-21T10:00:00Z
```

The [example observation](examples/nominal-to-safe.json) records an accepted change from `NOMINAL` to `SAFE`, with matching telemetry. This command exits with code `0` and writes the complete verified-execution JSON to standard output (stdout), including `schema_version: 1`, the supplied metadata, the observation, four passing invariant results and `outcome: "PASS"`. Standard error (stderr) is empty.

To save the result, use shell redirection:

```bash
uv run --no-sync orbirig verify-observation docs/examples/nominal-to-safe.json \
  --scenario nominal_to_safe_mode \
  --execution-id example-001 \
  --executed-at 2026-10-21T10:00:00Z > verified-execution.json
```

The command has no output-file option. The saved file can be [reopened in Python](python.md#reopen-saved-verified-evidence) or pasted into **Verified execution** inspection in the [web interface](web-interface.md#inspect-evidence).

## Try a verification failure

Copy the example to `bad-telemetry.json` and change only `telemetry.operating_mode` to `"NOMINAL"`. Then run:

```bash
uv run --no-sync orbirig verify-observation bad-telemetry.json \
  --scenario nominal_to_safe_mode \
  --execution-id example-002 \
  --executed-at 2026-10-21T10:00:00Z
```

This exits with code `1` and still writes a complete, valid evidence record. Its outcome is `FAIL`; the `telemetry_matches_post_state` check contains expected `"SAFE"`, actual `"NOMINAL"` and `passed: false`. Stderr remains empty. This is a completed verification with an unmet expectation, rather than invalid input.

## Arguments

`FILE`, `--scenario`, `--execution-id` and `--executed-at` are all required.

| Argument | Meaning |
| --- | --- |
| `FILE` | One local UTF-8 observation-evidence v1 file. `-` is a filename, not a request to read stdin. |
| `--scenario` | Exactly `nominal_to_safe_mode`, `nominal_to_nominal_rejection` or `safe_to_nominal_mode`. See [expected behaviour](verification.md#supported-scenarios). |
| `--execution-id` | A non-blank ID, preserved exactly; Unicode surrogate code points are rejected. |
| `--executed-at` | The recorded execution's UTC time, for example `2026-10-21T10:00:00Z`. |

An expected rejection can produce `PASS`. A command incompatible with the selected scenario is an input error. See the [metadata rules](evidence-formats.md#execution-ids) for ID validation and all accepted timestamp forms.

`orbirig --help` and `orbirig verify-observation --help` exit with code `0` and write help to stdout without reading a file. Argument names cannot be abbreviated.

## Exit codes and output

| Exit code | Meaning | stdout | stderr |
| --- | --- | --- | --- |
| `0` | Completed verification `PASS` | Canonical verified-execution JSON | Empty |
| `1` | Completed verification `FAIL` | Canonical verified-execution JSON | Empty |
| `2` | Invalid arguments, metadata, evidence or scenario/command mismatch | Empty | Diagnostic |
| `3` | File I/O or output write error | Empty for read errors; may be partial for write errors | Diagnostic |
| `4` | Unexpected internal error | Empty before output starts | Diagnostic and traceback |

The reader rejects malformed JSON, duplicate object members at any depth, invalid UTF-8 and a UTF-8 byte-order mark (BOM), as well as unsupported evidence structures and values.

Completed verification writes only the canonical JSON bytes to stdout: UTF-8, two-space indentation, LF line endings and one final newline on every operating system. Fixed inputs, including execution metadata, produce identical bytes. Input and read errors produce no verification evidence.
