using System.ComponentModel;
using System.Diagnostics;
using System.Globalization;
using System.Text;
using System.Text.Json;
using Microsoft.Win32.SafeHandles;

// This is an independent system under test. It reports what happened; only
// OrbiRig's Python verifier knows scenarios, invariant expectations and outcomes.
return StatefulTarget.Run(args);

static class StatefulTarget
{
    public static int Run(string[] args)
    {
        try
        {
            var (stateFile, staleTelemetry, failAfterCommit) = ReadArguments(args);
            using var input = new MemoryStream();
            Console.OpenStandardInput().CopyTo(input);
            using var command = ReadJson(input.ToArray(), "command");
            RequireFields(command.RootElement, "command_type", "target_mode");
            if (command.RootElement.GetProperty("command_type").ValueKind != JsonValueKind.String
                || command.RootElement.GetProperty("command_type").GetString() != "SET_OPERATING_MODE")
                throw new ArgumentException("command_type must be SET_OPERATING_MODE");
            var requested = ReadMode(command.RootElement.GetProperty("target_mode"));

            // Validate both documents and the file before any state write. Missing
            // state is an error, rather than permission to initialise or reset it.
            RequireSingleRegularFile(stateFile);
            using var state = ReadJson(File.ReadAllBytes(stateFile), "stored state");
            RequireFields(state.RootElement, "operating_mode");
            var before = ReadMode(state.RootElement.GetProperty("operating_mode"));
            // A request for the current mode is rejected and leaves the file untouched.
            var accepted = requested != before;
            var after = accepted ? requested : before;
            // The telemetry fault reports the previous mode while the change is still saved.
            var telemetry = staleTelemetry ? before : after;
            // Prepare the whole observation before saving, so that apart from the
            // simulated fault only delivery can fail after the change is committed.
            var response = JsonSerializer.SerializeToUtf8Bytes(new
            {
                evidence_format_version = 1,
                command = new { command_type = "SET_OPERATING_MODE", target_mode = requested },
                pre_state = new { operating_mode = before },
                acknowledgement = new { accepted },
                post_state = new { operating_mode = after },
                telemetry = new { operating_mode = telemetry },
            });

            if (accepted)
                SaveMode(stateFile, after);

            if (accepted && failAfterCommit)
            {
                Console.Error.WriteLine("dotnet stateful target: simulated response failure after state commit");
                return 3;
            }

            // State is saved before the observation is written. If writing to stdout
            // fails, the change stays saved: OrbiRig sees a collection error, which
            // is not evidence of rollback.
            using var stdout = OpenOutput();
            stdout.Write(response);
            stdout.WriteByte((byte)'\n');
            stdout.Flush();
            return 0;
        }
        // Expected input, file and process errors exit 2 with a diagnostic. Other
        // exceptions are programming errors and stay unhandled, so the runtime
        // ends with a different status instead of imitating a handled error.
        catch (Exception error) when (error is ArgumentException or JsonException
            or IOException or UnauthorizedAccessException or InvalidOperationException
            or Win32Exception or NotSupportedException or FormatException or OverflowException)
        {
            Console.Error.WriteLine($"dotnet stateful target: {error.Message}");
            return 2;
        }
    }

    static Stream OpenOutput()
    {
        // On Unix the console stream ignores a closed pipe (EPIPE), so an observation
        // that nobody receives would still end with status 0. A FileStream on
        // descriptor 1 reports that error instead. A seekable output (a file) keeps
        // the console stream: on macOS a FileStream writes at its own offset and
        // replaces earlier content when the output is appended to with >>. A file has
        // no reader that can disappear, so only pipes and terminals need the new stream.
        var stream = new FileStream(new SafeFileHandle(1, ownsHandle: false), FileAccess.Write, bufferSize: 0);
        if (!stream.CanSeek)
            return stream;
        stream.Dispose();
        return Console.OpenStandardOutput();
    }

    static (string StateFile, bool StaleTelemetry, bool FailAfterCommit) ReadArguments(string[] args)
    {
        string? stateFile = null;
        var staleTelemetry = false;
        var failAfterCommit = false;
        for (var index = 0; index < args.Length; index++)
        {
            switch (args[index])
            {
                case "--state-file" when stateFile is null:
                    // A following option means the pathname is missing. A file
                    // whose name starts with '-' can be given as ./name instead.
                    if (index + 1 == args.Length || args[index + 1].StartsWith('-'))
                        throw new ArgumentException("--state-file requires a pathname; prefix a name beginning with '-' with ./");
                    stateFile = args[++index];
                    break;
                case "--stale-telemetry" when !staleTelemetry:
                    staleTelemetry = true;
                    break;
                case "--fail-after-commit" when !failAfterCommit:
                    failAfterCommit = true;
                    break;
                default:
                    throw new ArgumentException($"unknown, repeated or incomplete argument: {args[index]}");
            }
        }
        if (string.IsNullOrWhiteSpace(stateFile))
            throw new ArgumentException("--state-file requires an existing JSON state file");
        return (Path.GetFullPath(stateFile), staleTelemetry, failAfterCommit);
    }

