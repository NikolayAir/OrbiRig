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
    NOMINAL_TO_NOMINAL_REJECTION = "nominal_to_nominal_rejection"
    SAFE_TO_NOMINAL_MODE = "safe_to_nominal_mode"


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
    """Stable identifiers for command-to-telemetry consistency checks."""

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

        if (
            self.observation.command
            != command_for_scenario(self.scenario_id)
        ):
            raise ValueError(
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
    """Operating-mode continuity result for two adjacent executions."""

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
                "verified execution sequence requires at least two records",
            )

        if len(continuity_results) != len(records) - 1:
            raise ValueError(
                "verified execution sequence requires one continuity "
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
