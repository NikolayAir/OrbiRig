"""Execute reference commands and collect their reported results."""

from orbirig.models import (
    CommandExecutionObservation,
    SetOperatingModeCommand,
)
from orbirig.reference_sut import ReferenceSpacecraft


def execute_reference_workflow(
    *,
    spacecraft: ReferenceSpacecraft,
    command: SetOperatingModeCommand,
) -> CommandExecutionObservation:
    """Execute 1 reference command and collect 1 observation."""

    pre_state = spacecraft.read_state()
    acknowledgement = spacecraft.handle_command(command)
    post_state = spacecraft.read_state()
    telemetry = spacecraft.read_telemetry()

    return CommandExecutionObservation(
        command=command,
        pre_state=pre_state,
        acknowledgement=acknowledgement,
        post_state=post_state,
        telemetry=telemetry,
    )
