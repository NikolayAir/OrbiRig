import type { EvidenceType, ScenarioId } from "./workflowTypes";

export const NOMINAL_TO_SAFE_EXAMPLE_OBSERVATION_DOCUMENT = {
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

export const NOMINAL_TO_NOMINAL_REJECTION_EXAMPLE_OBSERVATION_DOCUMENT = {
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

export const SAFE_TO_NOMINAL_EXAMPLE_OBSERVATION_DOCUMENT = {
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

export const EXAMPLE_VERIFIED_EXECUTION_DOCUMENT = {
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

export const EXAMPLE_VERIFIED_EXECUTION_SEQUENCE_DOCUMENT = {
  schema_version: 1,
  records: [
    {
      ...EXAMPLE_VERIFIED_EXECUTION_DOCUMENT,
      execution: {
        execution_id: "example-sequence-001",
        scenario_id: "nominal_to_safe_mode",
        executed_at: "2026-08-26T08:30:00Z",
      },
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

export const VERIFICATION_EXAMPLES: Record<
  ScenarioId,
  {
    executionId: string;
    executedAt: string;
    observationEvidence: string;
  }
> = {
  nominal_to_safe_mode: {
    executionId: "example-execution-001",
    executedAt: "2026-08-26T08:30:00Z",
    observationEvidence: JSON.stringify(
      NOMINAL_TO_SAFE_EXAMPLE_OBSERVATION_DOCUMENT,
      null,
      2,
    ),
  },
  nominal_to_nominal_rejection: {
    executionId: "example-execution-002",
    executedAt: "2026-08-26T08:35:00Z",
    observationEvidence: JSON.stringify(
      NOMINAL_TO_NOMINAL_REJECTION_EXAMPLE_OBSERVATION_DOCUMENT,
      null,
      2,
    ),
  },
  safe_to_nominal_mode: {
    executionId: "example-execution-003",
    executedAt: "2026-08-26T08:40:00Z",
    observationEvidence: JSON.stringify(
      SAFE_TO_NOMINAL_EXAMPLE_OBSERVATION_DOCUMENT,
      null,
      2,
    ),
  },
};

export const INSPECTION_EXAMPLES: Record<EvidenceType, string> = {
  observation: JSON.stringify(
    NOMINAL_TO_SAFE_EXAMPLE_OBSERVATION_DOCUMENT,
    null,
    2,
  ),
  "verified-execution": JSON.stringify(
    EXAMPLE_VERIFIED_EXECUTION_DOCUMENT,
    null,
    2,
  ),
  "verified-execution-sequence": JSON.stringify(
    EXAMPLE_VERIFIED_EXECUTION_SEQUENCE_DOCUMENT,
    null,
    2,
  ),
};
