# Python workflows

[README](../README.md) · [Verification concepts](verification.md) · [Evidence formats](evidence-formats.md)

The Python core collects and verifies observations, checks sequence continuity and reads or writes JSON evidence. It works without FastAPI, React, Node.js or a browser.

Use Python 3.12–3.15. Install the core from the repository root with `uv sync --locked`. Save an example below as a Python script and run it with `uv run --no-sync python your_script.py`. File paths in the examples are relative to the repository root.

## Verify an existing observation

Load the [bundled observation](examples/nominal-to-safe.json) and explicitly choose the expected scenario:

```python
from datetime import datetime, timezone
from pathlib import Path

from orbirig.evidence import (
    deserialize_execution_evidence,
    serialize_verified_execution_evidence,
)
from orbirig.models import ScenarioId
from orbirig.verification import build_verified_execution_record

observation = deserialize_execution_evidence(
    Path("docs/examples/nominal-to-safe.json").read_text(encoding="utf-8"),
)

record = build_verified_execution_record(
    execution_id="loaded-001",
    executed_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
    scenario_id=ScenarioId.NOMINAL_TO_SAFE_MODE,
    observation=observation,
)

print(serialize_verified_execution_evidence(record), end="")
```

This example produces `PASS` with four passing checks. Loading the observation validates its format; `build_verified_execution_record(...)` performs verification against the supplied `ScenarioId`. The scenario is never recovered or inferred from the observation.

## Execute a reference example

`ReferenceSpacecraft` supplies repeatable behaviour for exercising the harness. This example executes a command against that test double, collects its observation and independently verifies it:

```python
from datetime import datetime, timezone

from orbirig.evidence import serialize_verified_execution_evidence
from orbirig.execution import execute_verified_reference_workflow
from orbirig.models import ScenarioId
from orbirig.reference_sut import ReferenceSpacecraft

record = execute_verified_reference_workflow(
    spacecraft=ReferenceSpacecraft(),
    execution_id="reference-001",
    executed_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
    scenario_id=ScenarioId.NOMINAL_TO_SAFE_MODE,
)

print(serialize_verified_execution_evidence(record), end="")
```

A new `ReferenceSpacecraft` starts in `NOMINAL`. Reuse the same instance when subsequent commands should operate on the state left by earlier commands. The reference test double supplies observations; the separate verifier supplies expectations.

## Verify an ordered sequence

This example changes to `SAFE` and back to `NOMINAL` on the same reference instance. Both records and the continuity boundary pass:

```python
from datetime import datetime, timezone

from orbirig.evidence import serialize_verified_execution_sequence_evidence
from orbirig.execution import execute_verified_reference_workflow
from orbirig.models import ScenarioId
from orbirig.reference_sut import ReferenceSpacecraft
from orbirig.verification import verify_execution_sequence

spacecraft = ReferenceSpacecraft()
first = execute_verified_reference_workflow(
    spacecraft=spacecraft,
    execution_id="sequence-001",
    executed_at=datetime(2026, 1, 1, 10, 0, tzinfo=timezone.utc),
    scenario_id=ScenarioId.NOMINAL_TO_SAFE_MODE,
)
second = execute_verified_reference_workflow(
    spacecraft=spacecraft,
    execution_id="sequence-002",
    executed_at=datetime(2026, 1, 1, 10, 1, tzinfo=timezone.utc),
    scenario_id=ScenarioId.SAFE_TO_NOMINAL_MODE,
)

sequence = verify_execution_sequence([first, second])
print(serialize_verified_execution_sequence_evidence(sequence), end="")
```

The sequence verifier accepts at least two records and checks them in the supplied order. It does not sort by execution ID or timestamp, re-run commands or re-evaluate member scenario checks. A sequence can fail even when every member passes; see [continuity](verification.md#continuity-across-executions).

## Collect from a separate program

Replace `/path/to/observation-peer` below with an executable implementing the subprocess protocol. This call launches that program, sends one command, collects one observation and verifies it:

```python
from datetime import datetime, timezone

from orbirig.execution import execute_verified_subprocess_workflow
from orbirig.models import ScenarioId

record = execute_verified_subprocess_workflow(
    argv=["/path/to/observation-peer"],
    timeout=5.0,
    execution_id="external-001",
    executed_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
    scenario_id=ScenarioId.NOMINAL_TO_SAFE_MODE,
)
```

The protocol uses a separate process, not a shell or HTTP connection:

1. OrbiRig starts the `argv` program and sends one compact UTF-8 command JSON document on stdin, followed by one LF newline. For this scenario it sends:

   ```json
   {"command_type":"SET_OPERATING_MODE","target_mode":"SAFE"}
   ```

2. The program must exit with code `0` within the timeout and write exactly one [observation-evidence v1](evidence-formats.md#observation-evidence) document to stdout. Its recorded command must match the submitted command. Diagnostic text belongs on stderr.
3. OrbiRig validates the observation, then verifies it against the explicitly chosen scenario. Completed verification can produce `PASS` or `FAIL`.

Launch failures, timeouts, non-zero exits, invalid UTF-8, invalid evidence and returned-command mismatches raise `ObservationCollectionError` from `orbirig.subprocess_collection`. These errors produce no verified record and do not establish whether the external program changed its target's state.

For collection without verification, `collect_subprocess_observation(...)` takes `argv`, `command` and `timeout` and returns a `CommandExecutionObservation`. The caller must supply a separate scenario when subsequently verifying it.

## Reopen saved verified evidence

Save a record or sequence using its serializer, or save the [CLI output](cli.md#verify-the-bundled-example), then load it with the matching reader:

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

These readers recompute the relevant results and reject saved values that disagree. A consistent saved `FAIL` is accepted. See the [evidence reference](evidence-formats.md) for fields, versions, execution IDs and UTC timestamp rules.
