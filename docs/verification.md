# Verification concepts

[README](../README.md) · [Architecture](architecture.md) · [Using the Python API](python.md) · [Evidence formats](evidence-formats.md)

Verification checks a recorded command result against expectations you choose before running the check. A **scenario** defines the expected behaviour; an **observation** records what was reported. Collecting that observation, verifying it and reopening saved evidence are separate operations.

## What an observation records

The 3 supported scenarios use a simplified spacecraft model with 2 **operating modes**: `NOMINAL` for normal operation and `SAFE` for a protective mode. OrbiRig records these mode values without simulating a spacecraft's physical behaviour.

One **observation** contains:

- The **command**: a request to set the operating mode.
- The **pre-state**: the mode before command handling.
- The **acknowledgement**: whether the command was reported as accepted or rejected.
- The **post-state**: the mode after command handling.
- The **telemetry**: the separately reported operating mode.

The verifier compares these reported values with the rules of a separately chosen scenario. It never infers the expected scenario from those values.

## Supported scenarios

Choose one of the 3 supported scenarios. CLI arguments and JSON use these string values:

| Scenario value | Expected pre-state | Command target | Expected acknowledgement | Expected post-state |
| --- | --- | --- | --- | --- |
| `nominal_to_safe_mode` | `NOMINAL` | `SAFE` | Accepted | `SAFE` |
| `nominal_to_nominal_rejection` | `NOMINAL` | `NOMINAL` | Rejected | `NOMINAL` |
| `safe_to_nominal_mode` | `SAFE` | `NOMINAL` | Accepted | `NOMINAL` |

The rejection example requests `NOMINAL` when the recorded starting mode is already `NOMINAL`, so no mode change is needed. Rejection is the expected response in this scenario.

Python enum members use the corresponding uppercase names, for example `ScenarioId.NOMINAL_TO_SAFE_MODE`. All 3 scenarios use `SET_OPERATING_MODE`.

For `nominal_to_safe_mode`, the recorded command must request `SAFE`. A different reported starting mode produces a failed check; a command requesting `NOMINAL` is an input error because it does not match the selected scenario. In Python, a command mismatch raises `ScenarioCommandMismatchError` without producing a verified record.

Each scenario evaluates 4 **invariants** (verification checks):

| Check | Accepted transition | Expected rejection |
| --- | --- | --- |
| Pre-state | Matches the scenario's expected starting mode | Must be `NOMINAL` |
| Acknowledgement | Accepted | Rejected |
| Post-state | Matches the commanded target mode | Matches the observed pre-state |
| Telemetry | Matches the observed post-state | Matches the observed post-state |

Each invariant retains its identifier, expected value, actual value and whether it passed. All 4 must pass for the execution outcome to be `PASS`. Expected command rejection can therefore pass verification. A valid observation with incorrect behaviour produces `FAIL`.

## Collection and verification

The [architecture guide's verification flow](architecture.md#verification-flow) shows how a selected scenario, loaded or collected observation and execution metadata form a verified record, including the paths that stop without a result.

The Python core defines expectations, verifies observations and reads or writes evidence. FastAPI handles HTTP requests and responses; React displays the results. The browser and CLI verify recorded observations without executing commands.

`ReferenceSpacecraft` is a deterministic **test double**, a small substitute for a spacecraft. It acts as the reference system under test (SUT) and starts in `NOMINAL`. The verifier defines expectations independently of this test double. Tests also submit observations directly to the verifier, using values that deliberately differ from scenario expectations.

In `ReferenceSpacecraft`, command rejection and command-handling errors leave the state unchanged. A collection or verification error does not tell you whether an external target changed state.

Subprocess collection requires 1 usable observation for the submitted command. If collection fails, it raises `ObservationCollectionError` without creating invariant results or a verified record. A successfully collected observation can then produce either `PASS` or `FAIL`. See the [subprocess protocol and collection errors](python.md#collect-from-a-separate-program).

## Continuity across executions

2 records can each pass their scenario checks while disagreeing about the state between commands. For example, one ends in `SAFE`, but the next starts in `NOMINAL`. The continuity check fails because of this unexplained change.

`verify_execution_sequence(...)` takes at least 2 `VerifiedExecutionRecord` instances. For each adjacent pair it compares the previous post-state mode with the next pre-state mode. Each continuity check records both execution IDs, the expected and observed modes and whether they match.

Records are checked in the order you provide them. The verifier never sorts by timestamp, execution ID or scenario. Execution IDs and timestamps may repeat, and timestamps do not have to increase. A sequence passes only when every record and every continuity check passes.

The Python sequence verifier uses each member's existing invariant results. It does not re-evaluate those checks, execute commands or change a target's state. Loading saved sequence evidence also recomputes each member's checks, as described below.

## Loading saved evidence

**Deserialisation** means reading JSON back into Python models. Observation deserialisation checks the supported structure, types and values. It does not choose a scenario or decide whether the behaviour passes verification.

Saved verified results are treated as claims to check. A verified-execution reader recomputes the invariant results and outcome from the saved scenario and observation. A sequence reader also reconstructs each member, recomputes continuity in saved order and derives the overall outcome. Stored results must match the recomputed results exactly. Inconsistent values are rejected rather than repaired.

These recomputed results are **canonical**: they come from the shared Python verification rules. A saved `FAIL` is valid evidence when its checks and outcome agree with these results.

See the [evidence format reference](evidence-formats.md) for exact fields, versions and metadata rules, or the [Python guide](python.md#reopen-saved-verified-evidence) for loading examples.
