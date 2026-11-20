# Command-line use

Use `orbirig verify-observation` to check a local observation JSON file against the [scenario you choose](verification.md#supported-scenarios). The command writes a [verified execution record](evidence-formats.md#verified-execution-evidence) with the original observation, expected and actual values for each check, and an overall `PASS` or `FAIL` outcome.

## Install

The CLI requires Python 3.12–3.15. With [uv](https://docs.astral.sh/uv/getting-started/installation/) installed, run the setup command from the repository root.

```bash
uv sync --locked
```

This command installs the core package in `.venv`. Run the CLI in this Python-only environment with `uv run --no-sync orbirig`. The [development guide](../CONTRIBUTING.md#python-environment) explains interpreter selection and optional dependencies.

If you have a built wheel, install it in an activated Python environment with `python -m pip install /path/to/orbirig-VERSION-py3-none-any.whl`. Replace the path with your wheel's filename, then invoke `orbirig` directly.

## Verify the bundled example

From the repository root, check the included observation using the `nominal_to_safe_mode` scenario.

```bash
uv run --no-sync orbirig verify-observation docs/examples/nominal-to-safe.json \
  --scenario nominal_to_safe_mode \
  --execution-id example-001 \
  --executed-at 2026-10-21T10:00:00Z
```

In PowerShell, enter the verification command on one line and omit the `\` line continuations.

The [example observation](examples/nominal-to-safe.json) records an accepted change from `NOMINAL` to `SAFE`. The command writes JSON to standard output (stdout) with four passing checks and `"outcome": "PASS"`. It exits with code `0`.

To save the JSON, use `>` to send standard output to a file. This creates or replaces `verified-execution.json`.

```bash
# Redirect stdout only; diagnostics remain visible on stderr.
uv run --no-sync orbirig verify-observation docs/examples/nominal-to-safe.json \
  --scenario nominal_to_safe_mode \
  --execution-id example-001 \
  --executed-at 2026-10-21T10:00:00Z > verified-execution.json
```

To [inspect the file in the browser](web-interface.md#inspect-evidence), switch to the **Inspect evidence** workflow and choose **Verified execution**. Paste the file's contents into **Evidence JSON**, then choose **Inspect evidence**. You can also [reopen the file in Python](python.md#reopen-saved-verified-evidence).

## See a failed telemetry check

Copy `docs/examples/nominal-to-safe.json` to `bad-telemetry.json` in the repository root. Change only `telemetry.operating_mode` to `"NOMINAL"`. Verify the changed file with the same scenario.

```bash
uv run --no-sync orbirig verify-observation bad-telemetry.json \
  --scenario nominal_to_safe_mode \
  --execution-id example-002 \
  --executed-at 2026-10-21T10:00:00Z
```

The command exits with code `1` and writes a valid evidence record with outcome `FAIL`. The `telemetry_matches_post_state` check shows `"expected": "SAFE"`, `"actual": "NOMINAL"` and `"passed": false`.

## Arguments

`FILE`, `--scenario`, `--execution-id` and `--executed-at` are all required.

| Argument | Meaning |
| --- | --- |
| `FILE` | Path to one local observation-evidence v1 file in UTF-8. The command treats `-` as a filename. |
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
