import { FormEvent, useRef, useState } from "react";

type EvidenceType =
  | "observation"
  | "verified-execution"
  | "verified-execution-sequence";

type Workflow = "verification" | "inspection";

type ScenarioId =
  | "nominal_to_safe_mode"
  | "nominal_to_nominal_rejection"
  | "safe_to_nominal_mode";

type VerificationErrorCode =
  | "invalid_request"
  | "invalid_scenario"
  | "invalid_observation_evidence"
  | "invalid_execution_metadata"
  | "scenario_command_mismatch";

type VerificationRequiredField =
  | "executionId"
  | "executedAt"
  | "scenarioId"
  | "observationEvidence";

type VerificationRequiredErrors = Partial<
  Record<VerificationRequiredField, string>
>;

type ObservationPresentation = {
  command: {
    command_type: string;
    target_mode: string;
  };
  pre_state: {
    operating_mode: string;
  };
  acknowledgement: {
    accepted: boolean;
  };
  post_state: {
    operating_mode: string;
  };
  telemetry: {
    operating_mode: string;
  };
};

type VerifiedExecutionPresentation = {
  execution: {
    execution_id: string;
    executed_at: string;
    scenario_id: string;
  };
  observation: ObservationPresentation;
  invariant_results: Array<{
    invariant_id: string;
    expected: boolean | string;
    actual: boolean | string;
    passed: boolean;
  }>;
  outcome: string;
};

type VerifiedExecutionSequencePresentation = {
  records: VerifiedExecutionPresentation[];
  continuity_results: Array<{
    previous_execution_id: string;
    next_execution_id: string;
    expected_operating_mode: string;
    observed_operating_mode: string;
    passed: boolean;
  }>;
  outcome: string;
};

type InspectionState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "valid-observation"; observation: ObservationPresentation }
  | {
      kind: "valid-verified-execution";
      record: VerifiedExecutionPresentation;
    }
  | {
      kind: "valid-verified-execution-sequence";
      sequence: VerifiedExecutionSequencePresentation;
    }
  | { kind: "invalid"; evidenceType: EvidenceType }
  | { kind: "transport-failure" };

type VerificationState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "completed"; record: VerifiedExecutionPresentation }
  | { kind: "validation-failure"; code: VerificationErrorCode }
  | { kind: "network-failure" }
  | { kind: "server-failure" };

const INSPECTION_ENDPOINTS: Record<EvidenceType, string> = {
  observation: "/api/inspect/observation",
  "verified-execution": "/api/inspect/verified-execution",
  "verified-execution-sequence":
    "/api/inspect/verified-execution-sequence",
};

const INVARIANT_TITLES: Record<string, string> = {
  pre_state_matches_expected: "Pre-state matches expected",
  acknowledgement_is_accepted: "Acknowledgement is accepted",
  acknowledgement_is_rejected: "Acknowledgement is rejected",
  post_state_matches_requested_mode: "Post-state matches requested mode",
  post_state_matches_pre_state: "Post-state matches pre-state",
  telemetry_matches_post_state: "Telemetry matches post-state",
};

const SUPPORTED_SCENARIOS: Array<{ value: ScenarioId; label: string }> = [
  {
    value: "nominal_to_safe_mode",
    label: "NOMINAL to SAFE",
  },
  {
    value: "nominal_to_nominal_rejection",
    label: "NOMINAL to NOMINAL rejection",
  },
  {
    value: "safe_to_nominal_mode",
    label: "SAFE to NOMINAL",
  },
];

const VERIFICATION_ERROR_MESSAGES: Record<VerificationErrorCode, string> = {
  invalid_request: "The verification request is invalid.",
  invalid_scenario: "Select a supported scenario.",
  invalid_observation_evidence: "The observation evidence is invalid.",
  invalid_execution_metadata: "The execution metadata is invalid.",
  scenario_command_mismatch:
    "The observation command does not match the selected scenario.",
};

