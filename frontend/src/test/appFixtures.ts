// Hand-written expected values stay independent of application examples and API responses.

export const observation = {
  command: {
    command_type: "SET_OPERATING_MODE",
    target_mode: "SAFE",
  },
  pre_state: {
    operating_mode: "NOMINAL",
  },
  acknowledgement: {
    accepted: true,
  },
  post_state: {
    operating_mode: "SAFE",
  },
  telemetry: {
    operating_mode: "SAFE",
  },
};

export const observationEvidenceDocument = JSON.stringify(
  {
    evidence_format_version: 1,
    ...observation,
  },
  null,
  2,
);

export const expectedNominalToSafeObservationExample = {
  evidence_format_version: 1,
  command: {
    command_type: "SET_OPERATING_MODE",
    target_mode: "SAFE",
  },
  pre_state: {
    operating_mode: "NOMINAL",
  },
  acknowledgement: {
    accepted: true,
  },
  post_state: {
    operating_mode: "SAFE",
  },
  telemetry: {
    operating_mode: "SAFE",
  },
};

export const expectedNominalToNominalRejectionObservationExample = {
  evidence_format_version: 1,
  command: {
    command_type: "SET_OPERATING_MODE",
    target_mode: "NOMINAL",
  },
  pre_state: {
    operating_mode: "NOMINAL",
  },
  acknowledgement: {
    accepted: false,
  },
  post_state: {
    operating_mode: "NOMINAL",
  },
  telemetry: {
    operating_mode: "NOMINAL",
  },
};

export const expectedSafeToNominalObservationExample = {
  evidence_format_version: 1,
  command: {
    command_type: "SET_OPERATING_MODE",
    target_mode: "NOMINAL",
  },
  pre_state: {
    operating_mode: "SAFE",
  },
  acknowledgement: {
    accepted: true,
  },
  post_state: {
    operating_mode: "NOMINAL",
  },
  telemetry: {
    operating_mode: "NOMINAL",
  },
};

export const expectedVerifiedExecutionInspectionExample = {
  schema_version: 1,
  execution: {
    execution_id: "example-execution-001",
    scenario_id: "nominal_to_safe_mode",
    executed_at: "2026-08-26T08:30:00Z",
  },
  observation: {
    command: {
      command_type: "SET_OPERATING_MODE",
      target_mode: "SAFE",
    },
    pre_state: {
      operating_mode: "NOMINAL",
    },
    acknowledgement: {
      accepted: true,
    },
    post_state: {
      operating_mode: "SAFE",
    },
    telemetry: {
      operating_mode: "SAFE",
    },
  },
  invariant_results: [
    {
      invariant_id: "pre_state_matches_expected",
      passed: true,
      expected: "NOMINAL",
      actual: "NOMINAL",
    },
    {
      invariant_id: "acknowledgement_is_accepted",
      passed: true,
      expected: true,
      actual: true,
    },
    {
      invariant_id: "post_state_matches_requested_mode",
      passed: true,
      expected: "SAFE",
      actual: "SAFE",
    },
    {
      invariant_id: "telemetry_matches_post_state",
      passed: true,
      expected: "SAFE",
      actual: "SAFE",
    },
  ],
  outcome: "PASS",
};

export const expectedVerifiedExecutionSequenceInspectionExample = {
  schema_version: 1,
  records: [
    {
      schema_version: 1,
      execution: {
        execution_id: "example-sequence-001",
        scenario_id: "nominal_to_safe_mode",
        executed_at: "2026-08-26T08:30:00Z",
      },
      observation: {
        command: {
          command_type: "SET_OPERATING_MODE",
          target_mode: "SAFE",
        },
        pre_state: {
          operating_mode: "NOMINAL",
        },
        acknowledgement: {
          accepted: true,
        },
        post_state: {
          operating_mode: "SAFE",
        },
        telemetry: {
          operating_mode: "SAFE",
        },
      },
      invariant_results: [
        {
          invariant_id: "pre_state_matches_expected",
          passed: true,
          expected: "NOMINAL",
          actual: "NOMINAL",
        },
        {
          invariant_id: "acknowledgement_is_accepted",
          passed: true,
          expected: true,
          actual: true,
        },
        {
          invariant_id: "post_state_matches_requested_mode",
          passed: true,
          expected: "SAFE",
          actual: "SAFE",
        },
        {
          invariant_id: "telemetry_matches_post_state",
          passed: true,
          expected: "SAFE",
          actual: "SAFE",
        },
      ],
      outcome: "PASS",
    },
    {
      schema_version: 1,
      execution: {
        execution_id: "example-sequence-002",
        scenario_id: "safe_to_nominal_mode",
        executed_at: "2026-08-26T08:35:00Z",
      },
      observation: {
        command: {
          command_type: "SET_OPERATING_MODE",
          target_mode: "NOMINAL",
        },
        pre_state: {
          operating_mode: "SAFE",
        },
        acknowledgement: {
          accepted: true,
        },
        post_state: {
          operating_mode: "NOMINAL",
        },
        telemetry: {
          operating_mode: "NOMINAL",
        },
      },
      invariant_results: [
        {
          invariant_id: "pre_state_matches_expected",
          passed: true,
          expected: "SAFE",
          actual: "SAFE",
        },
        {
          invariant_id: "acknowledgement_is_accepted",
          passed: true,
          expected: true,
          actual: true,
        },
        {
          invariant_id: "post_state_matches_requested_mode",
          passed: true,
          expected: "NOMINAL",
          actual: "NOMINAL",
        },
        {
          invariant_id: "telemetry_matches_post_state",
          passed: true,
          expected: "NOMINAL",
          actual: "NOMINAL",
        },
      ],
      outcome: "PASS",
    },
  ],
  continuity_results: [
    {
      previous_execution_id: "example-sequence-001",
      next_execution_id: "example-sequence-002",
      expected_operating_mode: "SAFE",
      observed_operating_mode: "SAFE",
      passed: true,
    },
  ],
  outcome: "PASS",
};

