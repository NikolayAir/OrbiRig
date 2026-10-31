"""Models for scenarios, observations and verification results."""

import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import StrEnum


class OperatingMode(StrEnum):
    """Operating modes supported by the simplified spacecraft model."""

    NOMINAL = "NOMINAL"
    SAFE = "SAFE"


class CommandType(StrEnum):
    """Command types supported by the simplified spacecraft model."""

    SET_OPERATING_MODE = "SET_OPERATING_MODE"


class ScenarioId(StrEnum):
    """Stable identifiers for supported verification scenarios."""

    NOMINAL_TO_SAFE_MODE = "nominal_to_safe_mode"
    NOMINAL_TO_NOMINAL_REJECTION = "nominal_to_nominal_rejection"
    SAFE_TO_NOMINAL_MODE = "safe_to_nominal_mode"


class ExecutionOutcome(StrEnum):
    """Derived outcome of a verified command execution."""

    PASS = "PASS"
    FAIL = "FAIL"


class InvalidExecutionMetadataError(ValueError):
    """Raised when an execution ID or UTC execution timestamp is invalid."""


class ScenarioCommandMismatchError(ValueError):
    """Raised when an observation command does not match its scenario."""


# Recognise calendar dates, ISO week dates and times such as HHMMSS or HH:MM:SS.
# A single character separates the date and time. datetime checks whether the date is valid.
# Check the written UTC offset and fractional digits before parsing, so the
# accepted timestamp retains exactly the same UTC time.
# In YYYY-Www-HHMMSS, "-HH..." belongs to the time. A "-D" weekday
# suffix is recognised only before a separator other than an ASCII digit.
_UTC_TIMESTAMP = re.compile(
    r"(?P<local>(?:[0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{8}|"
    r"[0-9]{4}-W[0-9]{2}(?:-[1-7](?![0-9]))?|[0-9]{4}W[0-9]{2}[1-7]?)."
    r"(?P<clock>(?:[01][0-9]|2[0-3])"
    r"(?::[0-5][0-9](?::[0-5][0-9])?|[0-5][0-9](?:[0-5][0-9])?)?)"
    r"(?:[.,](?P<fraction>[0-9]+))?)"
    r"(?:Z|[+-]00(?::00(?::00)?|00(?:00)?)?(?:[.,]0+)?)",
    re.DOTALL,
)


def parse_utc_timestamp(value: str) -> datetime:
    """Parse supported UTC text without rounding or discarding time values."""

    match = _UTC_TIMESTAMP.fullmatch(value)
    if match is None:
        raise InvalidExecutionMetadataError(
            "timestamp must be ISO 8601 with a zero UTC offset and hours 00–23",
        )

    local = match["local"]
    fraction = match["fraction"]
    if fraction is not None:
        # Seconds are present in HHMMSS and HH:MM:SS.
        if len(match["clock"]) in (6, 8):
            if fraction[6:].strip("0"):
                raise InvalidExecutionMetadataError(
                    "fractional seconds may have more than 6 decimal places "
                    "only if the extra digits are zero",
                )
            local = value[:match.start("fraction")] + fraction[:6]
        elif fraction.strip("0"):
            raise InvalidExecutionMetadataError(
                "non-zero fractions of hours or minutes are unsupported",
            )
        else:
            local = value[:match.start("fraction") - 1]

    # The textual offset is already exactly zero, including any fractional part.
    # Normalising it avoids Python-version differences in offset parsing.
    try:
        return datetime.fromisoformat(local + "Z")
    except ValueError as exc:
        raise InvalidExecutionMetadataError(
            "timestamp must be a valid UTC date and time",
        ) from exc


def validate_execution_metadata(
    *,
    execution_id: str,
    executed_at: datetime,
) -> None:
    """Validate the execution ID and UTC execution timestamp."""

    if not execution_id.strip():
        raise InvalidExecutionMetadataError(
            "execution_id must not be empty or whitespace-only",
        )

    if any(0xD800 <= ord(character) <= 0xDFFF for character in execution_id):
        raise InvalidExecutionMetadataError(
            "execution_id must not contain surrogate code points",
        )

    if (
        executed_at.tzinfo is None
        or executed_at.utcoffset() != timedelta(0)
    ):
        raise InvalidExecutionMetadataError(
            "executed_at must be timezone-aware UTC",
        )


@dataclass(frozen=True, slots=True)
class SetOperatingModeCommand:
    """Command requesting a transition to the target operating mode."""

    target_mode: OperatingMode
    command_type: CommandType = field(
        default=CommandType.SET_OPERATING_MODE,
        init=False,
    )


SET_SAFE_MODE_COMMAND = SetOperatingModeCommand(
    target_mode=OperatingMode.SAFE,
)
SET_NOMINAL_MODE_COMMAND = SetOperatingModeCommand(
    target_mode=OperatingMode.NOMINAL,
)


