"""Reference command workflow for observation collection."""

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
    """Execute one command and collect its resulting observations."""

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
