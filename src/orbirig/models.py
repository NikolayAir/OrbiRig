"""Value models for command-to-telemetry consistency verification."""

from dataclasses import dataclass, field
from enum import StrEnum


class OperatingMode(StrEnum):
    """Operating modes used by the initial verification model."""

    NOMINAL = "NOMINAL"
    SAFE = "SAFE"


class CommandType(StrEnum):
    """Command types used by the initial verification model."""

    SET_OPERATING_MODE = "SET_OPERATING_MODE"


@dataclass(frozen=True, slots=True)
class SetOperatingModeCommand:
    """Command requesting a transition to the target operating mode."""

    target_mode: OperatingMode
    command_type: CommandType = field(
        default=CommandType.SET_OPERATING_MODE,
        init=False,
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
