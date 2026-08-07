"""Simplified deterministic reference SUT for verification tests."""

from orbirig.models import (
    Acknowledgement,
    OperatingMode,
    SetOperatingModeCommand,
    SpacecraftState,
    TelemetrySnapshot,
)


class ReferenceSpacecraft:
    """Deterministic test double for the supported command scenarios."""

    def __init__(self) -> None:
        self._operating_mode = OperatingMode.NOMINAL

    def read_state(self) -> SpacecraftState:
        """Return an immutable snapshot of the current state."""

        return SpacecraftState(operating_mode=self._operating_mode)

    def handle_command(
        self,
        command: SetOperatingModeCommand,
    ) -> Acknowledgement:
        """Handle an operating-mode command deterministically."""

        # Keep rejection limited to the explicit NOMINAL-to-NOMINAL scenario.
        if (
            self._operating_mode is OperatingMode.NOMINAL
            and command.target_mode is OperatingMode.NOMINAL
        ):
            return Acknowledgement(accepted=False)

        self._operating_mode = command.target_mode
        return Acknowledgement(accepted=True)

    def read_telemetry(self) -> TelemetrySnapshot:
        """Return telemetry derived from the current state."""

        return TelemetrySnapshot(operating_mode=self._operating_mode)