def command_for_scenario(
    scenario_id: ScenarioId,
) -> SetOperatingModeCommand:
    """Return the command required by a supported verification scenario."""

    if scenario_id is ScenarioId.NOMINAL_TO_SAFE_MODE:
        return SET_SAFE_MODE_COMMAND

    # Both request NOMINAL, but their expected starting modes and acknowledgements differ.
    if scenario_id in (
        ScenarioId.NOMINAL_TO_NOMINAL_REJECTION,
        ScenarioId.SAFE_TO_NOMINAL_MODE,
    ):
        return SET_NOMINAL_MODE_COMMAND

    raise ValueError("unsupported verification scenario")


@dataclass(frozen=True, slots=True)
class SpacecraftState:
    """Observed spacecraft state before or after command handling."""

    operating_mode: OperatingMode


@dataclass(frozen=True, slots=True)
class Acknowledgement:
    """Observed command acknowledgement."""

    accepted: bool


@dataclass(frozen=True, slots=True)
class TelemetrySnapshot:
    """Observed operating-mode telemetry."""

    operating_mode: OperatingMode


@dataclass(frozen=True, slots=True)
class CommandExecutionObservation:
    """Observed values collected around one command execution."""

    command: SetOperatingModeCommand
    pre_state: SpacecraftState
    acknowledgement: Acknowledgement
    post_state: SpacecraftState
    telemetry: TelemetrySnapshot


class InvariantId(StrEnum):
    """Stable identifiers for scenario verification checks."""

    PRE_STATE_MATCHES_EXPECTED = "pre_state_matches_expected"
    ACKNOWLEDGEMENT_IS_ACCEPTED = "acknowledgement_is_accepted"
    ACKNOWLEDGEMENT_IS_REJECTED = "acknowledgement_is_rejected"
    POST_STATE_MATCHES_REQUESTED_MODE = (
        "post_state_matches_requested_mode"
    )
    POST_STATE_MATCHES_PRE_STATE = "post_state_matches_pre_state"
    TELEMETRY_MATCHES_POST_STATE = "telemetry_matches_post_state"


InvariantValue = bool | OperatingMode


@dataclass(frozen=True, slots=True)
class InvariantResult:
    """Expected and actual values from one invariant evaluation."""

    invariant_id: InvariantId
    passed: bool
    expected: InvariantValue
    actual: InvariantValue


@dataclass(frozen=True, slots=True)
class VerifiedExecutionRecord:
    """Immutable observations and results from one verified execution."""

    execution_id: str
    executed_at: datetime
    scenario_id: ScenarioId
    observation: CommandExecutionObservation
    invariant_results: tuple[InvariantResult, ...]
    outcome: ExecutionOutcome = field(init=False)

    def __post_init__(self) -> None:
        """Validate execution details and command compatibility, then derive the outcome."""

        validate_execution_metadata(
            execution_id=self.execution_id,
            executed_at=self.executed_at,
        )

        if (
            self.observation.command
            != command_for_scenario(self.scenario_id)
        ):
            raise ScenarioCommandMismatchError(
                "observation command does not match the selected scenario",
            )

        if not self.invariant_results:
            raise ValueError("invariant_results must not be empty")

        object.__setattr__(
            self,
            "outcome",
            (
                ExecutionOutcome.PASS
                if all(
                    result.passed
                    for result in self.invariant_results
                )
                else ExecutionOutcome.FAIL
            ),
        )


@dataclass(frozen=True, slots=True)
class ContinuityBoundaryResult:
    """Operating-mode continuity result for 2 adjacent executions."""

    previous_execution_id: str
    next_execution_id: str
    expected_operating_mode: OperatingMode
    observed_operating_mode: OperatingMode
    passed: bool = field(init=False)

    def __post_init__(self) -> None:
        """Derive the result from expected and observed modes."""

        object.__setattr__(
            self,
            "passed",
            self.observed_operating_mode is self.expected_operating_mode,
        )


@dataclass(frozen=True, slots=True)
class VerifiedExecutionSequence:
    """Ordered verified executions and their continuity results."""

    records: tuple[VerifiedExecutionRecord, ...]
    continuity_results: tuple[ContinuityBoundaryResult, ...]
    outcome: ExecutionOutcome = field(init=False)

    def __post_init__(self) -> None:
        """Validate sequence structure and derive its outcome."""

        records = tuple(self.records)
        continuity_results = tuple(self.continuity_results)

        if len(records) < 2:
            raise ValueError(
                "verified execution sequence requires at least 2 records",
            )

        if len(continuity_results) != len(records) - 1:
            raise ValueError(
                "verified execution sequence requires 1 continuity "
                "result per adjacent record pair",
            )

        object.__setattr__(self, "records", records)
        object.__setattr__(
            self,
            "continuity_results",
            continuity_results,
        )
        object.__setattr__(
            self,
            "outcome",
            (
                ExecutionOutcome.PASS
                if all(
                    record.outcome is ExecutionOutcome.PASS
                    for record in records
                )
                and all(
                    result.passed
                    for result in continuity_results
                )
                else ExecutionOutcome.FAIL
            ),
        )
