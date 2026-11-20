# Verify an independent C#/.NET program

The [.NET target](../examples/dotnet_stateful_target/) is a C# console program that handles a command and keeps its operating mode in a file between runs. It implements the command handling using .NET 10 and `System.Text.Json`. OrbiRig's Python verifier checks the program's report against the scenario you choose.

For each command, OrbiRig uses the [Python subprocess API](python.md#collect-from-a-separate-program) to start the compiled program and send the command as JSON. The program checks the input and state, handles the command and returns [observation evidence](evidence-formats.md#observation-evidence) in the same format as the [Python stateful target](stateful-target.md).

Use the example to check two mode changes across separate runs, detect a mismatch between telemetry and the reported ending mode, and check what the program saved after a collection error. Only this optional workflow needs the .NET SDK.

## Prerequisites and build

Use a repository checkout, [uv](https://docs.astral.sh/uv/getting-started/installation/) and Python 3.12–3.15. From the repository root, install the Python core and CLI:

```bash
uv sync --locked
```

No Python extras are needed for the runnable example below. See the [Python environment guide](../CONTRIBUTING.md#python-environment) to select another supported interpreter or restore a full development environment. Each sync installs only the requested extras.

Install the **.NET 10 SDK**, which includes the runtime, following Microsoft's instructions for [macOS](https://learn.microsoft.com/en-us/dotnet/core/install/macos) or [Linux](https://learn.microsoft.com/en-us/dotnet/core/install/linux). Use an OS version and architecture supported by that SDK; Python's platform support does not establish .NET compatibility.

The target also requires `/usr/bin/stat`, the standard macOS utility or GNU Coreutils `stat` on Linux. It reports file type and hard-link count, which the public .NET file APIs do not expose together. The target calls it with an absolute path and separate arguments, without a shell. On an unsupported platform, or if `stat` is missing or cannot check the path, the target exits without replacing the state file.

From the repository root, the build and run commands are the same on macOS and Linux:

```bash
dotnet --list-sdks
(
  cd examples/dotnet_stateful_target
  dotnet build StatefulTarget.csproj --configuration Release --disable-build-servers
)
```

`--list-sdks` should include `10.0.*`. Building from the example directory applies its local `global.json`, which selects the latest installed stable .NET 10 feature band and excludes other major versions. The build creates `examples/dotnet_stateful_target/bin/Release/net10.0/StatefulTarget.dll`. It uses the SDK and built-in libraries, with no NuGet package references. Run the DLL with `dotnet`; building separately keeps build messages out of the observation channel. Generated `bin/`, `obj/` and `artifacts/` directories are ignored by Git.

If VS Code reports `dotnet: command not found` or cannot restore the project, check `dotnet --info` and `dotnet --list-sdks` in a new terminal. A runtime downloaded for the C# extension is not a project SDK. For a manual installation, add the SDK directory to your shell's `PATH` as described in the installation guide, then fully quit and reopen VS Code so its extensions inherit the new environment. No ASP.NET project or additional NuGet package is needed for this example.

## Verify transitions, rejection and both controlled faults

After building, run the example from the repository root. Each call starts a new .NET process and shares the temporary state file. The Python script sets the scenario, execution ID and time before each call.

```bash
uv run --no-sync python - <<'PY'
import json
from datetime import datetime, timezone
from pathlib import Path
from tempfile import TemporaryDirectory

from orbirig.evidence import serialize_verified_execution_evidence
from orbirig.execution import execute_verified_subprocess_workflow
from orbirig.models import ScenarioId
from orbirig.subprocess_collection import ObservationCollectionError
from orbirig.verification import verify_execution_sequence

dll = Path("examples/dotnet_stateful_target/bin/Release/net10.0/StatefulTarget.dll").resolve(strict=True)
executed_at = datetime(2026, 11, 1, tzinfo=timezone.utc)

with TemporaryDirectory(prefix="orbirig-dotnet-") as directory:
    state_file = Path(directory) / "state.json"
    state_file.write_text('{"operating_mode":"NOMINAL"}\n', encoding="utf-8")

    def run(scenario, execution_id, *flags):
        return execute_verified_subprocess_workflow(
            argv=["dotnet", str(dll), "--state-file", str(state_file), *flags],
            timeout=10.0, execution_id=execution_id,
            executed_at=executed_at, scenario_id=scenario,
        )

    first = run(ScenarioId.NOMINAL_TO_SAFE_MODE, "to-safe")
    second = run(ScenarioId.SAFE_TO_NOMINAL_MODE, "to-nominal")
    sequence = verify_execution_sequence([first, second])
    print("Round trip:", sequence.outcome.value)
    print("Continuity:", sequence.continuity_results[0].passed)

    rejected = run(ScenarioId.NOMINAL_TO_NOMINAL_REJECTION, "reject-no-change")
    print("Expected rejection:", rejected.outcome.value)

    faulty = run(ScenarioId.NOMINAL_TO_SAFE_MODE, "stale", "--stale-telemetry")
    print("Stale telemetry:", faulty.outcome.value)
    for check in faulty.invariant_results:
        if not check.passed:
            print(f"{check.invariant_id.value}: expected {check.expected}, actual {check.actual}")
    print("State after telemetry fault:", json.loads(state_file.read_bytes())["operating_mode"])
    Path("dotnet-stale-telemetry.json").write_text(
        serialize_verified_execution_evidence(faulty),
        encoding="utf-8",
        newline="\n",
    )
    recovered = run(ScenarioId.SAFE_TO_NOMINAL_MODE, "after-stale")
    print("Next command:", recovered.outcome.value)

    record = None
    try:
        record = run(ScenarioId.NOMINAL_TO_SAFE_MODE, "response-failure", "--fail-after-commit")
    except ObservationCollectionError as error:
        print("Collection error:", error)
    else:
        raise AssertionError("a response failure must cause a collection error")
    print("Verified record returned:", record is not None)
    print("State after collection error:", json.loads(state_file.read_bytes())["operating_mode"])
    following = run(ScenarioId.SAFE_TO_NOMINAL_MODE, "after-response-failure")
    print("Next command:", following.outcome.value)
PY
```

Expected output:

```text
Round trip: PASS
Continuity: True
Expected rejection: PASS
Stale telemetry: FAIL
telemetry_matches_post_state: expected SAFE, actual NOMINAL
State after telemetry fault: SAFE
Next command: PASS
Collection error: observation subprocess exited with status 3
Verified record returned: False
State after collection error: SAFE
Next command: PASS
```

- **Round trip and rejection.** The two changes pass verification and the ending mode of the first matches the starting mode of the second. The rejection passes the selected rejection scenario and leaves the state file unchanged.
- **`--stale-telemetry`.** The target saves `SAFE` and reports the previous mode, `NOMINAL`, as telemetry. Only `telemetry_matches_post_state` fails. OrbiRig returns a valid `FAIL` record.
- **`--fail-after-commit`.** The target saves the change, exits with code `3` and writes a diagnostic to standard error. The collector captures that stream and reports the exit code in `ObservationCollectionError`. OrbiRig has no observation to verify. Reading the file and running the next command confirm the saved mode in this example.

On rejection, the target returns the normal observation. If you set both flags for an accepted change, the target saves it and exits with code `3` before returning an observation.

## Inspect the saved FAIL record in the browser

The example writes the stale-telemetry record to `dotnet-stale-telemetry.json` in the current directory. To inspect it, [run the web interface locally](web-interface.md#run-locally), switch to the **Inspect evidence** workflow and select **Verified execution**. Paste the file's contents into **Evidence JSON** and choose **Inspect evidence**.

OrbiRig recalculates the checks and accepts the saved `FAIL` because the results match. The failed telemetry check shows expected `SAFE` and actual `NOMINAL`.

## Input, persistence and limits

The stdin command must contain exactly `command_type` and `target_mode`, with values `SET_OPERATING_MODE` and either `NOMINAL` or `SAFE`. The existing state file must contain exactly `operating_mode` with one of those modes. Both inputs must be UTF-8 JSON. Malformed JSON, repeated decoded field names at any depth, missing or extra fields, incorrect types and unsupported values are rejected before writing. Object field order and whitespace do not matter. The parser rejects comments, trailing commas and a UTF-8 byte-order mark. It uses .NET's default JSON nesting limit; input and output have no application size limit.

`--state-file` takes a separate pathname argument. If a filename begins with `-`, give it as `./filename` or an absolute path; a following option is rejected as a missing pathname.

Use a separate regular state file with exactly one hard link for each independent target, and only one caller at a time. The target never initialises missing state or repairs malformed state. Final symbolic links, hard-linked aliases, directories, FIFOs and sockets are rejected before reading. Ancestor directories must be trusted; this is not protection against concurrent filesystem changes or a sandbox for untrusted programs.

An accepted transition is written to an exclusively created temporary file beside the state file. Its Unix creation permissions are `0600`, subject to the caller's umask. After closing that file and rechecking the destination's type and link count, the program replaces the destination using `File.Move(..., overwrite: true)`. This relies on same-filesystem rename behaviour on the supported local filesystems. It never truncates the original file during a write. Ordinary error handling attempts to remove the temporary file; abrupt termination can leave it behind. File operations or validation errors exit `2` with stderr diagnostics and no completed observation. A response error, such as a closed output pipe, can occur after replacement, so exit `2` alone does not establish rollback either.

Replacement does not preserve the original permissions, ownership, ACLs or extended attributes. The example provides no concurrent-writer coordination, crash recovery or power-loss durability, and performs no directory synchronisation. Windows support is not implemented. The target relies on POSIX file behaviour that its tests check on macOS and Linux: hard-link counts from `stat`, owner-only creation modes and same-directory replacement. Windows would need different mechanisms for each of these and its own CI job. Do not infer compatibility with Big Sur, network filesystems or other OS/architecture combinations from these tests. The two operating modes do not model operational spacecraft behaviour, and the observations are neither signed nor authenticated.

## Automated checks

To run the optional integration tests, install the `test` extra and opt in explicitly:

```bash
uv sync --locked --extra test
ORBIRIG_TEST_DOTNET=1 uv run --no-sync python -m pytest -q --no-cov tests/test_dotnet_stateful_target.py
```

The tests build the target once in a temporary directory and use a separate state file for each test. Verification tests check the collected modes, acknowledgements, check results and outcomes against expectations written in the tests. Other tests run the compiled DLL directly to check its exit code, output and changes to the state file.

The file tests cover input validation, links, special files, long names, permissions and cleanup after a write fails. The partial-write test uses the operating system's file-size limit. On Linux, the .NET runtime also uses that limit for executable memory. The test sets `DOTNET_EnableWriteXorExecute=0` for that child process so the limit affects the target's file write. A macOS-only test sets the original file's immutable flag and checks that it stays in place when replacement fails.

The test module skips by default. When you enable it, a missing SDK or a failed build makes the tests fail. The `.NET 10 interoperability / Ubuntu` CI job runs them with Python 3.12 and .NET 10. The [`CI passed` job](../CONTRIBUTING.md#github-ci) requires its success.
