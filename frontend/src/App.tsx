import { Fragment, type SubmitEvent, useEffect, useRef, useState } from "react";

import { WorkflowHelp } from "./WorkflowHelp";
import { LoadExampleButton } from "./LoadExampleButton";
import { WorkflowTitle } from "./WorkflowTitle";
import {
  EXAMPLE_VERIFIED_EXECUTION_DOCUMENT,
  EXAMPLE_VERIFIED_EXECUTION_SEQUENCE_DOCUMENT,
  NOMINAL_TO_NOMINAL_REJECTION_EXAMPLE_OBSERVATION_DOCUMENT,
  NOMINAL_TO_SAFE_EXAMPLE_OBSERVATION_DOCUMENT,
  SAFE_TO_NOMINAL_EXAMPLE_OBSERVATION_DOCUMENT,
} from "./examples";

const orbirigMark = new URL("./assets/orbirig-mark.png", import.meta.url).href;

type EvidenceType =
  | "observation"
  | "verified-execution"
  | "verified-execution-sequence";

type Workflow = "verification" | "inspection";

type PresentationOutcome = "PASS" | "FAIL";

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
  outcome: PresentationOutcome;
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
  outcome: PresentationOutcome;
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
  executedAt: "Execution time (UTC) is required.",
  scenarioId: "Select a supported scenario.",
  observationEvidence: "Observation evidence is required.",
};

const DEFAULT_VERIFICATION_SCENARIO: ScenarioId = "nominal_to_safe_mode";

const VERIFICATION_EXAMPLES: Record<
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

