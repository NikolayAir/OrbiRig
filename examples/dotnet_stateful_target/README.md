# Independent .NET stateful target

This non-operational console program handles one operating-mode command per process. It uses C# and .NET 10 independently of OrbiRig's Python implementation. It contains no scenario expectations or verification outcomes.

The online [C#/.NET verification guide](https://github.com/NikolayAir/OrbiRig/blob/main/docs/dotnet-stateful-target.md) shows how to run the target through OrbiRig's Python API and read `PASS`, `FAIL` and a collection error after a saved change. You can use it when reading this README from a Python source archive.

Prerequisites: the .NET 10 SDK and macOS with `/usr/bin/stat`, or Linux with GNU `/usr/bin/stat`. No NuGet packages are required. From the repository root:

```bash
(
  cd examples/dotnet_stateful_target
  dotnet build StatefulTarget.csproj --configuration Release --disable-build-servers
)
```

The local `global.json` selects the latest installed stable .NET 10 feature band. Build from this directory so a newer SDK elsewhere does not override that choice.

Send one UTF-8 JSON command on standard input (`stdin`) and give the path to an existing state file with `--state-file`.

```bash
workdir=$(mktemp -d)
printf '%s\n' '{"operating_mode":"NOMINAL"}' > "$workdir/state.json"
printf '%s\n' '{"command_type":"SET_OPERATING_MODE","target_mode":"SAFE"}' | \
  dotnet examples/dotnet_stateful_target/bin/Release/net10.0/StatefulTarget.dll \
  --state-file "$workdir/state.json"
```

Exit `0` returns observation-evidence v1 JSON followed by LF. `--stale-telemetry` persists the accepted change but reports the previous mode as telemetry. A same-mode request is rejected without rewriting the state file. Invalid arguments, commands, JSON, state or file operations produce stderr diagnostics and exit `2`.

`--state-file` requires a separate pathname argument. For a filename beginning with `-`, use an explicit relative path such as `./--state.json`, or an absolute path, so it cannot be mistaken for another option.

`--fail-after-commit` saves an accepted transition, then exits `3` with a stderr diagnostic and empty stdout. OrbiRig raises `ObservationCollectionError` and creates no verification record. The next process sees the committed state. On rejection, the flag is ignored and the normal rejection observation is returned. Combining both fault flags saves an accepted transition without returning an observation.

Use separate regular files with exactly one hard link and one caller at a time. Missing state is never initialised or repaired. Symbolic links, hard-linked aliases, directories and special files are rejected. The system's `stat` utility reports the file type and hard-link count. The target requires this information before it can replace the state file.

Accepted changes use a private temporary file beside the state file and then a replacement rename. A failed temporary write leaves the original file in place. Ordinary error handling attempts to remove the temporary file. Use one caller at a time in a trusted directory on a local macOS or Linux filesystem. The caller must handle recovery after power loss. The new file has its own permissions, ownership, access control lists (ACLs) and extended attributes. When a response error occurs, check the file to see whether it already contains the new mode.

The optional real-target tests build once into pytest's temporary directory. Some verify the compiled DLL through OrbiRig's subprocess workflow; others run it directly to check exit status, output and state files. From a repository checkout (source archives have no `uv.lock`), install the Python `test` extra and opt in:

```bash
uv sync --locked --extra test
ORBIRIG_TEST_DOTNET=1 uv run --no-sync python -m pytest -q --no-cov tests/test_dotnet_stateful_target.py
```

Ordinary pytest runs skip these tests. If you enable them, the tests fail when the SDK is missing or `dotnet build` returns an error.
