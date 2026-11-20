# Verification concepts

[README](../README.md) · [Architecture](architecture.md) · [Using the Python API](python.md) · [Evidence formats](evidence-formats.md)

Choose a **scenario** to tell OrbiRig what you expect. Provide an **observation** containing what the program reported. OrbiRig compares the two and gives an expected and actual value for each check. **Evidence** is the JSON document that stores an observation or saved verification results.

The same approach applies when checking a recorded result from a software test or a data pipeline. Decide what the expected values should be separately from the data you are checking, then keep both sets of values with the result. OrbiRig applies this approach to the operating-mode scenarios described here.

## What an observation records

The three supported scenarios use a simplified spacecraft model with two **operating modes**. `NOMINAL` means normal operation and `SAFE` means a protective mode. The model represents these states and changes between them.

An observation records these values.

- **Command.** A request to set the operating mode.
- **Pre-state.** The mode before the program handles the command.
- **Acknowledgement.** Whether the program reported accepting or rejecting the command.
- **Post-state.** The mode after the program handles the command.
- **Telemetry.** A separate report of the operating mode.

## Supported scenarios

The command line and JSON evidence use these scenario IDs.

| Scenario ID | Starting mode for `PASS` | Requested mode | Expected response | Ending mode for `PASS` |
| --- | --- | --- | --- | --- |
| `nominal_to_safe_mode` | `NOMINAL` | `SAFE` | Accepted | `SAFE` |
| `nominal_to_nominal_rejection` | `NOMINAL` | `NOMINAL` | Rejected | `NOMINAL` |
| `safe_to_nominal_mode` | `SAFE` | `NOMINAL` | Accepted | `NOMINAL` |

The rejection scenario expects the program to reject a request for its current mode. A passing record reports a rejection and `NOMINAL` as its starting, ending and telemetry modes.

Python enum members use the corresponding uppercase names, for example `ScenarioId.NOMINAL_TO_SAFE_MODE`. All 3 scenarios use `SET_OPERATING_MODE`.

For `nominal_to_safe_mode`, the recorded command must request `SAFE`. If the command requests `NOMINAL`, OrbiRig reports an input error before it runs the checks. If the command requests `SAFE` and the recorded starting mode is `SAFE`, OrbiRig runs the checks and fails the starting-mode check. The Python API raises `ScenarioCommandMismatchError` for the input error.

OrbiRig runs four verification checks, called **invariants** in the API.

| Check | Accepted transition | Expected rejection |
| --- | --- | --- |
| Pre-state | Matches the scenario's expected starting mode | Must be `NOMINAL` |
| Acknowledgement | Accepted | Rejected |
| Post-state | Matches the commanded target mode | Matches the observed pre-state |
| Telemetry | Matches the observed post-state | Matches the observed post-state |

The telemetry check compares two values in the observation. For example, if the recorded post-state is `SAFE` and telemetry reports `NOMINAL`, the check shows expected `SAFE` and actual `NOMINAL`. A verification result is `FAIL` if any of the four checks fails.

## Collection and verification

The [architecture guide's verification flow](architecture.md#verification-flow) shows how a selected scenario, loaded or collected observation and execution metadata form a verified record, including the paths that stop without a result.

The browser and command line use the Python verifier to check recorded observations. With the Python API, you can also collect a new observation from a program by sending it a command.

`ReferenceSpacecraft` is a deterministic **test double**, a small substitute for a spacecraft. It acts as the reference system under test (SUT) and starts in `NOMINAL`. The verifier defines expectations independently of this test double. Tests also submit observations directly to the verifier, using values that deliberately differ from scenario expectations.

In `ReferenceSpacecraft`, command rejection and command-handling errors leave the state unchanged. A collection or verification error does not tell you whether an external target changed state.

OrbiRig needs one usable observation for each command it sends to a separate program. If collection fails, the Python API raises `ObservationCollectionError` before it has a record to verify. [Subprocess protocol](python.md#collect-from-a-separate-program)

## Continuity across executions

Two records can pass their own checks and fail a check between them. This **continuity check** compares the recorded ending mode of one command with the starting mode of the next. For example, an ending mode of `SAFE` followed by a starting mode of `NOMINAL` fails the check.

`verify_execution_sequence(...)` takes at least two `VerifiedExecutionRecord` instances. Each continuity result records both execution IDs, the expected mode (the first record's post-state) and the observed mode (the next record's pre-state).

OrbiRig checks records in the order you provide them. IDs and timestamps may repeat, and timestamps can be out of order. A sequence passes when every record and every continuity check passes.

The Python sequence verifier uses each member's existing check results. When loading a sequence from JSON, OrbiRig first recalculates the checks for every member.

## Loading saved evidence

**Deserialisation** means reading JSON back into Python models. Observation deserialisation checks the supported structure, types and values. It does not choose a scenario or decide whether the behaviour passes verification.

When you open a verified execution, OrbiRig recalculates the checks and outcome from its saved inputs. For a sequence, it also recalculates continuity in saved order and the sequence outcome. The reader rejects any stored result that disagrees with those calculations. A saved `FAIL` is valid evidence when the recalculated checks and outcome agree with it.

See the [evidence format reference](evidence-formats.md) for exact fields, versions and metadata rules, or the [Python guide](python.md#reopen-saved-verified-evidence) for loading examples.
