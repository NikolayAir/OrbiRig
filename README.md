# OrbiRig

OrbiRig is a software tool for checking recorded command results against the expected behaviour of a scenario you select. It supports 3 scenarios and shows the expected and reported values for each check, with an overall `PASS` or `FAIL`.

The scenarios use a simplified spacecraft model with 2 operating modes: `NOMINAL` (normal operation) and `SAFE` (a protective mode). OrbiRig checks the mode before and after a command, its acknowledgement (whether it was accepted or rejected), and telemetry (the separately reported mode). This is a non-operational verification harness; it does not control a real spacecraft.

Choose how to use it:

| Interface | What you can do |
| --- | --- |
| [Browser](https://orbirig-evidence-inspector.onrender.com/) | Verify an observation or inspect saved observations, verified executions and sequences. |
| [Command line](docs/cli.md) | Verify an observation file and save the result as JSON. |
| [Python API](docs/python.md) | Also execute reference examples, collect observations from a separate program and verify sequences. |

## Quick start

### Try it in the browser

1. Open the [web interface](https://orbirig-evidence-inspector.onrender.com/) and choose **Verify observation**.
2. Choose **Load example**, then **Verify observation**.
3. Inspect the expected and observed values. The default example records an accepted change from `NOMINAL` to `SAFE` and produces `PASS`.

To explore saved records, choose **Inspect evidence**, select an evidence type, load its example and choose **Inspect evidence**.

![Verification result showing 3 passing checks and a failed telemetry check: expected SAFE, actual NOMINAL](docs/images/orbirig-web-verification.png)

The result above uses an observation with telemetry that does not match the recorded post-state: the post-state is `SAFE`, but telemetry reports `NOMINAL`. OrbiRig shows the mismatch and returns `FAIL`.

See the [web-interface guide](docs/web-interface.md) to run it locally or use the HTTP endpoints.

### Verify a file from the command line

Install [Git](https://git-scm.com/downloads), [uv](https://docs.astral.sh/uv/getting-started/installation/) and Python 3.12–3.15, or let uv download a supported interpreter. From a terminal:

```bash
git clone https://github.com/NikolayAir/OrbiRig.git
cd OrbiRig
uv sync --locked
uv run --no-sync orbirig verify-observation docs/examples/nominal-to-safe.json \
  --scenario nominal_to_safe_mode \
  --execution-id example-001 \
  --executed-at 2026-10-21T10:00:00Z
```

The command prints a verified execution record as JSON with 4 passing checks and `"outcome": "PASS"`. It exits with code `0`.

See the [CLI guide](docs/cli.md) for a failing example, saving output and exit codes, or the [Python guide](docs/python.md) to execute a repeatable reference example and check sequences.

## How verification works

Choose a **scenario** to state the expected behaviour before verification. An **observation** records the command and its reported result. **Evidence** is an observation or verified result represented as JSON, a text format for structured data. OrbiRig never chooses the scenario from the observation.

```mermaid
---
config:
  layout: dagre
  look: classic
  flowchart:
    diagramPadding: 16
    wrappingWidth: 280
---
flowchart TD
    accTitle: Verification overview
    accDescr: Recorded observations are validated before Python compares their reported values with expectations from an independently selected scenario. Valid, compatible input produces a verified record with 4 checks and a PASS or FAIL outcome, ready for JSON export. Invalid input or a command that does not match the selected scenario produces an input error without a record.
    observation["<b>Observation</b><br/>command + reported values"] --> validate("Validate observation")
    validate --> verifier
    scenario["Selected scenario"] --->|Expectations| verifier("Run 4 checks in the Python core")
    validate -->|Invalid data| error["<b>Input error</b><br/>no verified record"]
    verifier -->|Command mismatch| error
    verifier --> record["<b>Verified execution record</b><br/>scenario + observation + checks<br/>PASS or FAIL"]
    record -->|Export| evidence["Versioned JSON evidence"]
    classDef action fill:#3b82f633
    class validate,verifier action
```

Rounded boxes show actions; square-cornered boxes show data or results. See the [architecture guide](docs/architecture.md#verification-flow) for the detailed collection, validation and error paths.

The **Python core** validates inputs, defines scenario expectations, performs verification and reads or writes evidence. The React/TypeScript browser interface and CLI use this same core, so each interface applies the same verification rules. The core also works without the web application.

The Python API can execute a command and collect an observation from the included `ReferenceSpacecraft` or a separate program, invoked as a subprocess. `ReferenceSpacecraft` is a simplified, deterministic **test double** used to produce repeatable observations. Scenario expectations are defined separately, so its reported behaviour does not determine what counts as correct.

[Tests](CONTRIBUTING.md#python-checks) include deliberately incorrect observations and [browser-to-Python checks](CONTRIBUTING.md#browser-tests) with independently defined expected results.

Each verification check, called an **invariant**, retains the expected value, observed value and whether they match:

| Check | What it establishes |
| --- | --- |
| Pre-state | The starting mode matches the selected scenario. |
| Acknowledgement | The reported acceptance or rejection matches the scenario. |
| Post-state | The mode after the command matches the scenario's target, or the starting mode when rejection is expected. |
| Telemetry | The reported mode matches the observed post-state. |

Provide an execution ID and a UTC timestamp for the recorded execution. The verified record retains the selected scenario, observation, all 4 checks and overall outcome. Verification outcomes and errors have different meanings:

| Status | Meaning |
| --- | --- |
| `PASS` | Every check meets its expectation. A rejected command can pass when rejection is expected. |
| `FAIL` | The observation is valid input, but at least 1 check does not meet its expectation. |
| Input error | The data cannot be verified. Examples include invalid JSON or a command that does not match the selected scenario. No verification result is produced. |
| Collection error | No usable observation was collected, for example because the target subprocess timed out. No verification result is produced. |

You can also check records together or reopen saved evidence:

- **Check a sequence.** For 2 or more records, the Python API checks **continuity**: the mode after one command must match the mode before the next. The records stay in the order you provide them. The sequence passes only when every record and every continuity check passes.
- **Reopen saved evidence.** Loading verified execution or sequence JSON validates its format and recomputes the checks and outcome, including continuity for a sequence. The saved checks and outcome must match these results exactly, including for `FAIL` records. Contradictory saved results are rejected.

See [verification concepts](docs/verification.md) for the 3 supported scenarios, observation collection and sequence checks, or the [evidence format reference](docs/evidence-formats.md) for JSON fields and validation rules.

## Documentation

| I want to… | Guide |
| --- | --- |
| Understand the scenarios, results and sequence checks | [Verification concepts](docs/verification.md) |
| Follow the detailed verification flow and component responsibilities | [Architecture](docs/architecture.md) |
| Verify a saved observation in a terminal | [Command-line use](docs/cli.md) |
| Use the Python API or collect from a separate program | [Using the Python API](docs/python.md) |
| Use or run the browser interface and HTTP endpoints | [Web interface](docs/web-interface.md) |
| Check JSON formats, execution IDs and timestamps | [Evidence format reference](docs/evidence-formats.md) |
| Set up development and run tests | [Contributing and development](CONTRIBUTING.md) |

## Releases and support

See [GitHub Releases](https://github.com/NikolayAir/OrbiRig/releases) for versioned release notes. Documentation on `main` describes current development; use the documentation at a release tag for that version.

For questions and reproducible bugs, use [GitHub Issues](https://github.com/NikolayAir/OrbiRig/issues). Report suspected vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

## Licence

OrbiRig is available under the [MIT License](LICENSE).
