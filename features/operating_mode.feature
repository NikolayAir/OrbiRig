Feature: Operating-mode command verification

  Scenario: Accept a transition from NOMINAL to SAFE
    Given the reference spacecraft is in NOMINAL mode
    When SAFE operating mode is requested
    Then the command is accepted
    And the post-command state is SAFE
    And the telemetry reports SAFE
    And the verification outcome is PASS

  Scenario: Reject a redundant NOMINAL request
    Given the reference spacecraft is in NOMINAL mode
    When NOMINAL operating mode is requested
    Then the command is rejected
    And the spacecraft remains in NOMINAL mode
    And the telemetry reports NOMINAL
    And the verification outcome is PASS

  Scenario: Accept a transition from SAFE to NOMINAL
    Given the reference spacecraft is in SAFE mode
    When NOMINAL operating mode is requested
    Then the command is accepted
    And the post-command state is NOMINAL
    And the telemetry reports NOMINAL
    And the verification outcome is PASS
