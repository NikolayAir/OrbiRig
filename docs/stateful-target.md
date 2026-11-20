# Verify a stateful test target

The [stateful target](../examples/stateful_target.py) is a separate Python program that handles operating-mode commands and keeps its mode between runs. It uses Python's standard library. OrbiRig collects its reports and checks them against the [scenario you choose](verification.md#supported-scenarios).

The optional [C#/.NET 10 target](dotnet-stateful-target.md) uses the same command and observation format.

OrbiRig starts a new process for each command. The processes share a state file that contains `{"operating_mode": "NOMINAL"}` or `{"operating_mode": "SAFE"}`. The file stores the target's current mode. The target returns the command and its reported result in a separate observation document.

The target accepts a change to the other mode and rejects a request for its current mode. With `--stale-telemetry`, it saves an accepted change and reports the previous mode as telemetry (a separate report of the operating mode). OrbiRig then sees a mismatch between the reported ending mode and telemetry.

## Run a round trip and detect stale telemetry

Use [uv with a supported Python version](../CONTRIBUTING.md#python-environment). From the repository root, install OrbiRig with `uv sync --locked` and run the example in a Bash-compatible shell.

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

Only the telemetry check fails. The next process reads `SAFE` from the state file and changes it back to `NOMINAL`. You can [save or reopen these records in Python](python.md#reopen-saved-verified-evidence).

## Simulate a response failure after state commit

Use `--fail-after-commit` to make the target save an accepted change and exit before it returns an observation. The target exits with code `3`, writes a diagnostic to standard error and leaves standard output empty. A rejected command still returns a rejection observation with code `0`. If you set both fault flags for an accepted change, the target saves the change and exits with code `3`.

From the repository root, run this as a separate example with the same Python environment:

```bash
uv run --no-sync python - <<'PY'
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from tempfile import TemporaryDirectory

from orbirig.execution import execute_verified_subprocess_workflow
from orbirig.models import ScenarioId
from orbirig.subprocess_collection import ObservationCollectionError

target = Path("examples/stateful_target.py").resolve(strict=True)

with TemporaryDirectory(prefix="orbirig-response-failure-") as directory:
    state_file = Path(directory) / "state.json"
    state_file.write_text('{"operating_mode":"NOMINAL"}\n', encoding="utf-8")
    argv = [sys.executable, "-I", "-S", str(target), "--state-file", str(state_file)]
    executed_at = datetime(2026, 11, 1, tzinfo=timezone.utc)
    record = None
    try:
        record = execute_verified_subprocess_workflow(
            argv=[*argv, "--fail-after-commit"],
            timeout=5.0, execution_id="response-failure", executed_at=executed_at,
            scenario_id=ScenarioId.NOMINAL_TO_SAFE_MODE,
        )
    except ObservationCollectionError as error:
        print("Collection error:", error)
    else:
        raise AssertionError("response failure must cause a collection error")
    print("Verified record returned:", record is not None)
    print("State after collection error:", json.loads(state_file.read_text(encoding="utf-8"))["operating_mode"])

    following = execute_verified_subprocess_workflow(
        argv=argv, timeout=5.0, execution_id="after-response-failure",
        executed_at=executed_at, scenario_id=ScenarioId.SAFE_TO_NOMINAL_MODE,
    )
    print("Next command:", following.outcome.value)
PY
```

Expected output:

```text
Collection error: observation subprocess exited with status 3
Verified record returned: False
State after collection error: SAFE
Next command: PASS
```

The collector raises `ObservationCollectionError` before it can verify a result. The exception includes the exit status. The collector captures the target's standard error stream separately.

The target can fail at different points, with different effects on the saved state.

| Target behaviour | OrbiRig result | Target state |
| --- | --- | --- |
| A valid observation reports incorrect telemetry (`--stale-telemetry`) | Verified `FAIL` | The accepted change is saved. |
| An input or file error stops the target before it replaces the state file. | Collection error without a verified record | The original file still contains the previous mode. |
| The target saves a change and exits without an observation (`--fail-after-commit`). | Collection error without a verified record | The accepted change is already saved. |

After a collection error, use a separate check to learn the target's state. This example reads the state file and confirms the saved mode by sending another command in a new process.

## State and failure boundaries

Use a separate regular state file with exactly 1 hard link for each independent target or test session. Commands within that session must share the same file and run sequentially, with only 1 caller at a time. Missing files, symbolic links, hard-linked aliases, directories, malformed JSON, repeated field names, unsupported modes and invalid commands are errors; the target does not create or repair state automatically. It writes diagnostics to stderr and exits with code `2`, without an observation. The collector reports `ObservationCollectionError`, rather than a verification outcome.

The target validates the command and state before writing. Rejected commands leave the file unchanged. To save an accepted change, the target writes a temporary file in the same directory and calls `os.replace` to replace the state file. On a filesystem that supports atomic replacement, a reader sees either the original file or the complete new file. Use a trusted directory and run one target process at a time. Check the saved state separately after a [subprocess collection error](python.md#collect-from-a-separate-program). The caller is responsible for recovery after power loss.

This example models only 2 operating modes and 2 controlled faults: stale telemetry and a response failure after state commit. It does not represent operational spacecraft behaviour.
