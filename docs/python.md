# Using the Python API

The Python API checks recorded command results against the [scenario you choose](verification.md#supported-scenarios) and returns the expected and observed values for each check. You can also collect observations from a separate program, check sequence continuity and read or write JSON evidence. The core works without FastAPI, React, Node.js or a browser.

Install [uv](https://docs.astral.sh/uv/getting-started/installation/) and use Python 3.12–3.15. From the repository root, install OrbiRig with `uv sync --locked`. Save an example as a Python script, then run `uv run --no-sync python your_script.py` from the same directory so the example can find its files.

For `scenario_id`, pass a `ScenarioId` member such as `ScenarioId.NOMINAL_TO_SAFE_MODE`. Convert a string explicitly first, for example with `ScenarioId("nominal_to_safe_mode")`. Passing a raw string raises `TypeError` before a command is executed or a subprocess is started.

`execute_verified_reference_workflow(...)` and `execute_verified_subprocess_workflow(...)` use `ScenarioId.NOMINAL_TO_SAFE_MODE` if you omit `scenario_id`. When you verify an existing observation, you must pass the scenario. The examples always choose it explicitly.

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

# The serialiser already includes the final newline.
print(serialize_verified_execution_evidence(record), end="")
```

Loading the observation validates its format. `build_verified_execution_record(...)` verifies it against the `ScenarioId` you provide. This example produces `PASS` with 4 passing checks.

## Execute a reference example

Run the command specified by the scenario against `ReferenceSpacecraft`, a small program that stands in for a spacecraft and gives repeatable observations. OrbiRig checks the returned observation using the scenario's rules.

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

This produces `PASS` with 4 passing checks: the starting mode, acknowledgement, ending mode and telemetry all meet the scenario's expectations. A new `ReferenceSpacecraft` starts in `NOMINAL`. Reuse the same instance when subsequent commands should operate on the state left by earlier commands.

## Verify an ordered sequence

This example changes to `SAFE` and back to `NOMINAL` on the same reference instance. Both records pass, and the ending mode of the first matches the starting mode of the second:

```python
from datetime import datetime, timezone

from orbirig.evidence import serialize_verified_execution_sequence_evidence
from orbirig.execution import execute_verified_reference_workflow
from orbirig.models import ScenarioId
from orbirig.reference_sut import ReferenceSpacecraft
from orbirig.verification import verify_execution_sequence

# Reuse the instance so the second command sees the state left by the first.
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

sequence = verify_execution_sequence([first, second])  # This order defines continuity.
print(serialize_verified_execution_sequence_evidence(sequence), end="")
```

The output contains two verified records, one passing continuity check and an overall `PASS`. The [continuity check](verification.md#continuity-across-executions) uses the order of the records in the list.

## Collect from a separate program

The bundled [example program](examples/observation_peer.py) reads a command requesting `SAFE` and returns a fixed observation of an accepted change from `NOMINAL` to `SAFE`, with matching telemetry. It uses only Python's standard library. Run this example from the repository root to launch the program, send 1 command, collect its observation and verify it:

```python
import sys
from datetime import datetime, timezone

from orbirig.evidence import serialize_verified_execution_evidence
from orbirig.execution import execute_verified_subprocess_workflow
from orbirig.models import ScenarioId

record = execute_verified_subprocess_workflow(
    # Use this script's Python interpreter, including its active environment.
    argv=[sys.executable, "docs/examples/observation_peer.py"],
    timeout=5.0,
    execution_id="external-001",
    executed_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
    scenario_id=ScenarioId.NOMINAL_TO_SAFE_MODE,
)

print(serialize_verified_execution_evidence(record), end="")
```

The result contains 4 passing checks and outcome `PASS`. To collect from your own program, pass a non-empty sequence in `argv`, with the program first and its arguments after it. An empty `argv` raises `ValueError` before a process starts.

For both subprocess entry points, `timeout` must be a positive, finite number of seconds no greater than `2_147_483`: an `int` or `float`, excluding booleans. This upper bound stays within the signed 32-bit millisecond range used by poll-based waits, with room for rounding. Values outside the range raise `ValueError`; other types raise `TypeError`. These caller errors occur before a process starts and are separate from `ObservationCollectionError`.

OrbiRig starts one process for each command and passes `argv` directly to it without a shell. It sends the command through standard input (stdin) and reads the observation from standard output (stdout).

1. OrbiRig starts the `argv` program and sends 1 compact UTF-8 command JSON document on stdin, followed by 1 LF newline. For this scenario it sends:

   ```json
   {"command_type":"SET_OPERATING_MODE","target_mode":"SAFE"}
   ```

2. The program must exit with code `0` within the timeout and write exactly one [observation-evidence v1](evidence-formats.md#observation-evidence) document to stdout. Its recorded command must match the submitted command. Write diagnostics to standard error (stderr).
3. OrbiRig validates the observation, then verifies it against the explicitly chosen scenario. Completed verification can produce `PASS` or `FAIL`.

`ObservationCollectionError` from `orbirig.subprocess_collection` covers a program that cannot start, times out or exits with a non-zero status. It also covers an invalid response, including invalid UTF-8, invalid evidence or a different command in the returned observation. OrbiRig has no usable observation to verify. Use a separate check to find out whether the target changed state.

The program runs with the same permissions as the caller. The timeout limits how long OrbiRig waits. It captures the program's standard output and error streams in memory, with no output size limit. The web API's 4 MiB request-body limit applies to HTTP requests.

For collection without verification, `collect_subprocess_observation(...)` takes `argv`, `command` and `timeout` and returns a `CommandExecutionObservation`. To verify this observation later, choose the expected scenario separately and pass it to the verifier.

Use the [stateful test target](stateful-target.md) to run operating-mode commands in separate processes and verify continuity in the resulting sequence. The target keeps its mode in an isolated file. With stale telemetry enabled, OrbiRig returns `FAIL` for a valid observation whose telemetry disagrees with the post-state.

You can collect and verify observations from the optional [C#/.NET 10 target](dotnet-stateful-target.md) with the same protocol and scenario rules.

## Reopen saved verified evidence

The serialisation functions return JSON text; your script writes that text to a file. To save the sequence and its first record, add this code to the [sequence example](#verify-an-ordered-sequence):

```python
from pathlib import Path

from orbirig.evidence import serialize_verified_execution_evidence

Path("verified-execution.json").write_text(
    serialize_verified_execution_evidence(first),
    encoding="utf-8",
    newline="\n",  # Keep LF endings on Windows too.
)
Path("verified-sequence.json").write_text(
    serialize_verified_execution_sequence_evidence(sequence),
    encoding="utf-8",
    newline="\n",
)
```

This writes UTF-8 files with LF line endings. The [CLI example](cli.md#verify-the-bundled-example) also shows how to save a verified execution record.

Run this separate example to load the 2 files with the matching readers:

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

The readers recalculate the checks and outcomes from the saved inputs. The [evidence format](evidence-formats.md) requires the stored results to match, including for a saved `FAIL`.

The writers also check the results before returning JSON. If you build a record or sequence by hand and its results disagree with OrbiRig's checks, the writer raises `ValueError`. Use `build_verified_execution_record(...)` and `verify_execution_sequence(...)` to calculate those results.
