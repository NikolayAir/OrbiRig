"""Command-line verification of recorded observation evidence."""

import argparse
import sys
import traceback
from pathlib import Path

from orbirig.evidence import (
    deserialize_execution_evidence,
    serialize_verified_execution_evidence,
)
from orbirig.models import (
    ExecutionOutcome,
    InvalidExecutionMetadataError,
    ScenarioCommandMismatchError,
    ScenarioId,
    parse_utc_timestamp,
    validate_execution_metadata,
)
from orbirig.verification import build_verified_execution_record


def _write_stdout(payload: bytes) -> None:
    # Bypass text encoding and newline translation, including on Windows.
    if sys.stdout.buffer.write(payload) != len(payload):
        raise OSError("incomplete stdout write")
    sys.stdout.buffer.flush()


class _ArgumentParser(argparse.ArgumentParser):
    def print_help(self, file=None) -> None:
        """Propagate help-output errors instead of silently reporting success."""
        if file is None or file is sys.stdout:
            _write_stdout(self.format_help().encode("utf-8"))
        else:
            super().print_help(file)


def _parser() -> argparse.ArgumentParser:
    parser = _ArgumentParser(
        prog="orbirig",
        description="Check a recorded command result against a scenario you select.",
        allow_abbrev=False,
    )
    commands = parser.add_subparsers(dest="command", required=True)
    verify = commands.add_parser(
        "verify-observation",
        help="verify 1 local observation JSON file",
        allow_abbrev=False,
    )
    verify.add_argument(
        "file", metavar="FILE", type=Path,
        help="path to a UTF-8 observation JSON file (evidence format v1)",
    )
    verify.add_argument(
        "--scenario", required=True,
        choices=tuple(scenario.value for scenario in ScenarioId),
        help="scenario defining the expected command behaviour",
    )
    verify.add_argument(
        "--execution-id", required=True, metavar="ID",
        help="label for this command execution, saved with the result",
    )
    verify.add_argument(
        "--executed-at", required=True, metavar="UTC_TIMESTAMP",
        help="recorded execution time: YYYY-MM-DDTHH:MM:SS[.fraction](Z|+00:00)",
    )
    return parser


def _error(code: int, message: str) -> int:
    print(f"orbirig: error: {message}", file=sys.stderr)
    return code


def _output_error(error: OSError) -> int:
    # Do not retry a failed buffered write during interpreter shutdown.
    try:
        sys.stdout.close()
    except OSError:
        pass
    return _error(3, f"cannot write stdout: {error}")


def _verify_observation(args: argparse.Namespace) -> int:
    try:
        executed_at = parse_utc_timestamp(args.executed_at)
    except InvalidExecutionMetadataError as exc:
        return _error(2, f"invalid --executed-at: {exc}")

    try:
        validate_execution_metadata(
            execution_id=args.execution_id,
            executed_at=executed_at,
        )
    except InvalidExecutionMetadataError as exc:
        return _error(2, f"invalid execution metadata: {exc}")

    try:
        raw = args.file.read_bytes()
    except OSError as exc:
        return _error(3, f"cannot read {str(args.file)!r}: {exc}")

    try:
        serialized_observation = raw.decode("utf-8")
    except UnicodeDecodeError:
        return _error(2, "observation evidence must be valid UTF-8")

    try:
        observation = deserialize_execution_evidence(serialized_observation)
    except ValueError as exc:
        return _error(2, f"invalid observation evidence: {exc}")

    try:
        record = build_verified_execution_record(
            execution_id=args.execution_id,
            executed_at=executed_at,
            scenario_id=ScenarioId(args.scenario),
            observation=observation,
        )
    except (InvalidExecutionMetadataError, ScenarioCommandMismatchError) as exc:
        return _error(2, str(exc))

    payload = serialize_verified_execution_evidence(record).encode("utf-8")
    try:
        _write_stdout(payload)
    except OSError as exc:
        return _output_error(exc)

    return 0 if record.outcome is ExecutionOutcome.PASS else 1


def main(argv: list[str] | None = None) -> int:
    """Run the installed CLI, preserving verification and error outcomes."""
    try:
        try:
            args = _parser().parse_args(argv)
        except OSError as exc:
            return _output_error(exc)
        return _verify_observation(args)
    except Exception:
        _error(4, "unexpected internal error")
        traceback.print_exc(file=sys.stderr)
        return 4