    static JsonDocument ReadJson(byte[] data, string source)
    {
        try
        {
            // Reject invalid UTF-8 instead of silently replacing bytes. .NET 10
            // rejects duplicate names at every depth, comparing them after
            // decoding escapes, so "x" and "\u0078" count as the same name.
            var text = new UTF8Encoding(false, true).GetString(data);
            return JsonDocument.Parse(text, new JsonDocumentOptions { AllowDuplicateProperties = false });
        }
        catch (Exception error) when (error is JsonException or DecoderFallbackException)
        {
            throw new ArgumentException($"{source} must be UTF-8 JSON without repeated field names", error);
        }
    }

    static void RequireFields(JsonElement document, params string[] names)
    {
        if (document.ValueKind != JsonValueKind.Object
            || document.EnumerateObject().Count() != names.Length
            || names.Any(name => !document.TryGetProperty(name, out _)))
            throw new ArgumentException($"JSON object must contain only {string.Join(", ", names)}");
    }

    static string ReadMode(JsonElement value)
    {
        if (value.ValueKind == JsonValueKind.String && value.GetString() is "NOMINAL" or "SAFE")
            return value.GetString()!;
        throw new ArgumentException("operating mode must be NOMINAL or SAFE");
    }

    static void RequireSingleRegularFile(string stateFile)
    {
        // .NET's public file APIs do not expose Unix hard-link counts or all
        // special file types. Use the OS stat utility rather than native structs
        // whose layouts differ by OS and architecture. Never invoke a shell.
        var start = new ProcessStartInfo("/usr/bin/stat")
        {
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };
        if (OperatingSystem.IsMacOS())
        {
            start.ArgumentList.Add("-f");
            start.ArgumentList.Add("%p:%l"); // Octal mode, decimal hard-link count.
        }
        else if (OperatingSystem.IsLinux())
            start.ArgumentList.Add("--format=%f:%h"); // GNU stat: hexadecimal mode.
        else
            throw new PlatformNotSupportedException("this example requires macOS stat or Linux GNU stat");
        // The absolute pathname cannot be interpreted as a command-line option.
        // Neither stat invocation follows the final symbolic link.
        start.ArgumentList.Add(stateFile);
        using var process = Process.Start(start) ?? throw new IOException("cannot start stat");
        var output = process.StandardOutput.ReadToEndAsync();
        var diagnostic = process.StandardError.ReadToEndAsync();
        process.WaitForExit();
        if (process.ExitCode != 0)
            throw new IOException($"cannot inspect state file: {diagnostic.GetAwaiter().GetResult().Trim()}");
        var fields = output.GetAwaiter().GetResult().Trim().Split(':');
        if (fields.Length != 2)
            throw new IOException("unexpected stat output");
        var mode = Convert.ToUInt32(fields[0], OperatingSystem.IsMacOS() ? 8 : 16);
        // The file-type bits (S_IFMT, 0xF000) must denote a regular file (S_IFREG).
        if ((mode & 0xF000) != 0x8000)
            throw new ArgumentException("state file must be a regular file, not a link, directory or special file");
        if (!ulong.TryParse(fields[1], NumberStyles.None, CultureInfo.InvariantCulture, out var links) || links != 1)
            throw new ArgumentException("state file must have exactly 1 hard link");
    }

    static void SaveMode(string stateFile, string mode)
    {
        if (OperatingSystem.IsWindows())
            throw new PlatformNotSupportedException("state replacement requires macOS or Linux");
        // A short, unrelated filename also works when the state name is already
        // near the filesystem limit. CreateNew never truncates an existing file.
        var temporary = Path.Combine(Path.GetDirectoryName(stateFile)!, $".orbirig-state-{Guid.NewGuid():N}");
        var created = false;
        try
        {
            using (var stream = new FileStream(temporary, new FileStreamOptions
            {
                Mode = FileMode.CreateNew,
                Access = FileAccess.Write,
                UnixCreateMode = UnixFileMode.UserRead | UnixFileMode.UserWrite,
            }))
            {
                created = true;
                var data = JsonSerializer.SerializeToUtf8Bytes(new { operating_mode = mode });
                stream.Write(data);
                stream.WriteByte((byte)'\n');
            }
            // Same-directory rename replaces the original without truncating it.
            // Recheck before replacement, but do not claim protection from races.
            RequireSingleRegularFile(stateFile);
            File.Move(temporary, stateFile, overwrite: true);
        }
        finally
        {
            // After a successful move the temporary name no longer exists and
            // Delete does nothing; after a failure it removes the leftover file.
            if (created)
                File.Delete(temporary);
        }
    }
}
