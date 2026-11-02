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

export type ExampleVariant = "passing" | "failing" | "altered";

const pretty = (document: unknown) => JSON.stringify(document, null, 2);

// Each variant reports a telemetry mode that differs from the recorded post-state.
const MISMATCHED_TELEMETRY: Record<ScenarioId, unknown> = {
  nominal_to_safe_mode: { ...NOMINAL_TO_SAFE_EXAMPLE_OBSERVATION_DOCUMENT, telemetry: { operating_mode: "NOMINAL" } },
  nominal_to_nominal_rejection: { ...NOMINAL_TO_NOMINAL_REJECTION_EXAMPLE_OBSERVATION_DOCUMENT, telemetry: { operating_mode: "SAFE" } },
  safe_to_nominal_mode: { ...SAFE_TO_NOMINAL_EXAMPLE_OBSERVATION_DOCUMENT, telemetry: { operating_mode: "SAFE" } },
};

export function verificationExample(scenario: ScenarioId, variant: ExampleVariant) {
  const example = VERIFICATION_EXAMPLES[scenario];
  return variant === "passing" ? example : {
    ...example,
    executionId: `${example.executionId}-mismatch`,
    observationEvidence: pretty(MISMATCHED_TELEMETRY[scenario]),
  };
}

const CHANGED_TELEMETRY = { operating_mode: "NOMINAL" };

const FAILED_VERIFIED_EXECUTION_DOCUMENT = {
  ...EXAMPLE_VERIFIED_EXECUTION_DOCUMENT,
  execution: { ...EXAMPLE_VERIFIED_EXECUTION_DOCUMENT.execution, execution_id: "example-failed-execution-001" },
  observation: { ...EXAMPLE_VERIFIED_EXECUTION_DOCUMENT.observation, telemetry: CHANGED_TELEMETRY },
  invariant_results: EXAMPLE_VERIFIED_EXECUTION_DOCUMENT.invariant_results.map(result => (
    result.invariant_id === "telemetry_matches_post_state" ? { ...result, passed: false, actual: "NOMINAL" } : result
  )),
  outcome: "FAIL",
};

// Both records pass alone, but the second starts in a mode the first did not end in.
const sequenceRecord = (executionId: string, executedAt: string) => ({
  ...EXAMPLE_VERIFIED_EXECUTION_DOCUMENT,
  execution: { ...EXAMPLE_VERIFIED_EXECUTION_DOCUMENT.execution, execution_id: executionId, executed_at: executedAt },
});

const DISCONTINUOUS_SEQUENCE_DOCUMENT = {
  schema_version: 1,
  records: [
    sequenceRecord("example-discontinuous-001", "2026-08-26T08:30:00Z"),
    sequenceRecord("example-discontinuous-002", "2026-08-26T08:35:00Z"),
  ],
  continuity_results: [{
    previous_execution_id: "example-discontinuous-001",
    next_execution_id: "example-discontinuous-002",
    expected_operating_mode: "SAFE",
    observed_operating_mode: "NOMINAL",
    passed: false,
  }],
  outcome: "FAIL",
};

// Repeated field names are kept as text: serialising an object would remove one.
const REPEATED_FIELD_OBSERVATION = INSPECTION_EXAMPLES.observation.replace(
  '"accepted": true',
  '"accepted": false,\n    "accepted": true',
);

// The observation changes after saving while its stored PASS results stay the same.
const ALTERED_VERIFIED_EXECUTION_DOCUMENT = {
  ...EXAMPLE_VERIFIED_EXECUTION_DOCUMENT,
  observation: { ...EXAMPLE_VERIFIED_EXECUTION_DOCUMENT.observation, telemetry: CHANGED_TELEMETRY },
};

const ALTERED_SEQUENCE_DOCUMENT = {
  ...EXAMPLE_VERIFIED_EXECUTION_SEQUENCE_DOCUMENT,
  records: [
    { ...EXAMPLE_VERIFIED_EXECUTION_SEQUENCE_DOCUMENT.records[0], observation: ALTERED_VERIFIED_EXECUTION_DOCUMENT.observation },
    ...EXAMPLE_VERIFIED_EXECUTION_SEQUENCE_DOCUMENT.records.slice(1),
  ],
};

