"""Tests for the deterministic reference SUT."""

from orbirig.models import OperatingMode, SetOperatingModeCommand
from orbirig.reference_sut import ReferenceSpacecraft


def test_reference_spacecraft_starts_in_nominal_mode():
    spacecraft = ReferenceSpacecraft()

    state = spacecraft.read_state()
    telemetry = spacecraft.read_telemetry()

    assert state.operating_mode is OperatingMode.NOMINAL
    assert telemetry.operating_mode is OperatingMode.NOMINAL


def test_reference_spacecraft_applies_safe_mode_command():
    spacecraft = ReferenceSpacecraft()
    command = SetOperatingModeCommand(
        target_mode=OperatingMode.SAFE,
    )

    acknowledgement = spacecraft.handle_command(command)

    assert acknowledgement.accepted is True
    assert spacecraft.read_state().operating_mode is OperatingMode.SAFE
    assert (
        spacecraft.read_telemetry().operating_mode
        is OperatingMode.SAFE
    )


def test_state_snapshot_does_not_change_after_command():
    spacecraft = ReferenceSpacecraft()
    pre_state = spacecraft.read_state()

    spacecraft.handle_command(
        SetOperatingModeCommand(target_mode=OperatingMode.SAFE),
    )
    post_state = spacecraft.read_state()

    assert pre_state.operating_mode is OperatingMode.NOMINAL
    assert post_state.operating_mode is OperatingMode.SAFE