const REQUIRED_VERIFICATION_MESSAGES: Record<
  VerificationRequiredField,
  string
> = {
  executionId: "Execution ID is required.",
  executedAt: "UTC execution timestamp is required.",
  scenarioId: "Select a supported scenario.",
  observationEvidence: "Observation evidence is required.",
};

const EXAMPLE_OBSERVATION_DOCUMENT = {
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

const EXAMPLE_VERIFIED_EXECUTION_DOCUMENT = {
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

const EXAMPLE_VERIFIED_EXECUTION_SEQUENCE_DOCUMENT = {
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

const VERIFICATION_EXAMPLE = {
  executionId: "example-execution-001",
  executedAt: "2026-08-26T08:30:00Z",
  scenarioId: "nominal_to_safe_mode" as const,
  observationEvidence: JSON.stringify(EXAMPLE_OBSERVATION_DOCUMENT, null, 2),
};

const INSPECTION_EXAMPLES: Record<EvidenceType, string> = {
  observation: JSON.stringify(EXAMPLE_OBSERVATION_DOCUMENT, null, 2),
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

export function App() {
  const [activeWorkflow, setActiveWorkflow] =
    useState<Workflow>("verification");
  const [executionIdHelpOpen, setExecutionIdHelpOpen] = useState(false);
  const [scenarioHelpOpen, setScenarioHelpOpen] = useState(false);
  const [executionId, setExecutionId] = useState("");
  const [executedAt, setExecutedAt] = useState("");
  const [scenarioId, setScenarioId] = useState<ScenarioId | "">("");
  const [observationEvidence, setObservationEvidence] = useState("");
  const [verificationRequiredErrors, setVerificationRequiredErrors] =
    useState<VerificationRequiredErrors>({});
  const [verification, setVerification] = useState<VerificationState>({
    kind: "idle",
  });
  const [evidenceType, setEvidenceType] =
    useState<EvidenceType>("observation");
  const [evidence, setEvidence] = useState("");
  const [inspection, setInspection] = useState<InspectionState>({
    kind: "idle",
  });
  const executionIdInputRef = useRef<HTMLInputElement>(null);
  const executedAtInputRef = useRef<HTMLInputElement>(null);
  const scenarioInputRef = useRef<HTMLSelectElement>(null);
  const observationEvidenceInputRef = useRef<HTMLTextAreaElement>(null);

  function selectEvidenceType(selectedType: EvidenceType) {
    setEvidenceType(selectedType);
    setInspection({ kind: "idle" });
  }

  function clearVerificationRequiredError(field: VerificationRequiredField) {
    setVerificationRequiredErrors((errors) => {
      if (errors[field] === undefined) {
        return errors;
      }

      const remainingErrors = { ...errors };
      delete remainingErrors[field];
      return remainingErrors;
    });
  }

  function loadVerificationExample() {
    setExecutionId(VERIFICATION_EXAMPLE.executionId);
    setExecutedAt(VERIFICATION_EXAMPLE.executedAt);
    setScenarioId(VERIFICATION_EXAMPLE.scenarioId);
    setObservationEvidence(VERIFICATION_EXAMPLE.observationEvidence);
    setVerificationRequiredErrors({});
    setVerification({ kind: "idle" });
  }

  function loadInspectionExample() {
    setEvidence(INSPECTION_EXAMPLES[evidenceType]);
    setInspection({ kind: "idle" });
  }

  async function verifyObservation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const requiredErrors: VerificationRequiredErrors = {};

    if (!executionId.trim()) {
      requiredErrors.executionId = REQUIRED_VERIFICATION_MESSAGES.executionId;
    }
    if (!executedAt.trim()) {
      requiredErrors.executedAt = REQUIRED_VERIFICATION_MESSAGES.executedAt;
    }
    if (!scenarioId) {
      requiredErrors.scenarioId = REQUIRED_VERIFICATION_MESSAGES.scenarioId;
    }
    if (!observationEvidence.trim()) {
      requiredErrors.observationEvidence =
        REQUIRED_VERIFICATION_MESSAGES.observationEvidence;
    }

    const firstMissingField = (
      [
        "executionId",
        "executedAt",
        "scenarioId",
        "observationEvidence",
      ] as const
    ).find((field) => requiredErrors[field] !== undefined);

    if (firstMissingField !== undefined) {
      setVerificationRequiredErrors(requiredErrors);
      const fields = {
        executionId: executionIdInputRef.current,
        executedAt: executedAtInputRef.current,
        scenarioId: scenarioInputRef.current,
        observationEvidence: observationEvidenceInputRef.current,
      };
      fields[firstMissingField]?.focus();
      return;
    }

    setVerificationRequiredErrors({});
    setVerification({ kind: "loading" });

    let response: Response;

    try {
      response = await fetch("/api/verify/observation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          execution_id: executionId,
          executed_at: executedAt,
          scenario_id: scenarioId,
          observation_evidence: observationEvidence,
        }),
      });
    } catch {
      setVerification({ kind: "network-failure" });
      return;
    }

    if (response.status === 422) {
      try {
        const code = verificationErrorCode(await response.json());

        if (code !== null) {
          setVerification({ kind: "validation-failure", code });
          return;
        }
      } catch {
        // An invalid error response is an unexpected server failure.
      }

      setVerification({ kind: "server-failure" });
      return;
    }

    if (!response.ok) {
      setVerification({ kind: "server-failure" });
      return;
    }

    try {
      const payload: unknown = await response.json();

      if (!isVerifiedExecutionPresentation(payload)) {
        setVerification({ kind: "server-failure" });
        return;
      }

      setVerification({
        kind: "completed",
        record: payload,
      });
    } catch {
      setVerification({ kind: "server-failure" });
    }
  }

  async function inspectEvidence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setInspection({ kind: "loading" });

    try {
      const response = await fetch(INSPECTION_ENDPOINTS[evidenceType], {
        method: "POST",
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
        },
        body: evidence,
      });

      if (response.status === 422) {
        setInspection({ kind: "invalid", evidenceType });
        return;
      }

      if (!response.ok) {
        setInspection({ kind: "transport-failure" });
        return;
      }

      if (evidenceType === "observation") {
        setInspection({
          kind: "valid-observation",
          observation: (await response.json()) as ObservationPresentation,
        });
        return;
      }

      if (evidenceType === "verified-execution") {
        setInspection({
          kind: "valid-verified-execution",
          record: (await response.json()) as VerifiedExecutionPresentation,
        });
        return;
      }

      setInspection({
        kind: "valid-verified-execution-sequence",
        sequence:
          (await response.json()) as VerifiedExecutionSequencePresentation,
      });
    } catch {
      setInspection({ kind: "transport-failure" });
    }
  }

  return (
    <main>
      <header>
        <p className="eyebrow">OrbiRig</p>
        <h1>Observation verification and evidence inspection</h1>
        <p>
          Verify submitted observations against explicit scenarios or inspect
          existing evidence without changing it.
        </p>
      </header>

      <div
        className="workflow-switcher"
        role="group"
        aria-label="Available workflows"
      >
        <button
          type="button"
          className="workflow-choice"
          aria-label="Show Verify observation workflow"
          aria-pressed={activeWorkflow === "verification"}
          onClick={() => setActiveWorkflow("verification")}
        >
          <span>Verify observation</span>
          <small>Check submitted observations against a scenario.</small>
        </button>
        <button
          type="button"
          className="workflow-choice"
          aria-label="Show Inspect evidence workflow"
          aria-pressed={activeWorkflow === "inspection"}
          onClick={() => setActiveWorkflow("inspection")}
        >
          <span>Inspect evidence</span>
          <small>Reconstruct an existing evidence document.</small>
        </button>
      </div>

      {activeWorkflow === "verification" && (
        <section
          className="workflow-panel"
          id="verification-workflow"
          aria-labelledby="observation-verification"
        >
          <div className="workflow-heading">
            <h2 id="observation-verification">Verify observation</h2>
            <p>
              Provide execution metadata, select a supported scenario, and
              submit raw observation evidence for canonical verification.
            </p>
          </div>

          <form
            className="verification-form"
            noValidate
            onSubmit={verifyObservation}
          >
            <fieldset
              className="verification-inputs"
              disabled={verification.kind === "loading"}
            >
              <legend>Verification input</legend>

              <div className="metadata-fields">
                <div className="form-field">
                  <div className="field-label">
                    <label htmlFor="verification-execution-id">
                      Execution ID
                    </label>
                    <span className="field-help" data-open={executionIdHelpOpen}>
                      <button
                        type="button"
                        className="field-help-button"
                        aria-label="About Execution ID"
                        aria-controls="execution-id-help-description"
                        aria-describedby="execution-id-help-description"
                        onClick={(event) => {
                          if (executionIdHelpOpen) {
                            setExecutionIdHelpOpen(false);
                            event.currentTarget.blur();
                            return;
                          }

                          setScenarioHelpOpen(false);
                          setExecutionIdHelpOpen(true);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Escape") {
                            setExecutionIdHelpOpen(false);
                            event.currentTarget.blur();
                          }
                        }}
                      >
                        ?
                      </button>
                      <span id="execution-id-help-description" role="tooltip">
                        A non-empty identifier recorded with the resulting evidence.
                      </span>
                    </span>
                  </div>
                  <input
                    id="verification-execution-id"
                    ref={executionIdInputRef}
                    aria-describedby={describedBy(
                      "execution-id-help-description",
                      verificationRequiredErrors.executionId
                        ? "verification-execution-id-error"
                        : undefined,
                    )}
                    aria-invalid={
                      verificationRequiredErrors.executionId ? true : undefined
                    }
                    value={executionId}
                    onChange={(event) => {
                      setExecutionId(event.target.value);
                      clearVerificationRequiredError("executionId");
                      setVerification({ kind: "idle" });
                    }}
                    required
                  />
                  {verificationRequiredErrors.executionId && (
                    <p
                      className="field-error"
                      id="verification-execution-id-error"
                      role="alert"
                    >
                      {verificationRequiredErrors.executionId}
                    </p>
                  )}
                </div>

                <div className="form-field">
                  <label htmlFor="verification-executed-at">
                    UTC execution timestamp
                  </label>
                  <input
                    id="verification-executed-at"
                    ref={executedAtInputRef}
                    aria-describedby={describedBy(
                      verificationRequiredErrors.executedAt
                        ? "verification-executed-at-error"
                        : undefined,
                    )}
                    aria-invalid={
                      verificationRequiredErrors.executedAt ? true : undefined
                    }
                    value={executedAt}
                    onChange={(event) => {
                      setExecutedAt(event.target.value);
                      clearVerificationRequiredError("executedAt");
                      setVerification({ kind: "idle" });
                    }}
                    placeholder="2026-08-25T18:30:00Z"
                    required
                  />
                  {verificationRequiredErrors.executedAt && (
                    <p
                      className="field-error"
                      id="verification-executed-at-error"
                      role="alert"
                    >
                      {verificationRequiredErrors.executedAt}
                    </p>
                  )}
                </div>
              </div>

              <div className="form-field">
                <div className="field-label">
                  <label htmlFor="verification-scenario">Scenario ID</label>
                  <span className="field-help" data-open={scenarioHelpOpen}>
                    <button
                      type="button"
                      className="field-help-button"
                      aria-label="About Scenario ID"
                      aria-controls="scenario-help-description"
                      aria-describedby="scenario-help-description"
                      onClick={(event) => {
                        if (scenarioHelpOpen) {
                          setScenarioHelpOpen(false);
                          event.currentTarget.blur();
                          return;
                        }

                        setExecutionIdHelpOpen(false);
                        setScenarioHelpOpen(true);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          setScenarioHelpOpen(false);
                          event.currentTarget.blur();
                        }
                      }}
                    >
                      ?
                    </button>
                    <span id="scenario-help-description" role="tooltip">
                      Select the scenario to verify against. It is not inferred from
                      the evidence.
                    </span>
                  </span>
                </div>
                <select
                  id="verification-scenario"
                  ref={scenarioInputRef}
                  aria-describedby={describedBy(
                    "scenario-help-description",
                    verificationRequiredErrors.scenarioId
                      ? "verification-scenario-error"
                      : undefined,
                  )}
                  aria-invalid={
                    verificationRequiredErrors.scenarioId ? true : undefined
                  }
                  value={scenarioId}
                  onChange={(event) => {
                    setScenarioId(event.target.value as ScenarioId | "");
                    clearVerificationRequiredError("scenarioId");
                    setVerification({ kind: "idle" });
                  }}
                  required
                >
                  <option value="">Select a supported scenario</option>
                  {SUPPORTED_SCENARIOS.map((scenario) => (
                    <option key={scenario.value} value={scenario.value}>
                      {scenario.label} ({scenario.value})
                    </option>
                  ))}
                </select>
                {verificationRequiredErrors.scenarioId && (
                  <p
                    className="field-error"
                    id="verification-scenario-error"
                    role="alert"
                  >
                    {verificationRequiredErrors.scenarioId}
                  </p>
                )}
              </div>

              <div className="form-field">
                <label htmlFor="verification-observation-evidence">
                  Observation evidence JSON
                </label>
                <textarea
                  id="verification-observation-evidence"
                  ref={observationEvidenceInputRef}
                  aria-describedby={describedBy(
                    verificationRequiredErrors.observationEvidence
                      ? "verification-observation-evidence-error"
                      : undefined,
                  )}
                  aria-invalid={
                    verificationRequiredErrors.observationEvidence
                      ? true
                      : undefined
                  }
                  value={observationEvidence}
                  onChange={(event) => {
                    setObservationEvidence(event.target.value);
                    clearVerificationRequiredError("observationEvidence");
                    setVerification({ kind: "idle" });
                  }}
                  spellCheck={false}
                  rows={6}
                  required
                />
                {verificationRequiredErrors.observationEvidence && (
                  <p
                    className="field-error"
                    id="verification-observation-evidence-error"
                    role="alert"
                  >
                    {verificationRequiredErrors.observationEvidence}
                  </p>
                )}
              </div>
            </fieldset>

            <div className="form-actions">
              <button
                type="button"
                className="secondary-action"
                disabled={verification.kind === "loading"}
                onClick={loadVerificationExample}
              >
                Load example
              </button>
              <button
                type="submit"
                className="primary-action"
                disabled={verification.kind === "loading"}
              >
                Verify observation
              </button>
            </div>
          </form>

          <div className="workflow-feedback">
            {verification.kind === "loading" && (
              <p role="status">Verifying observation…</p>
            )}

            {verification.kind === "validation-failure" && (
              <p role="alert">
                {VERIFICATION_ERROR_MESSAGES[verification.code]}
              </p>
            )}

            {verification.kind === "network-failure" && (
              <p role="alert">
                The verification request could not reach the server. Try again.
              </p>
            )}

            {verification.kind === "server-failure" && (
              <p role="alert">
                The server could not complete verification. Try again.
              </p>
            )}

            {verification.kind === "completed" && (
              <VerifiedExecutionDetails
                record={verification.record}
                headingId="verified-observation-result"
              />
            )}
          </div>
        </section>
      )}

      {activeWorkflow === "inspection" && (
        <section
          className="workflow-panel"
          id="inspection-workflow"
          aria-labelledby="evidence-inspection"
        >
          <div className="workflow-heading">
            <h2 id="evidence-inspection">Inspect evidence</h2>
            <p>
              Select an evidence type and paste its JSON document to inspect
              the reconstructed data.
            </p>
          </div>

          <form onSubmit={inspectEvidence}>
            <fieldset
              className="evidence-types"
              disabled={inspection.kind === "loading"}
            >
              <legend>Evidence type</legend>
              <label>
                <input
                  type="radio"
                  name="evidence-type"
                  value="observation"
                  checked={evidenceType === "observation"}
                  onChange={() => selectEvidenceType("observation")}
                />
                Observation
              </label>
              <label>
                <input
                  type="radio"
                  name="evidence-type"
                  value="verified-execution"
                  checked={evidenceType === "verified-execution"}
                  onChange={() => selectEvidenceType("verified-execution")}
                />
                Verified execution
              </label>
              <label>
                <input
                  type="radio"
                  name="evidence-type"
                  value="verified-execution-sequence"
                  checked={evidenceType === "verified-execution-sequence"}
                  onChange={() =>
                    selectEvidenceType("verified-execution-sequence")
                  }
                />
                Verified execution sequence
              </label>
            </fieldset>

            <div className="form-field">
              <label htmlFor="evidence">Evidence JSON</label>
              <textarea
                id="evidence"
                name="evidence"
                value={evidence}
                onChange={(event) => {
                  setEvidence(event.target.value);
                  setInspection({ kind: "idle" });
                }}
                disabled={inspection.kind === "loading"}
                spellCheck={false}
                rows={6}
              />
            </div>
            <div className="form-actions">
              <button
                type="button"
                className="secondary-action"
                disabled={inspection.kind === "loading"}
                onClick={loadInspectionExample}
              >
                Load example
              </button>
              <button
                type="submit"
                className="primary-action"
                disabled={inspection.kind === "loading"}
              >
                Inspect evidence
              </button>
            </div>
          </form>

          <div className="workflow-feedback">
            {inspection.kind === "loading" && (
              <p role="status">Inspecting evidence…</p>
            )}

            {inspection.kind === "invalid" && (
              <p role="alert">
                {invalidEvidenceMessage(inspection.evidenceType)}
              </p>
            )}

            {inspection.kind === "transport-failure" && (
              <p role="alert">
                The inspection request could not be completed. Try again.
              </p>
            )}

            {inspection.kind === "valid-observation" && (
              <ObservationDetails observation={inspection.observation} />
            )}

            {inspection.kind === "valid-verified-execution" && (
              <VerifiedExecutionDetails record={inspection.record} />
            )}

            {inspection.kind === "valid-verified-execution-sequence" && (
              <VerifiedExecutionSequenceDetails sequence={inspection.sequence} />
            )}
          </div>
        </section>
      )}
    </main>
  );
}