// Use complete responses: a shortened mock can hide missing verification checks.
export const verifiedExecution = {
  execution: {
    execution_id: "exec-web-001",
    executed_at: "2026-08-17T10:15:30Z",
    scenario_id: "nominal_to_safe_mode",
  },
  observation,
  invariant_results: expectedVerifiedExecutionInspectionExample.invariant_results,
  outcome: "PASS",
};

// Change the observation and its check together, retaining a valid saved FAIL.
export const failedTelemetryExecution = {
  ...verifiedExecution,
  observation: { ...observation, telemetry: { operating_mode: "NOMINAL" } },
  invariant_results: [
    ...verifiedExecution.invariant_results.slice(0, 3),
    {
      invariant_id: "telemetry_matches_post_state",
      expected: "SAFE",
      actual: "NOMINAL",
      passed: false,
    },
  ],
  outcome: "FAIL",
};

// Each set has 4 distinct IDs but does not cover all 4 required kinds of check.
export const incompleteInvariantResults = [
  {
    description: "2 acknowledgement checks and no telemetry check",
    results: [
      verifiedExecution.invariant_results[0],
      verifiedExecution.invariant_results[1],
      {
        invariant_id: "acknowledgement_is_rejected",
        expected: false,
        actual: false,
        passed: true,
      },
      verifiedExecution.invariant_results[2],
    ],
  },
  {
    description: "2 post-state checks and no pre-state check",
    results: [
      verifiedExecution.invariant_results[1],
      verifiedExecution.invariant_results[2],
      {
        invariant_id: "post_state_matches_pre_state",
        expected: "NOMINAL",
        actual: "NOMINAL",
        passed: true,
      },
      verifiedExecution.invariant_results[3],
    ],
  },
  {
    description: "an unsupported check ID",
    results: [
      { ...verifiedExecution.invariant_results[0], invariant_id: "__proto__" },
      ...verifiedExecution.invariant_results.slice(1),
    ],
  },
];

export const verifiedExecutionSequence = {
  records: [
    {
      ...verifiedExecution,
      execution: {
        execution_id: "exec-b",
        executed_at: "2026-08-17T14:00:00Z",
        scenario_id: "nominal_to_safe_mode",
      },
    },
    {
      ...verifiedExecution,
      execution: {
        execution_id: "exec-a",
        executed_at: "2026-08-17T10:00:00Z",
        scenario_id: "safe_to_nominal_mode",
      },
      observation: expectedVerifiedExecutionSequenceInspectionExample.records[1].observation,
      invariant_results: expectedVerifiedExecutionSequenceInspectionExample.records[1].invariant_results,
    },
    {
      ...verifiedExecution,
      execution: {
        execution_id: "exec-c",
        executed_at: "2026-08-17T12:00:00Z",
        scenario_id: "nominal_to_nominal_rejection",
      },
      observation: {
        command: { command_type: "SET_OPERATING_MODE", target_mode: "NOMINAL" },
        pre_state: { operating_mode: "NOMINAL" },
        acknowledgement: { accepted: false },
        post_state: { operating_mode: "NOMINAL" },
        telemetry: { operating_mode: "NOMINAL" },
      },
      invariant_results: [
        {
          invariant_id: "pre_state_matches_expected",
          expected: "NOMINAL",
          actual: "NOMINAL",
          passed: true,
        },
        {
          invariant_id: "acknowledgement_is_rejected",
          expected: false,
          actual: false,
          passed: true,
        },
        {
          invariant_id: "post_state_matches_pre_state",
          expected: "NOMINAL",
          actual: "NOMINAL",
          passed: true,
        },
        {
          invariant_id: "telemetry_matches_post_state",
          expected: "NOMINAL",
          actual: "NOMINAL",
          passed: true,
        },
      ],
    },
  ],
  continuity_results: [
    {
      previous_execution_id: "exec-b",
      next_execution_id: "exec-a",
      expected_operating_mode: "SAFE",
      observed_operating_mode: "SAFE",
      passed: true,
    },
    {
      previous_execution_id: "exec-a",
      next_execution_id: "exec-c",
      expected_operating_mode: "NOMINAL",
      observed_operating_mode: "NOMINAL",
      passed: true,
    },
  ],
  outcome: "PASS",
};
