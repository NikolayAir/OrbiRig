# Verify an independent C#/.NET program

[Python API](python.md#collect-from-a-separate-program) · [Python stateful target](stateful-target.md) · [Evidence formats](evidence-formats.md)

The [.NET target](../examples/dotnet_stateful_target/) is a non-operational console program that keeps its operating mode in a file between launches. It implements the command behaviour in C#, using .NET 10 and `System.Text.Json`. It neither calls OrbiRig's Python code nor contains scenario expectations or verification rules.

OrbiRig sends one command to the compiled program through its existing subprocess API. The program validates the input and stored state, handles the command and returns [observation-evidence v1](evidence-formats.md#observation-evidence). Python independently checks that observation against the scenario selected by the caller. This demonstrates cross-language verification without a second verification implementation or a new evidence format. The example is optional: Python installation, CLI, HTTP API, browser interface and deployment do not require .NET.

The subprocess API already supports external programs. This example exercises that boundary with a separately compiled implementation, real state between process launches and deliberately incorrect reports. The same Python expectations detect a C# telemetry defect, while a delivery failure remains a collection error. It adds an example target, with the existing scenarios and verification rules unchanged.

## Prerequisites and build

Use a repository checkout, [uv](https://docs.astral.sh/uv/getting-started/installation/) and Python 3.12–3.15. From the repository root, install the Python core and CLI:

```bash
uv sync --locked
```

No Python extras are needed for the runnable example below. See the [Python environment guide](../CONTRIBUTING.md#python-environment) to select another supported interpreter or restore a full development environment. Each sync installs only the requested extras.

Install the **.NET 10 SDK**, which includes the runtime, following Microsoft's instructions for [macOS](https://learn.microsoft.com/en-us/dotnet/core/install/macos) or [Linux](https://learn.microsoft.com/en-us/dotnet/core/install/linux). Use an OS version and architecture supported by that SDK; Python's platform support does not establish .NET compatibility.

The target also requires `/usr/bin/stat`: the standard macOS utility, or GNU Coreutils `stat` on Linux. This narrow OS dependency provides file type and hard-link count unavailable through the public .NET file APIs. It avoids a NuGet dependency or native `stat` structure layouts that vary by OS and architecture. The program invokes the absolute executable with separate arguments and no shell. Unsupported platforms, a missing utility or failed inspection are errors before state is written.

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

After building, run the following from the repository root. Each call starts a new .NET process; only the temporary state file is shared. All scenario choices and execution metadata are supplied by Python before collection.

```bash
uv run --no-sync python - <<'PY'
import json
from datetime import datetime, timezone
from pathlib import Path
from tempfile import TemporaryDirectory

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

The round trip has two passing records and a passing continuity check in the supplied order. A rejected request for the active mode also passes its explicitly selected rejection scenario. Rejection leaves the state file's original bytes unchanged.

`--stale-telemetry` saves an accepted change but reports the previous mode as telemetry. OrbiRig produces a valid `FAIL` record: three checks pass and only `telemetry_matches_post_state` fails. The next command reads the committed `SAFE` state. Existing [evidence serialisers and readers](python.md#reopen-saved-verified-evidence) can save and reopen the failed record without changing the evidence contract.

`--fail-after-commit` saves an accepted change, then exits with code `3`, an explanatory stderr diagnostic and empty stdout. OrbiRig raises `ObservationCollectionError` and creates no verification record. The saved file and subsequent process independently confirm the committed state in this controlled example. An arbitrary collection error does not establish the state of an external system or imply rollback. The collector captures stderr rather than forwarding it; its exception reports the exit status.

On rejection, `--fail-after-commit` is ignored. Combining both fault flags saves an accepted transition and exits `3` without returning an observation. There are only these two controlled faults.

## Input, persistence and limits

The stdin command must contain exactly `command_type` and `target_mode`, with values `SET_OPERATING_MODE` and either `NOMINAL` or `SAFE`. The existing state file must contain exactly `operating_mode` with one of those modes. Both inputs must be UTF-8 JSON. Malformed JSON, repeated decoded field names at any depth, missing or extra fields, incorrect types and unsupported values are rejected before writing. Object field order and whitespace do not matter. The parser rejects comments, trailing commas and a UTF-8 byte-order mark. It uses .NET's default JSON nesting limit; input and output have no application size limit.

`--state-file` takes a separate pathname argument. If a filename begins with `-`, give it as `./filename` or an absolute path; a following option is rejected as a missing pathname.

Use a separate regular state file with exactly one hard link for each independent target, and only one caller at a time. The target never initialises missing state or repairs malformed state. Final symbolic links, hard-linked aliases, directories, FIFOs and sockets are rejected before reading. Ancestor directories must be trusted; this is not protection against concurrent filesystem changes or a sandbox for untrusted programs.

An accepted transition is written to an exclusively created temporary file beside the state file. Its Unix creation permissions are `0600`, subject to the caller's umask. After closing that file and rechecking the destination's type and link count, the program replaces the destination using `File.Move(..., overwrite: true)`. This relies on same-filesystem rename behaviour on the supported local filesystems. It never truncates the original file during a write. Ordinary error handling attempts to remove the temporary file; abrupt termination can leave it behind. File operations or validation errors exit `2` with stderr diagnostics and no completed observation. A response error can occur after replacement, so exit `2` alone does not establish rollback either.

Replacement does not preserve the original permissions, ownership, ACLs or extended attributes. The example provides no concurrent-writer coordination, crash recovery or power-loss durability, and performs no directory synchronisation. Windows support is not implemented. Do not infer compatibility with Big Sur, network filesystems or other OS/architecture combinations from these tests. The two operating modes do not model operational spacecraft behaviour, and the observations are neither signed nor authenticated.

## Automated checks

To run the optional integration tests, install the `test` extra and opt in explicitly:

```bash
uv sync --locked --extra test
ORBIRIG_TEST_DOTNET=1 uv run --no-sync python -m pytest -q --no-cov tests/test_dotnet_stateful_target.py
```

The fixture builds the real target once into pytest's temporary directory. Every execution uses isolated state and the compiled DLL, with independent expected modes, acknowledgements, checks and outcomes. Coverage includes both transitions, sequence continuity, rejection, stale telemetry, response failure after commit, validation errors, linked and special files, long filenames, directory permissions, partial-write cleanup and repeatability. The partial-write test uses the OS file-size resource limit. On Linux the .NET runtime sizes its executable memory from that limit, so the test disables write-xor-execute for that child process only; the failure then occurs in the target's own temporary-file write. A macOS-only test uses immutable file flags to exercise failed replacement after the temporary write; that case is skipped on Linux. Neither test adds a fault mode to the target. An explicitly enabled run fails if the SDK is absent or the build fails. Ordinary Python test runs skip this module without probing .NET.

The dedicated `.NET 10 interoperability / Ubuntu` CI job enables these tests on Python 3.12 and .NET 10, independently of the Python compatibility matrix. The final `CI passed` job also requires its success. This configuration does not establish a passing CI run until the workflow has actually completed on the candidate revision.
