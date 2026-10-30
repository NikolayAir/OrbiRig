# Architecture

[README overview](../README.md#how-verification-works) · [Verification concepts](verification.md) · [Python workflows](python.md) · [Evidence formats](evidence-formats.md)

OrbiRig separates collecting a command's reported result, checking it against explicit expectations, and displaying or exporting the checks. The Python core owns validation, scenario rules and evidence formats. The command line and HTTP API call this core, while the React/TypeScript web interface submits requests to the API and displays the results. The core works without FastAPI, React, Node.js or a browser.

## Verification flow

The [README diagram](../README.md#how-verification-works) gives a compact overview. The detailed diagram below shows how an observation is loaded from JSON or collected during command execution, then checked against a separately selected scenario. It also shows where input and collection errors prevent record creation.

```mermaid
flowchart TD
    accTitle: Observation collection and independent verification
    accDescr: Observation JSON is validated and loaded, or the Python API executes the command required by the selected scenario and collects an observation. Python checks the observation against the scenario's separate expectations. The execution ID and UTC timestamp identify the verified record, which contains four checks and a PASS or FAIL outcome and can be exported as versioned JSON. Invalid input, a command that does not match the scenario, or a collection error prevents record creation.
    saved["Observation JSON"] --> load("Validate and load JSON")
    scenario["Selected scenario"] -->|Command| collect("Collect via Python API<br/>reference or subprocess")
    collect --> observation
    load --> observation["Observation<br/>command + reported values"]
    scenario -->|Expectations| verifier("Verify in Python<br/>four invariant checks")
    observation --> verifier
    load -->|Invalid data| error["Input error<br/>no verified record"]
    verifier -->|Command mismatch| error
    collect -->|Collection failure| collectionError["Collection error<br/>no verified record"]
    verifier --> record["Verified execution record<br/>scenario + observation + checks<br/>PASS or FAIL"]
    metadata["Execution ID<br/>UTC timestamp"] --> record
    record -->|Export| evidence["Versioned JSON evidence"]
```

Rounded boxes show actions; square-cornered boxes show data or results. The caller selects the scenario independently of the recorded values and provides the execution ID and UTC timestamp. Invalid metadata also prevents record creation.

A valid observation can produce `FAIL`; an expected command rejection can produce `PASS`. Invalid input, a command incompatible with the selected scenario or a collection failure produces no verified record. A collection or verification error does not establish whether an external target changed state. See [verification concepts](verification.md) for the checks and their meaning, and the [Python collection guide](python.md#collect-from-a-separate-program) for the subprocess boundary.

## Component responsibilities

| Component | Responsibility |
| --- | --- |
| [Models](../src/orbirig/models.py) | Define the supported scenarios, commands, observations, execution metadata and result structures. |
| [Verification](../src/orbirig/verification.py) | Compare observations with explicit scenario expectations and check continuity between adjacent records without changing their order. |
| [Command execution and observation collection](../src/orbirig/execution.py) | Select the scenario's command, collect its observation through the [reference workflow](../src/orbirig/workflow.py) or [target subprocess](../src/orbirig/subprocess_collection.py), then request verification. |
| [Evidence JSON](../src/orbirig/evidence.py) | Validate JSON structures and values, serialise evidence and recompute the checks and outcomes when reopening saved verified records. |
| [Command line](../src/orbirig/cli.py) and [HTTP API](../src/orbirig/web.py) | Read input, call the Python core and return results or errors. These interfaces check recorded data without executing spacecraft commands. |
| [Browser interface](../frontend/src/App.tsx) | Submit observations or saved evidence to the HTTP API and display results, request errors and cancellation status. |

[`ReferenceSpacecraft`](../src/orbirig/reference_sut.py) is a simplified, deterministic test double used to produce repeatable observations. The verifier defines expectations independently of this test double.

Loading saved verified evidence recomputes its checks and outcome rather than trusting the stored results. Sequence loading also reconstructs each member and checks continuity in the saved order. Stored results must agree exactly; a consistent `FAIL` remains valid evidence. See [loading saved evidence](verification.md#loading-saved-evidence) and the [JSON contracts](evidence-formats.md).