function describedBy(...ids: Array<string | undefined>): string | undefined {
  const descriptionIds = ids.filter(
    (id): id is string => id !== undefined,
  );
  return descriptionIds.length > 0 ? descriptionIds.join(" ") : undefined;
}

function evidenceTypeName(evidenceType: EvidenceType): string {
  if (evidenceType === "observation") {
    return "observation evidence";
  }
  if (evidenceType === "verified-execution") {
    return "verified-execution evidence";
  }
  return "verified-execution-sequence evidence";
}

function invalidEvidenceMessage(evidenceType: EvidenceType): string {
  return `The ${evidenceTypeName(evidenceType)} is invalid.`;
}

function verificationErrorCode(
  payload: unknown,
): VerificationErrorCode | null {
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("detail" in payload)
  ) {
    return null;
  }

  const detail = payload.detail;

  if (typeof detail !== "object" || detail === null || !("code" in detail)) {
    return null;
  }

  const code = detail.code;

  if (
    typeof code === "string" &&
    Object.hasOwn(VERIFICATION_ERROR_MESSAGES, code)
  ) {
    return code as VerificationErrorCode;
  }

  return null;
}

function isVerifiedExecutionPresentation(
  payload: unknown,
): payload is VerifiedExecutionPresentation {
  if (!isObject(payload)) {
    return false;
  }

  const { execution, observation, invariant_results: results, outcome } =
    payload;

  if (
    !isObject(execution) ||
    typeof execution.execution_id !== "string" ||
    typeof execution.executed_at !== "string" ||
    typeof execution.scenario_id !== "string" ||
    !isObject(observation) ||
    !isObject(observation.command) ||
    typeof observation.command.command_type !== "string" ||
    typeof observation.command.target_mode !== "string" ||
    !isObject(observation.pre_state) ||
    typeof observation.pre_state.operating_mode !== "string" ||
    !isObject(observation.acknowledgement) ||
    typeof observation.acknowledgement.accepted !== "boolean" ||
    !isObject(observation.post_state) ||
    typeof observation.post_state.operating_mode !== "string" ||
    !isObject(observation.telemetry) ||
    typeof observation.telemetry.operating_mode !== "string" ||
    !Array.isArray(results) ||
    typeof outcome !== "string"
  ) {
    return false;
  }

  return results.every(
    (result) =>
      isObject(result) &&
      typeof result.invariant_id === "string" &&
      (typeof result.expected === "boolean" ||
        typeof result.expected === "string") &&
      (typeof result.actual === "boolean" ||
        typeof result.actual === "string") &&
      typeof result.passed === "boolean",
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function ObservationFields({
  observation,
}: {
  observation: ObservationPresentation;
}) {
  return (
    <dl className="observation-fields">
      <dt>Command type</dt>
      <dd>{observation.command.command_type}</dd>
      <dt>Target mode</dt>
      <dd>{observation.command.target_mode}</dd>
      <dt>Pre-state operating mode</dt>
      <dd>{observation.pre_state.operating_mode}</dd>
      <dt>Acknowledgement</dt>
      <dd>{observation.acknowledgement.accepted ? "Accepted" : "Rejected"}</dd>
      <dt>Post-state operating mode</dt>
      <dd>{observation.post_state.operating_mode}</dd>
      <dt>Telemetry operating mode</dt>
      <dd>{observation.telemetry.operating_mode}</dd>
    </dl>
  );
}

function ObservationDetails({
  observation,
}: {
  observation: ObservationPresentation;
}) {
  return (
    <section className="observation-details" aria-labelledby="reconstructed-observation">
      <h2 id="reconstructed-observation">Reconstructed observation</h2>
      <ObservationFields observation={observation} />
    </section>
  );
}

function VerifiedExecutionFields({
  record,
  nested = false,
}: {
  record: VerifiedExecutionPresentation;
  nested?: boolean;
}) {
  const Subheading = nested ? "h5" : "h3";
  const InvariantHeading = nested ? "h6" : "h4";

  return (
    <div className={`verified-execution-fields${nested ? " is-nested" : ""}`}>
      <div className="verified-execution-summary">
        <section className="execution-summary">
          <Subheading>Execution summary</Subheading>
          <dl className="execution-summary-fields">
            <dt>Execution ID</dt>
            <dd>{record.execution.execution_id}</dd>
            <dt>UTC execution timestamp</dt>
            <dd>{record.execution.executed_at}</dd>
            <dt>Scenario ID</dt>
            <dd>{record.execution.scenario_id}</dd>
          </dl>
        </section>

        <section className="result-observation">
          <Subheading>Reconstructed observation</Subheading>
          <ObservationFields observation={record.observation} />
        </section>
      </div>

      <Subheading className="invariant-results-heading">
        Invariant results
      </Subheading>
      <div className="invariant-results-wrapper">
        <div className="invariant-column-headings" aria-hidden="true">
          <span>Invariant</span>
          <span>Expected</span>
          <span>Actual</span>
          <span>Result</span>
        </div>
        <ol className="invariant-results">
          {record.invariant_results.map((result, index) => (
            <li key={`${result.invariant_id}-${index}`}>
              <div className="invariant-summary">
                <InvariantHeading className="invariant-title">
                  {Object.hasOwn(INVARIANT_TITLES, result.invariant_id)
                    ? INVARIANT_TITLES[result.invariant_id]
                    : "Invariant result"}
                </InvariantHeading>
                <p className="invariant-id">
                  <code>{result.invariant_id}</code>
                </p>
              </div>
              <dl className="invariant-values">
                <div>
                  <dt>Expected</dt>
                  <dd>{formatInvariantValue(result.expected)}</dd>
                </div>
                <div>
                  <dt>Actual</dt>
                  <dd>{formatInvariantValue(result.actual)}</dd>
                </div>
                <div>
                  <dt>Result</dt>
                  <dd>
                    <OutcomeBadge
                      outcome={result.passed ? "PASS" : "FAIL"}
                      label="Invariant result"
                    />
                  </dd>
                </div>
              </dl>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function OutcomeBadge({
  outcome,
  label = "Verification outcome",
}: {
  outcome: string;
  label?: string;
}) {
  return (
    <span
      className="outcome-badge"
      data-outcome={outcome}
      aria-label={`${label}: ${outcome}`}
    >
      {outcome}
    </span>
  );
}

function VerifiedExecutionDetails({
  record,
  headingId = "verified-execution",
}: {
  record: VerifiedExecutionPresentation;
  headingId?: string;
}) {
  return (
    <section aria-labelledby={headingId}>
      <div className="result-heading">
        <h2 id={headingId}>Verified execution</h2>
        <OutcomeBadge outcome={record.outcome} />
      </div>
      <VerifiedExecutionFields record={record} />
    </section>
  );
}

function VerifiedExecutionSequenceDetails({
  sequence,
}: {
  sequence: VerifiedExecutionSequencePresentation;
}) {
  return (
    <section aria-labelledby="verified-execution-sequence">
      <h2 id="verified-execution-sequence">Verified execution sequence</h2>
      <dl>
        <dt>Sequence outcome</dt>
        <dd>{sequence.outcome}</dd>
      </dl>

      <h3>Member records</h3>
      <ol
        className="sequence-members"
        aria-label="Sequence member records"
        role="list"
      >
        {sequence.records.map((record, index) => {
          const headingId = `sequence-member-${index}`;
          return (
            <li key={`${record.execution.execution_id}-${index}`}>
              <article className="sequence-member" aria-labelledby={headingId}>
                <div className="sequence-member-heading">
                  <h4 id={headingId}>Member {index + 1}</h4>
                  <OutcomeBadge outcome={record.outcome} />
                </div>
                <VerifiedExecutionFields record={record} nested />
              </article>
            </li>
          );
        })}
      </ol>

      <h3>Continuity boundaries</h3>
      <ol
        className="continuity-boundaries"
        aria-label="Continuity boundaries"
        role="list"
      >
        {sequence.continuity_results.map((result, index) => {
          const headingId = `continuity-boundary-${index}`;
          return (
            <li
              key={`${result.previous_execution_id}-${result.next_execution_id}-${index}`}
            >
              <article
                className="continuity-boundary"
                aria-labelledby={headingId}
              >
                <h4 id={headingId}>Boundary {index + 1}</h4>
                <dl>
                  <dt>Previous execution ID</dt>
                  <dd>{result.previous_execution_id}</dd>
                  <dt>Next execution ID</dt>
                  <dd>{result.next_execution_id}</dd>
                  <dt>Expected operating mode</dt>
                  <dd>{result.expected_operating_mode}</dd>
                  <dt>Observed operating mode</dt>
                  <dd>{result.observed_operating_mode}</dd>
                  <dt>Result</dt>
                  <dd>{result.passed ? "PASS" : "FAIL"}</dd>
                </dl>
              </article>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function formatInvariantValue(value: boolean | string): string {
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return value;
}
