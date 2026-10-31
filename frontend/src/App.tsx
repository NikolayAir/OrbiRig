import { type SubmitEvent, useRef, useState } from "react";
import { WorkflowHelp } from "./WorkflowHelp";
import { VerificationPanel } from "./VerificationPanel";
import { InspectionPanel } from "./InspectionPanel";
import { INSPECTION_EXAMPLES, VERIFICATION_EXAMPLES } from "./examples";
import { wouldReplaceEditedValue } from "./formHelpers";
import { inspectEvidenceRequest, verifyObservationRequest } from "./apiClient";
import { useCancellableRequest } from "./useCancellableRequest";
import { useVerificationFieldHelp } from "./useVerificationFieldHelp";
import { useWorkflowFeedback } from "./useWorkflowFeedback";
import { DEFAULT_VERIFICATION_SCENARIO, REQUIRED_VERIFICATION_MESSAGES } from "./workflowContent";
import type {
  EvidenceType,
  InspectionState,
  VerificationInputs,
  VerificationRequiredErrors,
  VerificationRequiredField,
  VerificationState,
  Workflow,
} from "./workflowTypes";

const orbirigMark = new URL("./assets/orbirig-mark.png", import.meta.url).href;

export function App() {
  const [activeWorkflow, setActiveWorkflow] = useState<Workflow>("verification");
  // Keep inputs and requests above the conditional panels. Switching tasks must
  // retain drafts, completed results and requests that are still running.
  const [verificationInputs, setVerificationInputs] = useState<VerificationInputs>({
    executionId: "",
    executedAt: "",
    scenarioId: "",
    observationEvidence: "",
  });
  const { executionId, executedAt, scenarioId, observationEvidence } = verificationInputs;
  const [verificationRequiredErrors, setVerificationRequiredErrors] = useState<VerificationRequiredErrors>({});
  const [evidenceType, setEvidenceType] = useState<EvidenceType>("observation");
  const [evidence, setEvidence] = useState("");
  const verification = useCancellableRequest<VerificationState>({ kind: "idle" });
  const inspection = useCancellableRequest<InspectionState>({ kind: "idle" });
  const fieldHelp = useVerificationFieldHelp();
  const feedback = useWorkflowFeedback(activeWorkflow, verification.state, inspection.state);
  const feedbackAnnouncement = feedback.announcement;
  const executionIdInputRef = useRef<HTMLInputElement>(null);
  const executedAtInputRef = useRef<HTMLInputElement>(null);
  const scenarioInputRef = useRef<HTMLSelectElement>(null);
  const observationEvidenceInputRef = useRef<HTMLTextAreaElement>(null);
  const verificationExampleBaselineRef = useRef({ executionId: "", executedAt: "", observationEvidence: "" });
  const inspectionExampleBaselineRef = useRef("");
  const verificationExample = VERIFICATION_EXAMPLES[scenarioId || DEFAULT_VERIFICATION_SCENARIO];
  const verificationNeedsConfirmation = (
    ["executionId", "executedAt", "observationEvidence"] as const
  ).some(field => wouldReplaceEditedValue(
    verificationInputs[field],
    verificationExampleBaselineRef.current[field],
    verificationExample[field],
  ));

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

  function changeVerificationInput<Key extends keyof VerificationInputs>(field: Key, value: VerificationInputs[Key]) {
    setVerificationInputs(current => ({ ...current, [field]: value }));
    clearVerificationRequiredError(field);
    verification.setState({ kind: "idle" });
  }

  function selectEvidenceType(type: EvidenceType) {
    setEvidenceType(type);
    inspection.setState({ kind: "idle" });
  }

  function changeInspectionEvidence(value: string) {
    setEvidence(value);
    inspection.setState({ kind: "idle" });
  }

  function loadVerificationExample() {
    const selectedScenario = scenarioId === "" ? DEFAULT_VERIFICATION_SCENARIO : scenarioId;
    const example = VERIFICATION_EXAMPLES[selectedScenario];
    verificationExampleBaselineRef.current = example;
    setVerificationInputs({ ...example, scenarioId: selectedScenario });
    setVerificationRequiredErrors({});
    verification.setState({ kind: "idle" });
  }

  function loadInspectionExample() {
    inspectionExampleBaselineRef.current = INSPECTION_EXAMPLES[evidenceType];
    setEvidence(INSPECTION_EXAMPLES[evidenceType]);
    inspection.setState({ kind: "idle" });
  }

  function cancelVerification() {
    if (verification.cancel({ kind: "cancelled" })) feedback.verificationTargets.pendingRef.current = true;
  }

  function cancelInspection() {
    if (inspection.cancel({ kind: "cancelled" })) feedback.inspectionTargets.pendingRef.current = true;
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
    feedback.verificationTargets.pendingRef.current = true;
    feedback.setAnnouncement("Verifying observation…");
    await verification.run({ kind: "loading" }, signal => verifyObservationRequest(verificationInputs, signal));
  }

  async function inspectEvidence(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    feedback.inspectionTargets.pendingRef.current = true;
    feedback.setAnnouncement("Inspecting evidence…");
    await inspection.run({ kind: "loading" }, signal => inspectEvidenceRequest(evidenceType, evidence, signal));
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

      <WorkflowHelp activeWorkflow={activeWorkflow} />

      <p className="visually-hidden" role="status" aria-atomic="true">
        {feedbackAnnouncement}
      </p>

      <p className="workflow-selector-label" id="workflow-selector-label">
        Choose what to do
      </p>
      <div
        className="workflow-switcher"
        role="group"
        aria-labelledby="workflow-selector-label"
      >
        <button
          type="button"
          className="workflow-choice"
          aria-label="Show Verify observation"
          aria-pressed={activeWorkflow === "verification"}
          onClick={() => setActiveWorkflow("verification")}
        >
          <span>Verify observation</span>
          <small>Check if expectations are met.</small>
        </button>
        <button
          type="button"
          className="workflow-choice"
          aria-label="Show Inspect evidence"
          aria-pressed={activeWorkflow === "inspection"}
          onClick={() => setActiveWorkflow("inspection")}
        >
          <span>Inspect evidence</span>
          <small>Review saved evidence.</small>
        </button>
      </div>

      {activeWorkflow === "verification" && (
        <VerificationPanel
          input={verificationInputs}
          state={verification.state}
          errors={verificationRequiredErrors}
          inputRefs={{
            executionId: executionIdInputRef,
            executedAt: executedAtInputRef,
            scenarioId: scenarioInputRef,
            observationEvidence: observationEvidenceInputRef,
          }}
          feedback={feedback.verificationTargets}
          fieldHelp={fieldHelp}
          requiresConfirmation={verificationNeedsConfirmation}
          onInputChange={changeVerificationInput}
          onLoadExample={loadVerificationExample}
          onSubmit={verifyObservation}
          onCancel={cancelVerification}
        />
      )}

      {activeWorkflow === "inspection" && (
        <InspectionPanel
          evidenceType={evidenceType}
          evidence={evidence}
          state={inspection.state}
          feedback={feedback.inspectionTargets}
          requiresConfirmation={wouldReplaceEditedValue(evidence, inspectionExampleBaselineRef.current, INSPECTION_EXAMPLES[evidenceType])}
          onEvidenceTypeChange={selectEvidenceType}
          onEvidenceChange={changeInspectionEvidence}
          onLoadExample={loadInspectionExample}
          onSubmit={inspectEvidence}
          onCancel={cancelInspection}
        />
      )}
    </main>
  );
}