const FAILING_INSPECTION_EXAMPLES: Partial<Record<EvidenceType, string>> = {
  "verified-execution": pretty(FAILED_VERIFIED_EXECUTION_DOCUMENT),
  "verified-execution-sequence": pretty(DISCONTINUOUS_SEQUENCE_DOCUMENT),
};

const ALTERED_INSPECTION_EXAMPLES: Record<EvidenceType, string> = {
  observation: REPEATED_FIELD_OBSERVATION,
  "verified-execution": pretty(ALTERED_VERIFIED_EXECUTION_DOCUMENT),
  "verified-execution-sequence": pretty(ALTERED_SEQUENCE_DOCUMENT),
};

type Mode = "NOMINAL" | "SAFE";

const LONG_SEQUENCE_MEMBERS = 100;
const LONG_SEQUENCE_FAILED_TELEMETRY = new Set([37, 88]);
const LONG_SEQUENCE_DISCONTINUITY_BEFORE = 61;

function longSequenceRecord(member: number, preState: Mode) {
  const target: Mode = preState === "NOMINAL" ? "SAFE" : "NOMINAL";
  const telemetry = LONG_SEQUENCE_FAILED_TELEMETRY.has(member) ? preState : target;
  return {
    schema_version: 1,
    execution: {
      execution_id: `example-long-${String(member).padStart(3, "0")}`,
      scenario_id: preState === "NOMINAL" ? "nominal_to_safe_mode" : "safe_to_nominal_mode",
      executed_at: new Date(Date.UTC(2026, 7, 26, 8, member)).toISOString().replace(".000Z", "Z"),
    },
    observation: {
      command: { command_type: "SET_OPERATING_MODE", target_mode: target },
      pre_state: { operating_mode: preState },
      acknowledgement: { accepted: true },
      post_state: { operating_mode: target },
      telemetry: { operating_mode: telemetry },
    },
    invariant_results: [
      { invariant_id: "pre_state_matches_expected", passed: true, expected: preState, actual: preState },
      { invariant_id: "acknowledgement_is_accepted", passed: true, expected: true, actual: true },
      { invariant_id: "post_state_matches_requested_mode", passed: true, expected: target, actual: target },
      { invariant_id: "telemetry_matches_post_state", passed: telemetry === target, expected: target, actual: telemetry },
    ],
    outcome: telemetry === target ? "PASS" : "FAIL",
  };
}

function longSequenceDocument() {
  const records: Array<ReturnType<typeof longSequenceRecord>> = [];
  let mode: Mode = "NOMINAL";
  for (let member = 1; member <= LONG_SEQUENCE_MEMBERS; member++) {
    // Start one record in the wrong mode. It still passes alone, but the link to the previous record fails.
    if (member === LONG_SEQUENCE_DISCONTINUITY_BEFORE) mode = mode === "NOMINAL" ? "SAFE" : "NOMINAL";
    const record = longSequenceRecord(member, mode);
    records.push(record);
    mode = record.observation.post_state.operating_mode;
  }
  return {
    schema_version: 1,
    records,
    continuity_results: records.slice(1).map((record, index) => ({
      previous_execution_id: records[index].execution.execution_id,
      next_execution_id: record.execution.execution_id,
      expected_operating_mode: records[index].observation.post_state.operating_mode,
      observed_operating_mode: record.observation.pre_state.operating_mode,
      passed: records[index].observation.post_state.operating_mode === record.observation.pre_state.operating_mode,
    })),
    outcome: "FAIL",
  };
}

let longSequence: string | undefined;

// Build on first use: the form compares examples with its inputs on every render.
function longSequenceExample() {
  longSequence ??= pretty(longSequenceDocument());
  return longSequence;
}

export type InspectionExampleVariant = ExampleVariant | "long";

export function inspectionExample(evidenceType: EvidenceType, variant: InspectionExampleVariant): string | undefined {
  if (variant === "passing") return INSPECTION_EXAMPLES[evidenceType];
  if (variant === "long") return evidenceType === "verified-execution-sequence" ? longSequenceExample() : undefined;
  return variant === "failing" ? FAILING_INSPECTION_EXAMPLES[evidenceType] : ALTERED_INSPECTION_EXAMPLES[evidenceType];
}
