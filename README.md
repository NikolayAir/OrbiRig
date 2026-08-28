# OrbiRig

OrbiRig is a non-operational verification harness for simplified spacecraft operating-mode workflows. It checks whether observed command results match explicit expected behaviour, represents observations and verification results as deterministic versioned JSON evidence, and can also check continuity across an ordered sequence of executions.

`ReferenceSpacecraft` is a deterministic, simplified spacecraft-behaviour test double used to exercise the harness as its reference system under test (SUT). It provides repeatable behaviour for the supported scenarios, while verification remains independent of that behaviour.

**Core:** Python

**Web interface:** FastAPI · React · TypeScript · Vite · [Live](https://orbirig-evidence-inspector.onrender.com/)

**Testing and CI:** pytest · pytest-cov · Behave · Vitest · React Testing Library · Ruff · GitHub Actions

The web interface supports two tasks: verify an observation against a selected scenario, or inspect existing evidence without changing it.

![OrbiRig web interface showing the observation-verification workflow](docs/images/orbirig-web-verification.png)

## Key capabilities

* execute three deterministic reference operating-mode scenarios and collect the command, pre-state, acknowledgement, post-state, and telemetry;
* collect observation evidence from a separate target program through a one-shot subprocess boundary;
* verify observations independently against an explicitly selected `ScenarioId`, distinguishing expected command rejection from failed verification;
* verify operating-mode continuity across explicitly ordered verified execution records;
* serialise observations, verified execution records, and verified sequences to deterministic versioned JSON;
* strictly reconstruct persisted evidence and independently recompute stored verification results rather than trusting them;
* verify submitted observation evidence and inspect all three supported evidence forms through the web interface, while evidence deserialisation and verification remain in the OrbiRig core.

## Verification flow

At a high level, OrbiRig separates observation collection, independent verification, and reconstruction of persisted evidence.

```mermaid
flowchart LR
    scenario["Explicit ScenarioId"] --> command["Scenario command"]
    command --> workflow("Reference workflow")
    sut["ReferenceSpacecraft<br/>reference SUT"] --> workflow
    workflow --> observation["CommandExecutionObservation"]

    command --> subprocess_workflow("Subprocess workflow")
    target["Separate target program"] -->|"observation evidence"| subprocess_workflow
    subprocess_workflow --> observation

    persisted["Persisted observation JSON<br/>format v1"] --> loader("Strict deserialisation<br/>structure + values")
    loader --> observation

    scenario --> verifier("Independent verification")
    observation --> verifier

    verified_persisted["Persisted verified-execution JSON<br/>schema v1"] --> verified_loader("Strict deserialisation<br/>structure + semantic consistency")
    verified_loader --> record

    metadata["Execution ID + UTC time"] --> record
    verifier --> record
    record["VerifiedExecutionRecord<br/>ordered invariants + derived outcome"] --> evidence["Verified execution JSON"]

    records["2+ explicitly ordered<br/>VerifiedExecutionRecord instances"] --> continuity("Ordered continuity verification")
    continuity --> sequence["VerifiedExecutionSequence<br/>boundary results + derived outcome"]
    sequence --> sequence_evidence["Verified sequence JSON"]

    sequence_persisted["Persisted verified-sequence JSON<br/>schema v1"] --> sequence_loader("Strict deserialisation<br/>member + sequence consistency")
    sequence_loader --> sequence
```

Fresh observations can come from the reference workflow or subprocess collection and capture one command execution. Persisted version `1` observation JSON reaches the same `CommandExecutionObservation` model through a separate strict deserialisation boundary. In all cases, the caller supplies the scenario expectation; it is never inferred from the observation.

## Verification boundaries

`ReferenceSpacecraft` provides deterministic reference behaviour, while verification remains independent of the reference SUT. Deserialising observation evidence checks only that its structure and values are valid for the supported format; it neither selects a `ScenarioId` nor establishes verification success. The caller supplies the scenario expectation, and tests also submit intentionally inconsistent observations directly to the verifier.

Persisted derived results are treated as claims. Verified-execution deserialisation recomputes canonical invariant results and outcome; sequence deserialisation also reconstructs members canonically and recomputes continuity and the aggregate outcome in persisted order. Stored derived values must match exactly, so a canonically consistent `FAIL` record or sequence remains valid evidence.

Subprocess collection sends one compact command JSON document on stdin and requires stdout to contain exactly one valid observation-evidence document using the existing version `1` format. The collector treats launch failures, timeouts, non-zero exits, invalid UTF-8, invalid evidence, and returned-command mismatches as `ObservationCollectionError`. These failures prevent collection from producing a verified execution, so no invariant results or `VerifiedExecutionRecord` are constructed. `ExecutionOutcome.FAIL` remains reserved for successfully collected observations that violate verification expectations.

## Supported reference scenarios

| Scenario | Pre-state | Command | Expected acknowledgement | Expected post-state |
| --- | --- | --- | --- | --- |
| `NOMINAL_TO_SAFE_MODE` | `NOMINAL` | `SET_OPERATING_MODE(SAFE)` | accepted | `SAFE` |
| `NOMINAL_TO_NOMINAL_REJECTION` | `NOMINAL` | `SET_OPERATING_MODE(NOMINAL)` | rejected | `NOMINAL` |
| `SAFE_TO_NOMINAL_MODE` | `SAFE` | `SET_OPERATING_MODE(NOMINAL)` | accepted | `NOMINAL` |

For accepted transitions, verification checks the expected pre-state, accepted acknowledgement, requested post-state, and telemetry consistency with the observed post-state. For the expected rejection, it checks the expected `NOMINAL` pre-state, rejected acknowledgement, state preservation, and telemetry consistency.

## Ordered execution continuity

Ordered continuity verification detects cross-execution state discontinuities that individual verified records cannot.

`verify_execution_sequence(...)` evaluates at least two explicitly ordered `VerifiedExecutionRecord` instances. For each adjacent pair, it compares the previous post-state and next pre-state operating modes and retains both execution IDs, the expected and observed modes, and the boundary result.

Supplied order is authoritative: the verifier does not sort or infer order from timestamps, execution IDs, or scenarios. A sequence passes only if all member records and continuity boundaries pass; member scenario invariants are not re-evaluated. The verifier is pure: it neither executes commands nor mutates a SUT.

## Execution evidence

OrbiRig serialises three evidence forms.

### Observation evidence

Observation evidence records the command, pre-state, acknowledgement, post-state, and telemetry from one execution. `serialize_execution_evidence(...)` writes deterministic JSON using format version `1`; `deserialize_execution_evidence(...)` strictly reconstructs a `CommandExecutionObservation` and rejects malformed JSON, duplicate object member names at any nesting level, unsupported versions, invalid shapes, missing or unexpected fields, incorrect primitive types, unknown modes, and unsupported command types.

Observation evidence contains neither `ScenarioId`, invariant results, nor a verification outcome. Successful deserialisation therefore does not mean that the observation passes verification.

### Verified execution records

`VerifiedExecutionRecord` combines an explicit execution ID, UTC execution time, selected `ScenarioId`, observation, ordered invariant results with expected and actual values, and a derived outcome. Its derived outcome is `PASS` only when all invariants pass.

`serialize_verified_execution_evidence(...)` writes deterministic JSON using verified-execution schema version `1`. `deserialize_verified_execution_evidence(...)` strictly reconstructs a record by independently deriving its canonical invariant results and outcome from the persisted scenario and observation, then requiring the stored derived values to match exactly. A canonically consistent `FAIL` record remains valid evidence. Package and evidence/schema versions are independent; changing one does not imply changing the other.

### Verified execution sequences

`serialize_verified_execution_sequence_evidence(...)` writes an ordered `VerifiedExecutionSequence` using verified-execution-sequence schema version `1`. Each member is stored as complete nested verified-execution data, followed by every ordered continuity result and the aggregate outcome.

`deserialize_verified_execution_sequence_evidence(...)` strictly reconstructs each member through the verified-execution evidence semantics, then recomputes continuity in persisted order. Persisted boundaries and the aggregate outcome must exactly match the canonical sequence result. Duplicate execution IDs and equal or non-monotonic timestamps remain valid; neither determines sequence order.

## Usage

### Execute and verify a reference workflow

```python
from datetime import datetime, timezone

from orbirig.evidence import serialize_verified_execution_evidence
from orbirig.execution import execute_verified_reference_workflow
from orbirig.models import ScenarioId
from orbirig.reference_sut import ReferenceSpacecraft

record = execute_verified_reference_workflow(
    spacecraft=ReferenceSpacecraft(),
    execution_id="example-001",
    executed_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
    scenario_id=ScenarioId.NOMINAL_TO_SAFE_MODE,
)

print(serialize_verified_execution_evidence(record))
```

### Verify loaded observation evidence

```python
from datetime import datetime, timezone
from pathlib import Path

from orbirig.evidence import deserialize_execution_evidence
from orbirig.execution import build_verified_execution_record
from orbirig.models import ScenarioId

observation = deserialize_execution_evidence(
    Path("observation.json").read_text(encoding="utf-8"),
)

record = build_verified_execution_record(
    execution_id="loaded-001",
    executed_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
    scenario_id=ScenarioId.NOMINAL_TO_SAFE_MODE,
    observation=observation,
)
```

The explicit `ScenarioId` supplied to `build_verified_execution_record(...)` selects the expectations for the loaded observation; it is not recovered or inferred from the loaded evidence.

### Execute and verify a subprocess workflow

```python
from datetime import datetime, timezone

from orbirig.execution import execute_verified_subprocess_workflow

record = execute_verified_subprocess_workflow(
    argv=["/path/to/observation-peer"],
    timeout=5.0,
    execution_id="external-001",
    executed_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
)
```

The target receives `{"command_type":"SET_OPERATING_MODE","target_mode":"SAFE"}` followed by one newline for the default scenario. It must exit successfully and write exactly one valid observation-evidence version `1` document to stdout. A successfully collected observation then follows the same canonical verification path as directly loaded or reference-workflow observations, so its result may be either `PASS` or `FAIL`.

### Verify observations and inspect evidence in the web interface

Install the web and frontend dependencies:

```bash
python -m pip install -e ".[web]"
cd frontend
npm ci
cd ..
```

For local development, start FastAPI and Vite in separate terminals:

```bash
uvicorn orbirig.web:app --reload
```

```bash
cd frontend
npm run dev
```

During local development, Vite proxies API requests to FastAPI. For verification, the frontend sends execution metadata, the explicitly selected `ScenarioId`, and the raw observation-evidence textarea value in a JSON request. The FastAPI backend passes that string unchanged to `deserialize_execution_evidence(...)`, then delegates verification to `build_verified_execution_record(...)`. A completed verification may return either `PASS` or `FAIL`; invalid input remains a separate error response.

The read-only evidence-inspection workflow submits its textarea value unchanged as a `text/plain; charset=utf-8` request body. The FastAPI backend decodes it and delegates directly to the corresponding strict evidence deserialiser. The browser does not parse or verify submitted evidence; strict evidence validation remains server-side in both workflows.

To serve the built interface through FastAPI, build the frontend before starting the application:

```bash
cd frontend
npm run build
cd ..
uvicorn orbirig.web:app
```

Interactive observation verification renders execution metadata, observation details, verification checks, and the derived outcome. Observation inspection renders observation details only. Verified-execution inspection adds execution metadata, explicit `ScenarioId`, verification checks, and the derived outcome; sequence inspection adds the aggregate outcome, ordered member records, and continuity checks. Canonically consistent `FAIL` records and sequences remain valid evidence.

### Reconstruct persisted verified evidence

```python
from pathlib import Path

from orbirig.evidence import (
    deserialize_verified_execution_evidence,
    deserialize_verified_execution_sequence_evidence,
)

record = deserialize_verified_execution_evidence(
    Path("verified-execution.json").read_text(encoding="utf-8"),
)

sequence = deserialize_verified_execution_sequence_evidence(
    Path("verified-sequence.json").read_text(encoding="utf-8"),
)
```

Both readers return reconstructed models only when persisted derived values match OrbiRig's independently recomputed canonical verification semantics.

## Local setup

OrbiRig currently requires Python 3.12. Create and activate a Python 3.12 virtual environment, then install the project with its test, development, and web dependencies:

```bash
python -m pip install -e ".[test,dev,web]"
```

## Development checks

Run the Python checks:

```bash
python -m pytest -q
behave
python -m ruff check .
```

The pytest configuration measures branch coverage across the complete `orbirig` package and reports missing lines and branches in the terminal. Coverage reporting is non-gating.

Behave covers the three supported reference workflows; detailed negative cases, determinism, evidence behaviour, and deserialisation boundaries are covered in pytest.

Run the frontend checks:

```bash
cd frontend
npm ci
npm test
npm run build
```

GitHub Actions runs package-import checks, Ruff, pytest, and Behave for the Python package, plus frontend type checking, tests, a production build, and a FastAPI serving smoke check on pull requests and pushes to `main`.

## Releases

Versioned release notes are available in [GitHub Releases](https://github.com/NikolayAir/OrbiRig/releases).

## Current scope

OrbiRig intentionally focuses on deterministic verification of simplified operating-mode workflows and independently inspectable execution evidence. Its web interface verifies submitted observation evidence against an explicitly selected supported scenario and provides read-only inspection of observation, verified-execution, and verified-execution-sequence evidence. The web interface itself does not execute commands against a spacecraft or external target. Outside the web interface, external target execution is limited to one command and one observation per subprocess invocation. Remote target execution over HTTP, persistent storage, replay, and report generation remain unsupported. OrbiRig does not claim compliance with any specific space-industry standard.

## Security

Report suspected vulnerabilities privately through GitHub Private Vulnerability Reporting; see [SECURITY.md](SECURITY.md).

## License

OrbiRig is available under the [MIT License](LICENSE).
