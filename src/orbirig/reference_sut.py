"""Simplified deterministic reference SUT for verification tests."""

from orbirig.models import (
    Acknowledgement,
    OperatingMode,
    SetOperatingModeCommand,
    SpacecraftState,
    TelemetrySnapshot,
)


class ReferenceSpacecraft:
    """Deterministic test double for the initial command scenario."""

    def __init__(self) -> None:
        self._operating_mode = OperatingMode.NOMINAL

    def read_state(self) -> SpacecraftState:
        """Return an immutable snapshot of the current state."""

        return SpacecraftState(operating_mode=self._operating_mode)

    def handle_command(
        self,
        command: SetOperatingModeCommand,
    ) -> Acknowledgement:
        """Accept and apply an operating-mode command."""

        acknowledgement = Acknowledgement(accepted=True)
        self._operating_mode = command.target_mode
        return acknowledgement

    def read_telemetry(self) -> TelemetrySnapshot:
        """Return telemetry derived from the current state."""

        return TelemetrySnapshot(operating_mode=self._operating_mode)
