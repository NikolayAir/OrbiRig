"""Tests for versioned JSON execution evidence."""

import json

from orbirig.evidence import serialize_execution_evidence
from orbirig.models import (
    CommandExecutionObservation,
    OperatingMode,
    SetOperatingModeCommand,
)
from orbirig.reference_sut import ReferenceSpacecraft
from orbirig.workflow import execute_reference_workflow


def _execute_safe_mode_workflow() -> CommandExecutionObservation:
    return execute_reference_workflow(
        spacecraft=ReferenceSpacecraft(),
        command=SetOperatingModeCommand(
            target_mode=OperatingMode.SAFE,
        ),
    )


def test_execution_evidence_uses_stable_versioned_json_contract():
    serialized = serialize_execution_evidence(
        _execute_safe_mode_workflow(),
    )

    assert json.loads(serialized) == {
        "evidence_format_version": 1,
        "command": {
            "command_type": "SET_OPERATING_MODE",
            "target_mode": "SAFE",
        },
        "pre_state": {
            "operating_mode": "NOMINAL",
        },
        "acknowledgement": {
            "accepted": True,
        },
        "post_state": {
            "operating_mode": "SAFE",
        },
        "telemetry": {
            "operating_mode": "SAFE",
        },
    }
    assert serialized == """{
  "evidence_format_version": 1,
  "command": {
    "command_type": "SET_OPERATING_MODE",
    "target_mode": "SAFE"
  },
  "pre_state": {
    "operating_mode": "NOMINAL"
  },
  "acknowledgement": {
    "accepted": true
  },
  "post_state": {
    "operating_mode": "SAFE"
  },
  "telemetry": {
    "operating_mode": "SAFE"
  }
}
"""


def test_execution_evidence_is_repeatable_for_fresh_workflows():
    first_evidence = serialize_execution_evidence(
        _execute_safe_mode_workflow(),
    )
    second_evidence = serialize_execution_evidence(
        _execute_safe_mode_workflow(),
    )

    assert first_evidence == second_evidence
