# Independent .NET stateful target

This non-operational console program handles one operating-mode command per process. It uses C# and .NET 10 independently of OrbiRig's Python implementation. It contains no scenario expectations or verification outcomes.

Prerequisites: the .NET 10 SDK and macOS with `/usr/bin/stat`, or Linux with GNU `/usr/bin/stat`. No NuGet packages are required. From the repository root:

```bash
dotnet build examples/dotnet_stateful_target/StatefulTarget.csproj --configuration Release --disable-build-servers
```

Supply one UTF-8 JSON command on stdin and an existing state file explicitly:

```bash
workdir=$(mktemp -d)
printf '%s\n' '{"operating_mode":"NOMINAL"}' > "$workdir/state.json"
printf '%s\n' '{"command_type":"SET_OPERATING_MODE","target_mode":"SAFE"}' | \
  dotnet examples/dotnet_stateful_target/bin/Release/net10.0/StatefulTarget.dll \
  --state-file "$workdir/state.json"
```

Exit `0` returns observation-evidence v1 JSON followed by LF. `--stale-telemetry` persists the accepted change but reports the previous mode as telemetry. A same-mode request is rejected without rewriting the state file. Invalid arguments, commands, JSON, state or file operations produce stderr diagnostics and exit `2`.

`--fail-after-commit` saves an accepted transition, then exits `3` with a stderr diagnostic and empty stdout. OrbiRig raises `ObservationCollectionError` and creates no verification record. The next process sees the committed state. On rejection, the flag is ignored and the normal rejection observation is returned. Combining both fault flags saves an accepted transition without returning an observation.

Use separate regular files with exactly one hard link and one caller at a time. Missing state is never initialised or repaired. Symbolic links, hard-linked aliases, directories and special files are rejected. The OS `stat` utility supplies file type and hard-link count unavailable through the public .NET file APIs; an inspection failure stops processing before a write.

Accepted changes use a private temporary file beside the state file and then a replacement rename. The original is never opened for writing; a failed temporary write preserves its bytes. Temporary files are removed on ordinary errors. This is not concurrent-writer coordination, protection from filesystem races or power-loss durability. Replacement does not preserve the original permissions, ownership, ACLs or extended attributes. Network filesystems and Windows are outside this example's scope. A failure after replacement does not establish rollback.

The optional real-target tests build once into pytest's temporary directory and run the compiled DLL through OrbiRig's subprocess APIs:

```bash
ORBIRIG_TEST_DOTNET=1 uv run --no-sync python -m pytest -q --no-cov tests/test_dotnet_stateful_target.py
```

Ordinary pytest runs skip these tests without checking for .NET. Explicitly enabling them makes missing SDKs and build failures test failures.
