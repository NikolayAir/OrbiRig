"""Value models for command-to-telemetry consistency verification."""

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import StrEnum


class OperatingMode(StrEnum):
    """Operating modes used by the initial verification model."""

    NOMINAL = "NOMINAL"
    SAFE = "SAFE"


class CommandType(StrEnum):
    """Command types used by the initial verification model."""

    SET_OPERATING_MODE = "SET_OPERATING_MODE"


class ScenarioId(StrEnum):
    """Stable identifiers for supported verification scenarios."""

    NOMINAL_TO_SAFE_MODE = "nominal_to_safe_mode"


class ExecutionOutcome(StrEnum):
    """Derived outcome of a verified command execution."""

    PASS = "PASS"
    FAIL = "FAIL"


@dataclass(frozen=True, slots=True)
class SetOperatingModeCommand:
    """Command requesting a transition to the target operating mode."""

    target_mode: OperatingMode
    command_type: CommandType = field(
        default=CommandType.SET_OPERATING_MODE,
        init=False,
    )


SUPPORTED_SCENARIO_ID = ScenarioId.NOMINAL_TO_SAFE_MODE
SUPPORTED_SCENARIO_COMMAND = SetOperatingModeCommand(
    target_mode=OperatingMode.SAFE,
)


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
    """Stable identifiers for command-to-telemetry consistency checks."""

    PRE_STATE_MATCHES_EXPECTED = "pre_state_matches_expected"
    ACKNOWLEDGEMENT_IS_ACCEPTED = "acknowledgement_is_accepted"
    POST_STATE_MATCHES_REQUESTED_MODE = (
        "post_state_matches_requested_mode"
    )
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
    observation: CommandExecutionObservation
    invariant_results: tuple[InvariantResult, ...]
    scenario_id: ScenarioId = field(init=False)
    outcome: ExecutionOutcome = field(init=False)

    def __post_init__(self) -> None:
        """Validate inputs and derive scenario metadata and outcome."""

        if not self.execution_id.strip():
            raise ValueError(
                "execution_id must not be empty or whitespace-only",
            )

        if (
            self.executed_at.tzinfo is None
            or self.executed_at.utcoffset() != timedelta(0)
        ):
            raise ValueError("executed_at must be timezone-aware UTC")

        if self.observation.command != SUPPORTED_SCENARIO_COMMAND:
            raise ValueError(
                "observation command does not match the supported "
                "reference scenario",
            )

        if not self.invariant_results:
            raise ValueError("invariant_results must not be empty")

        object.__setattr__(
            self,
            "scenario_id",
            SUPPORTED_SCENARIO_ID,
        )
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
