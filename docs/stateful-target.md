# Verify a stateful test target

[Python API](python.md#collect-from-a-separate-program) · [Verification concepts](verification.md)

The [stateful target](../examples/stateful_target.py) is a non-operational test program. It handles operating-mode commands independently of OrbiRig, using only Python's standard library. It does not import `ReferenceSpacecraft`, scenario expectations or verification rules.

Each command starts a new process through the existing stdin/stdout protocol. The processes share an explicitly created state file containing `{"operating_mode": "NOMINAL"}` or `{"operating_mode": "SAFE"}`. This is the target's local state, separate from OrbiRig's versioned evidence.

The target accepts a change to the other supported mode and rejects a request for its current mode. It reports pre-state, acknowledgement, post-state and telemetry separately. The optional `--stale-telemetry` flag reports the pre-command mode as telemetry. After an accepted change, this disagrees with the post-state while the actual change is still saved. OrbiRig then checks the observation against the scenario chosen by the caller.

## Run a round trip and detect stale telemetry

With the [Python environment](../CONTRIBUTING.md#python-environment) installed, run this from the repository root:

```bash
uv run --no-sync python - <<'PY'
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from tempfile import TemporaryDirectory

from orbirig.execution import execute_verified_subprocess_workflow
from orbirig.models import ScenarioId
from orbirig.verification import verify_execution_sequence

target = Path("examples/stateful_target.py").resolve()
executed_at = datetime(2026, 11, 1, tzinfo=timezone.utc)

with TemporaryDirectory(prefix="orbirig-target-") as directory:
    state_file = Path(directory) / "state.json"
    state_file.write_text('{"operating_mode":"NOMINAL"}\n', encoding="utf-8")

    def run(scenario, execution_id, *, stale=False):
        # Each call launches a separate process; only the state file is shared.
        argv = [sys.executable, "-I", "-S", str(target), "--state-file", str(state_file)]
        if stale:
            argv.append("--stale-telemetry")
        return execute_verified_subprocess_workflow(
            argv=argv, timeout=5.0, execution_id=execution_id,
            executed_at=executed_at, scenario_id=scenario,
        )

    first = run(ScenarioId.NOMINAL_TO_SAFE_MODE, "to-safe")
    second = run(ScenarioId.SAFE_TO_NOMINAL_MODE, "to-nominal")
    sequence = verify_execution_sequence([first, second])
    print("Round trip:", sequence.outcome.value)
    print("Continuity:", sequence.continuity_results[0].passed)

    rejected = run(ScenarioId.NOMINAL_TO_NOMINAL_REJECTION, "reject-no-change")
    print("Expected rejection:", rejected.outcome.value)

    faulty = run(ScenarioId.NOMINAL_TO_SAFE_MODE, "stale-telemetry", stale=True)
    print("Stale telemetry:", faulty.outcome.value)
    check = faulty.invariant_results[3]
    print(f"Telemetry: expected {check.expected}, actual {check.actual}")
    print("State after fault:", json.loads(state_file.read_text(encoding="utf-8"))["operating_mode"])

    recovered = run(ScenarioId.SAFE_TO_NOMINAL_MODE, "after-fault")
    print("Next command:", recovered.outcome.value)
PY
```

Expected output:

```text
Round trip: PASS
Continuity: True
Expected rejection: PASS
Stale telemetry: FAIL
Telemetry: expected SAFE, actual NOMINAL
State after fault: SAFE
Next command: PASS
```

The `FAIL` record has 3 passing checks and 1 failed telemetry check. The following process reads the committed `SAFE` state and successfully changes it back to `NOMINAL`. Existing [evidence functions](python.md#reopen-saved-verified-evidence) can save and reopen these records and sequences without a new format.

## See a collection error

From the repository root, run this as a separate example with the same Python environment. It deliberately leaves the state file missing:

```bash
uv run --no-sync python - <<'PY'
import sys
from datetime import datetime, timezone
from pathlib import Path
from tempfile import TemporaryDirectory

from orbirig.execution import execute_verified_subprocess_workflow
from orbirig.models import ScenarioId
from orbirig.subprocess_collection import ObservationCollectionError

target = Path("examples/stateful_target.py").resolve(strict=True)

with TemporaryDirectory(prefix="orbirig-missing-state-") as directory:
    state_file = Path(directory) / "missing.json"
    record = None
    try:
        record = execute_verified_subprocess_workflow(
            argv=[sys.executable, "-I", "-S", str(target), "--state-file", str(state_file)],
            timeout=5.0, execution_id="missing-state",
            executed_at=datetime(2026, 11, 1, tzinfo=timezone.utc),
            scenario_id=ScenarioId.NOMINAL_TO_SAFE_MODE,
        )
    except ObservationCollectionError as error:
        print("Collection error:", error)
    else:
        raise AssertionError("missing state must cause a collection error")
    print("Verified record returned:", record is not None)
PY
```

Expected output:

```text
Collection error: observation subprocess exited with status 2
Verified record returned: False
```

The earlier stale-telemetry example returned a valid observation and a verified `FAIL` record. Here the target exits with code `2` without an observation, so collection raises an error and no verified record is returned. In general, a collection error does not establish whether an external target changed state.

## State and failure boundaries

Use a separate regular state file for each independent target or test session. Commands within that session must share the same file and run sequentially, with only 1 caller at a time. Missing files, a symbolic link or directory in place of the file, malformed JSON, repeated field names, unsupported modes and invalid commands are errors; the target does not create or repair state automatically. It writes diagnostics to stderr and exits with code `2`, without an observation. The collector reports `ObservationCollectionError`, rather than a verification outcome.

Commands and stored state are validated before any write. Rejected commands leave the original bytes unchanged. An accepted change is written to a temporary file beside the state file, then replaces it atomically; failed writes or replacements preserve the original file. This does not provide concurrent-writer coordination or protection against power loss. Once state is committed, a later reply or collection error does not establish rollback, as described in the [subprocess contract](python.md#collect-from-a-separate-program).

This example models only 2 operating modes and 1 controlled stale-telemetry fault. It does not represent operational spacecraft behaviour.