const INSPECTION_EXAMPLES: Record<EvidenceType, string> = {
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
  const executionIdHelpRef = useRef<HTMLSpanElement>(null);
  const scenarioHelpRef = useRef<HTMLSpanElement>(null);
  const executionIdInputRef = useRef<HTMLInputElement>(null);
  const executedAtInputRef = useRef<HTMLInputElement>(null);
  const scenarioInputRef = useRef<HTMLSelectElement>(null);
  const observationEvidenceInputRef = useRef<HTMLTextAreaElement>(null);
  const verificationFeedbackRef = useRef<HTMLDivElement>(null);
  const inspectionFeedbackRef = useRef<HTMLDivElement>(null);
  const verificationScrollPendingRef = useRef(false);
  const inspectionScrollPendingRef = useRef(false);
  const verificationExampleBaselineRef = useRef({
    executionId: "", executedAt: "", observationEvidence: "",
  });
  const inspectionExampleBaselineRef = useRef("");
  const verificationExample = VERIFICATION_EXAMPLES[scenarioId || DEFAULT_VERIFICATION_SCENARIO];
  const verificationNeedsConfirmation = [
    [executionId, verificationExampleBaselineRef.current.executionId, verificationExample.executionId],
    [executedAt, verificationExampleBaselineRef.current.executedAt, verificationExample.executedAt],
    [observationEvidence, verificationExampleBaselineRef.current.observationEvidence, verificationExample.observationEvidence],
  ].some(([current, baseline, next]) => wouldReplaceEditedValue(current, baseline, next));

  useEffect(() => {
    function dismissHelpOutside(event: PointerEvent) {
      if (!(event.target instanceof Node)) {
        return;
      }

      const executionHelpContainer = executionIdHelpRef.current;
      if (
        executionIdHelpOpen &&
        !executionHelpContainer?.contains(event.target)
      ) {
        setExecutionIdHelpOpen(false);
        if (
          document.activeElement instanceof HTMLElement &&
          executionHelpContainer?.contains(document.activeElement)
        ) {
          document.activeElement.blur();
        }
      }

      const scenarioHelpContainer = scenarioHelpRef.current;
      if (
        scenarioHelpOpen &&
        !scenarioHelpContainer?.contains(event.target)
      ) {
        setScenarioHelpOpen(false);
        if (
          document.activeElement instanceof HTMLElement &&
          scenarioHelpContainer?.contains(document.activeElement)
        ) {
          document.activeElement.blur();
        }
      }
    }

    document.addEventListener("pointerdown", dismissHelpOutside);
    return () =>
      document.removeEventListener("pointerdown", dismissHelpOutside);
  }, [executionIdHelpOpen, scenarioHelpOpen]);

  useEffect(() => {
    const isTerminal =
      verification.kind !== "idle" && verification.kind !== "loading";

    if (!verificationScrollPendingRef.current || !isTerminal) {
      return;
    }

    verificationScrollPendingRef.current = false;
    if (
      activeWorkflow === "verification" &&
      verificationFeedbackRef.current !== null
    ) {
      scrollFeedbackIntoView(verificationFeedbackRef.current);
    }
  }, [activeWorkflow, verification.kind]);

  useEffect(() => {
    const isTerminal =
      inspection.kind !== "idle" && inspection.kind !== "loading";

    if (!inspectionScrollPendingRef.current || !isTerminal) {
      return;
    }

    inspectionScrollPendingRef.current = false;
    if (
      activeWorkflow === "inspection" &&
      inspectionFeedbackRef.current !== null
    ) {
      scrollFeedbackIntoView(inspectionFeedbackRef.current);
    }
  }, [activeWorkflow, inspection.kind]);

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
    const selectedScenario =
      scenarioId === "" ? DEFAULT_VERIFICATION_SCENARIO : scenarioId;
    const example = VERIFICATION_EXAMPLES[selectedScenario];

    verificationExampleBaselineRef.current = example;
    setExecutionId(example.executionId);
    setExecutedAt(example.executedAt);
    setScenarioId(selectedScenario);
    setObservationEvidence(example.observationEvidence);
    setVerificationRequiredErrors({});
    setVerification({ kind: "idle" });
  }

  function loadInspectionExample() {
    inspectionExampleBaselineRef.current = INSPECTION_EXAMPLES[evidenceType];
    setEvidence(INSPECTION_EXAMPLES[evidenceType]);
    setInspection({ kind: "idle" });
  }

  async function verifyObservation(event: SubmitEvent<HTMLFormElement>) {
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
    verificationScrollPendingRef.current = true;
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

  async function inspectEvidence(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    inspectionScrollPendingRef.current = true;
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

      const payload: unknown = await response.json();

      if (evidenceType === "observation") {
        if (!isObservationPresentation(payload)) {
          setInspection({ kind: "transport-failure" });
          return;
        }

        setInspection({
          kind: "valid-observation",
          observation: payload,
        });
        return;
      }

      if (evidenceType === "verified-execution") {
        if (!isVerifiedExecutionPresentation(payload)) {
          setInspection({ kind: "transport-failure" });
          return;
        }

        setInspection({
          kind: "valid-verified-execution",
          record: payload,
        });
        return;
      }

      if (!isVerifiedExecutionSequencePresentation(payload)) {
        setInspection({ kind: "transport-failure" });
        return;
      }

      setInspection({
        kind: "valid-verified-execution-sequence",
        sequence: payload,
      });
    } catch {
      setInspection({ kind: "transport-failure" });
    }
  }

  return (
    <main>
      <header className="page-header">
        <p className="brand">
          <img src={orbirigMark} width="40" height="40" alt="" />
          <span>OrbiRig</span>
        </p>
        <h1>Verify observations and inspect evidence</h1>
        <p>
          Check recorded behaviour from simplified spacecraft tests against a
          selected scenario, or inspect saved evidence.
        </p>
      </header>

      <WorkflowHelp />

      <p className="workflow-selector-label" id="workflow-selector-label">
        Choose a workflow
      </p>
      <div
        className="workflow-switcher"
        role="group"
        aria-labelledby="workflow-selector-label"
      >
        <button
          type="button"
          className="workflow-choice"
          aria-label="Show Verify observation workflow"
          aria-pressed={activeWorkflow === "verification"}
          onClick={() => setActiveWorkflow("verification")}
        >
          <span>Verify observation</span>
          <small>Check a submitted observation against the selected scenario.</small>
        </button>
        <button
          type="button"
          className="workflow-choice"
          aria-label="Show Inspect evidence workflow"
          aria-pressed={activeWorkflow === "inspection"}
          onClick={() => setActiveWorkflow("inspection")}
        >
          <span>Inspect evidence</span>
          <small>Review an existing evidence document in a structured view.</small>
        </button>
      </div>

      {activeWorkflow === "verification" && (
        <section
          className="workflow-panel"
          id="verification-workflow"
          aria-labelledby="observation-verification"
        >
          <div className="workflow-heading">
            <WorkflowTitle
              headingId="observation-verification"
              helpId="verification-help-description"
              title="Verify observation"
              description="Provide execution details, select a supported scenario, and submit observation evidence for verification."
              onHelpOpen={() => {
                setExecutionIdHelpOpen(false);
                setScenarioHelpOpen(false);
              }}
            />
            <LoadExampleButton
              description="Replaces current inputs"
              disabled={verification.kind === "loading"}
              requiresConfirmation={verificationNeedsConfirmation}
              onLoad={loadVerificationExample}
            />
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
                    <span
                      ref={executionIdHelpRef}
                      className="field-help"
                      data-open={executionIdHelpOpen}
                    >
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
                    Execution time (UTC)
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
                  <label htmlFor="verification-scenario">Scenario</label>
                  <span
                    ref={scenarioHelpRef}
                    className="field-help"
                    data-open={scenarioHelpOpen}
                  >
                    <button
                      type="button"
                      className="field-help-button"
                      aria-label="About Scenario"
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
                      {scenario.label}
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
            </fieldset>

            <div className="verification-evidence">
              <div className="form-field evidence-input">
                <label htmlFor="verification-observation-evidence">
                  Observation evidence JSON
                </label>
                <p className="field-hint" id="verification-observation-hint">
                  Include the command, acknowledgement, states and telemetry from
                  the recorded execution.
                </p>
                <textarea
                  id="verification-observation-evidence"
                  ref={observationEvidenceInputRef}
                  aria-describedby={describedBy(
                    "verification-observation-hint",
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
                  disabled={verification.kind === "loading"}
                  spellCheck={false}
                  rows={8}
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

              <div className="form-actions">
                <button
                  type="submit"
                  className="primary-action"
                  disabled={verification.kind === "loading"}
                >
                  Verify observation
                </button>
              </div>
            </div>
          </form>

          <div className="workflow-feedback" ref={verificationFeedbackRef}>
            {verification.kind === "loading" && (
              <p role="status">Verifying observation…</p>
            )}

            {verification.kind === "validation-failure" && (
              <p role="alert">
                <strong className="feedback-label">Input error</strong>
                <span>{VERIFICATION_ERROR_MESSAGES[verification.code]}</span>
              </p>
            )}

            {verification.kind === "network-failure" && (
              <p role="alert">
                <strong className="feedback-label">Verification unavailable</strong>
                <span>The verification request could not reach the server. Try again.</span>
              </p>
            )}

            {verification.kind === "server-failure" && (
              <p role="alert">
                <strong className="feedback-label">Verification unavailable</strong>
                <span>The server could not complete verification. Try again.</span>
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
            <WorkflowTitle
              headingId="evidence-inspection"
              helpId="inspection-help-description"
              title="Inspect evidence"
              description="Select an evidence type and paste its JSON document to review it in a structured view."
            />
            <LoadExampleButton
              description="Replaces evidence JSON"
              disabled={inspection.kind === "loading"}
              requiresConfirmation={wouldReplaceEditedValue(evidence, inspectionExampleBaselineRef.current, INSPECTION_EXAMPLES[evidenceType])}
              onLoad={loadInspectionExample}
            />
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
                  aria-labelledby="observation-type-label"
                  aria-describedby="observation-type-description"
                  checked={evidenceType === "observation"}
                  onChange={() => selectEvidenceType("observation")}
                />
                <span>
                  <span id="observation-type-label">Observation</span>
                  <small id="observation-type-description">Recorded behaviour without verification results.</small>
                </span>
              </label>
              <label>
                <input
                  type="radio"
                  name="evidence-type"
                  value="verified-execution"
                  aria-labelledby="execution-type-label"
                  aria-describedby="execution-type-description"
                  checked={evidenceType === "verified-execution"}
                  onChange={() => selectEvidenceType("verified-execution")}
                />
                <span>
                  <span id="execution-type-label">Verified execution</span>
                  <small id="execution-type-description">One execution with its scenario and checks.</small>
                </span>
              </label>
              <label>
                <input
                  type="radio"
                  name="evidence-type"
                  value="verified-execution-sequence"
                  aria-labelledby="sequence-type-label"
                  aria-describedby="sequence-type-description"
                  checked={evidenceType === "verified-execution-sequence"}
                  onChange={() =>
                    selectEvidenceType("verified-execution-sequence")
                  }
                />
                <span>
                  <span id="sequence-type-label">Verified execution sequence</span>
                  <small id="sequence-type-description">Ordered executions and continuity checks.</small>
                </span>
              </label>
            </fieldset>

            <div className="form-field evidence-input">
              <label htmlFor="evidence">Evidence JSON</label>
              <p className="field-hint" id="inspection-evidence-hint">
                Paste the complete document for the selected evidence type.
              </p>
              <textarea
                id="evidence"
                name="evidence"
                aria-describedby="inspection-evidence-hint"
                value={evidence}
                onChange={(event) => {
                  setEvidence(event.target.value);
                  setInspection({ kind: "idle" });
                }}
                disabled={inspection.kind === "loading"}
                spellCheck={false}
                rows={12}
              />
            </div>
            <div className="form-actions">
              <button
                type="submit"
                className="primary-action"
                disabled={inspection.kind === "loading"}
              >
                Inspect evidence
              </button>
            </div>
          </form>

          <div className="workflow-feedback" ref={inspectionFeedbackRef}>
            {inspection.kind === "loading" && (
              <p role="status">Inspecting evidence…</p>
            )}

            {inspection.kind === "invalid" && (
              <p role="alert">
                <strong className="feedback-label">Invalid evidence</strong>
                <span>{invalidEvidenceMessage(inspection.evidenceType)}</span>
              </p>
            )}

            {inspection.kind === "transport-failure" && (
              <p role="alert">
                <strong className="feedback-label">Inspection unavailable</strong>
                <span>The inspection request could not be completed. Try again.</span>
              </p>
            )}

            {inspection.kind === "valid-observation" && (
              <ObservationDetails observation={inspection.observation} />
            )}

            {inspection.kind === "valid-verified-execution" && (
              <VerifiedExecutionDetails record={inspection.record} inspected />
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

function wouldReplaceEditedValue(current: string, baseline: string, next: string): boolean {
  return current !== baseline && current !== next && (baseline !== "" || current.trim() !== "");
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
    !isObservationPresentation(observation) ||
    !Array.isArray(results) ||
    !isPresentationOutcome(outcome)
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

function isObservationPresentation(
  payload: unknown,
): payload is ObservationPresentation {
  return (
    isObject(payload) &&
    isObject(payload.command) &&
    typeof payload.command.command_type === "string" &&
    typeof payload.command.target_mode === "string" &&
    isObject(payload.pre_state) &&
    typeof payload.pre_state.operating_mode === "string" &&
    isObject(payload.acknowledgement) &&
    typeof payload.acknowledgement.accepted === "boolean" &&
    isObject(payload.post_state) &&
    typeof payload.post_state.operating_mode === "string" &&
    isObject(payload.telemetry) &&
    typeof payload.telemetry.operating_mode === "string"
  );
}

function isPresentationOutcome(
  value: unknown,
): value is PresentationOutcome {
  return value === "PASS" || value === "FAIL";
}

function isVerifiedExecutionSequencePresentation(
  payload: unknown,
): payload is VerifiedExecutionSequencePresentation {
  if (
    !isObject(payload) ||
    !Array.isArray(payload.records) ||
    !Array.isArray(payload.continuity_results) ||
    !isPresentationOutcome(payload.outcome)
  ) {
    return false;
  }

  return (
    payload.records.every(isVerifiedExecutionPresentation) &&
    payload.continuity_results.every(
      (result) =>
        isObject(result) &&
        typeof result.previous_execution_id === "string" &&
        typeof result.next_execution_id === "string" &&
        typeof result.expected_operating_mode === "string" &&
        typeof result.observed_operating_mode === "string" &&
        typeof result.passed === "boolean",
    )
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
      <div className="result-heading">
        <div>
          <p className="result-context">Valid observation evidence</p>
          <h2 id="reconstructed-observation">Observation details</h2>
        </div>
      </div>
      <p className="result-description">
        These are reported values. No scenario verification has been performed.
      </p>
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
    <div className="verified-execution-fields">
      <div className="verified-execution-summary">
        <section className="execution-summary">
          <Subheading>Execution summary</Subheading>
          <dl className="execution-summary-fields">
            <dt>Execution ID</dt>
            <dd>{record.execution.execution_id}</dd>
            <dt>Execution time (UTC)</dt>
            <dd>{record.execution.executed_at}</dd>
            <dt>Scenario</dt>
            <dd>{record.execution.scenario_id}</dd>
          </dl>
        </section>

        <section className="result-observation">
          <Subheading>Observation details</Subheading>
          <ObservationFields observation={record.observation} />
        </section>
      </div>

      <Subheading className="invariant-results-heading">
        Verification checks
      </Subheading>
      <div className="invariant-results-wrapper">
        <ol className="invariant-results">
          {record.invariant_results.map((result, index) => (
            <li
              key={`${result.invariant_id}-${index}`}
              data-outcome={result.passed ? "PASS" : "FAIL"}
            >
              <div className="invariant-summary">
                <InvariantHeading className="invariant-title">
                  {Object.hasOwn(INVARIANT_TITLES, result.invariant_id)
                    ? INVARIANT_TITLES[result.invariant_id]
                    : "Verification check"}
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
                      label="Verification check"
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
  inspected = false,
}: {
  record: VerifiedExecutionPresentation;
  headingId?: string;
  inspected?: boolean;
}) {
  return (
    <section aria-labelledby={headingId}>
      <div className="result-heading">
        <div>
          <p className="result-context">
            {inspected ? "Valid saved evidence" : "Verification result"}
          </p>
          <h2 id={headingId}>Verified execution</h2>
        </div>
        <OutcomeBadge outcome={record.outcome} />
      </div>
      <p className="result-description">
        {record.outcome === "PASS"
          ? "The recorded behaviour matches this execution's scenario."
          : "The recorded behaviour does not meet this execution's scenario expectations. Review the failed checks below."}
      </p>
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
      <div className="result-heading">
        <div>
          <p className="result-context">Valid saved evidence</p>
          <h2 id="verified-execution-sequence">Verified execution sequence</h2>
        </div>
        <OutcomeBadge outcome={sequence.outcome} label="Sequence outcome" />
      </div>
      <p className="result-description">
        {sequence.outcome === "PASS"
          ? "All execution and continuity checks passed."
          : "One or more execution or continuity checks did not pass."}{" "}
        Records are shown in the supplied order.
      </p>

      <h3 className="sequence-flow-heading">Member records and continuity</h3>
      <ol
        className="sequence-flow"
        aria-label="Sequence member records and continuity checks"
        role="list"
      >
        {sequence.records.map((record, index) => {
          const headingId = `sequence-member-${index}`;
          const continuityResult = sequence.continuity_results[index];

          return (
            <Fragment key={`${record.execution.execution_id}-${index}`}>
              <li>
                <article
                  className="sequence-member"
                  aria-labelledby={headingId}
                >
                  <div className="sequence-member-heading">
                    <h4 id={headingId}>Member {index + 1}</h4>
                    <OutcomeBadge outcome={record.outcome} />
                  </div>
                  <VerifiedExecutionFields record={record} nested />
                </article>
              </li>
              {continuityResult !== undefined && (
                <li>
                  <ContinuityBoundaryDetails
                    result={continuityResult}
                    ordinal={index + 1}
                  />
                </li>
              )}
            </Fragment>
          );
        })}
      </ol>
    </section>
  );
}

function ContinuityBoundaryDetails({
  result,
  ordinal,
}: {
  result: VerifiedExecutionSequencePresentation["continuity_results"][number];
  ordinal: number;
}) {
  const headingId = `continuity-boundary-${ordinal - 1}`;

  return (
    <article
      className="continuity-boundary"
      aria-labelledby={headingId}
      data-outcome={result.passed ? "PASS" : "FAIL"}
    >
      <div className="continuity-boundary-heading">
        <h4 id={headingId}>Continuity check {ordinal}</h4>
        <OutcomeBadge
          outcome={result.passed ? "PASS" : "FAIL"}
          label="Continuity outcome"
        />
      </div>
      <dl className="continuity-boundary-fields">
        <div>
          <dt>Connected executions</dt>
          <dd>
            <span className="visually-hidden">Previous execution ID: </span>
            {result.previous_execution_id}
            <span aria-hidden="true"> → </span>
            <span className="visually-hidden">Next execution ID: </span>
            {result.next_execution_id}
          </dd>
        </div>
        <div>
          <dt>Expected operating mode</dt>
          <dd>{result.expected_operating_mode}</dd>
        </div>
        <div>
          <dt>Observed operating mode</dt>
          <dd>{result.observed_operating_mode}</dd>
        </div>
      </dl>
    </article>
  );
}

function formatInvariantValue(value: boolean | string): string {
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return value;
}

function scrollFeedbackIntoView(feedback: HTMLDivElement) {
  const prefersReducedMotion =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  feedback.scrollIntoView({
    behavior: prefersReducedMotion ? "auto" : "smooth",
    block: "start",
  });
}
