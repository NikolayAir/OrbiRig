# Command-line use

[README](../README.md) · [Verification concepts](verification.md) · [Evidence formats](evidence-formats.md)

The `orbirig` command checks a recorded command result from a local JSON file against a scenario you select. It writes a verified execution record as JSON, with the expected and observed values for each check and an overall `PASS` or `FAIL` outcome. It does not execute commands or collect new observations.

## Install

The CLI requires Python 3.12–3.15. From a repository checkout, install [uv](https://docs.astral.sh/uv/getting-started/installation/) and run at the repository root:

```bash
uv sync --locked
```

uv creates `.venv` and installs the core package and console command. Run it with `uv run --no-sync orbirig`; no web dependencies, Node.js or browser are required. The [development guide](../CONTRIBUTING.md#python-environment) explains interpreter selection and optional dependencies.

If you have a built wheel, install it in an activated Python environment with `python -m pip install /path/to/orbirig-VERSION-py3-none-any.whl`. Replace the path with your wheel's filename, then invoke `orbirig` directly.

## Verify the bundled example

Run from the repository root:

```bash
uv run --no-sync orbirig verify-observation docs/examples/nominal-to-safe.json \
  --scenario nominal_to_safe_mode \
  --execution-id example-001 \
  --executed-at 2026-10-21T10:00:00Z
```

The [example observation](examples/nominal-to-safe.json) records an accepted change from `NOMINAL` to `SAFE`, with matching telemetry. The command exits with code `0` and writes a complete verified execution record to standard output (stdout). The record contains `schema_version: 1`, the execution ID and UTC timestamp you provided, the selected scenario, the observation, 4 passing checks and `outcome: "PASS"`. Standard error (stderr) is empty.

To save the result, use shell redirection:

```bash
# Redirect stdout only; diagnostics remain visible on stderr.
uv run --no-sync orbirig verify-observation docs/examples/nominal-to-safe.json \
  --scenario nominal_to_safe_mode \
  --execution-id example-001 \
  --executed-at 2026-10-21T10:00:00Z > verified-execution.json
```

The command has no output-file option. The saved file can be [reopened in Python](python.md#reopen-saved-verified-evidence) or pasted into **Verified execution** inspection in the [web interface](web-interface.md#inspect-evidence).

## See a failed telemetry check

Copy the example to `bad-telemetry.json` and change only `telemetry.operating_mode` to `"NOMINAL"`. Then run:

```bash
uv run --no-sync orbirig verify-observation bad-telemetry.json \
  --scenario nominal_to_safe_mode \
  --execution-id example-002 \
  --executed-at 2026-10-21T10:00:00Z
```

The command exits with code `1` and writes a complete, valid evidence record with outcome `FAIL`. The `telemetry_matches_post_state` check contains expected `"SAFE"`, actual `"NOMINAL"` and `passed: false`. Stderr remains empty. The input is valid, but the recorded telemetry does not match the post-state.

## Arguments

`FILE`, `--scenario`, `--execution-id` and `--executed-at` are all required.

| Argument | Meaning |
| --- | --- |
| `FILE` | 1 local UTF-8 observation-evidence v1 file. `-` is a filename, not a request to read stdin. |
| `--scenario` | Exactly `nominal_to_safe_mode`, `nominal_to_nominal_rejection` or `safe_to_nominal_mode`. See [expected behaviour](verification.md#supported-scenarios). |
| `--execution-id` | A non-blank ID, preserved exactly; Unicode surrogate code points are rejected. |
| `--executed-at` | The recorded execution's UTC time, for example `2026-10-21T10:00:00Z`. |

A command incompatible with the selected scenario is an input error. See the rules for [execution IDs](evidence-formats.md#execution-ids) and [UTC timestamps](evidence-formats.md#utc-execution-timestamps) for metadata validation.

`orbirig --help` and `orbirig verify-observation --help` exit with code `0` and write help to stdout without reading a file. Argument names cannot be abbreviated.

## Exit codes and output

Exit codes `0` and `1` describe verification outcomes. An expected command rejection can produce `PASS`.

| Exit code | Meaning | stdout | stderr |
| --- | --- | --- | --- |
| `0` | Completed verification `PASS` | Verified-execution JSON | Empty |
| `1` | Completed verification `FAIL` | Verified-execution JSON | Empty |
| `2` | Invalid arguments, metadata, evidence or scenario/command mismatch | Empty | Diagnostic |
| `3` | File I/O or output write error | Empty for read errors; may be partial for write errors | Diagnostic |
| `4` | Unexpected internal error | Empty before output starts | Diagnostic and traceback |

The reader applies the [shared JSON rules](evidence-formats.md#shared-json-rules), including rejection of repeated field names within nested objects. Files must use UTF-8 without a byte-order mark (BOM).

Completed verification writes only the verified-execution JSON bytes to stdout: UTF-8, 2-space indentation, LF line endings and 1 final newline on every operating system. Fixed inputs, including execution metadata, produce identical bytes. Input and read errors produce no verification evidence.
