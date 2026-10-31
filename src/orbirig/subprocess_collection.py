"""Run a separate program to collect 1 command observation."""

import json
import subprocess
from collections.abc import Sequence

from orbirig.evidence import deserialize_execution_evidence
from orbirig.models import (
    CommandExecutionObservation,
    SetOperatingModeCommand,
)


class ObservationCollectionError(RuntimeError):
    """Raised when no valid subprocess observation was collected."""


def collect_subprocess_observation(
    *,
    argv: Sequence[str],
    command: SetOperatingModeCommand,
    timeout: float,
) -> CommandExecutionObservation:
    """Run a target program and validate its returned observation JSON."""

    command_document = (
        json.dumps(
            {
                "command_type": command.command_type.value,
                "target_mode": command.target_mode.value,
            },
            separators=(",", ":"),
        ).encode("utf-8")
        + b"\n"
    )

    try:
        completed = subprocess.run(
            argv,
            input=command_document,
            capture_output=True,
            timeout=timeout,
            check=False,
            shell=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise ObservationCollectionError(
            "observation subprocess timed out",
        ) from exc
    except OSError as exc:
        raise ObservationCollectionError(
            "failed to launch observation subprocess",
        ) from exc

    # A program can print valid-looking JSON and still fail afterwards.
    # Require a successful exit before treating stdout as an observation.
    if completed.returncode != 0:
        raise ObservationCollectionError(
            f"observation subprocess exited with status {completed.returncode}",
        )

    try:
        serialized_observation = completed.stdout.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise ObservationCollectionError(
            "observation subprocess stdout is not valid UTF-8",
        ) from exc

    try:
        observation = deserialize_execution_evidence(
            serialized_observation,
        )
    except ValueError as exc:
        raise ObservationCollectionError(
            "subprocess returned invalid observation evidence",
        ) from exc

    # A matching command ties this reply to the request; scenario verification happens later.
    if observation.command != command:
        raise ObservationCollectionError(
            "subprocess observation command does not match submitted command",
        )

    return observation
