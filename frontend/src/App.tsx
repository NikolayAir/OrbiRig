import { type SubmitEvent, useRef, useState } from "react";
import { DocLink } from "./DocLink";
import { WorkflowHelp } from "./WorkflowHelp";
import { VerificationPanel } from "./VerificationPanel";
import { InspectionPanel } from "./InspectionPanel";
import type { SequenceView } from "./EvidenceDetails";
import { type ExampleVariant, type InspectionExampleVariant, inspectionExample, verificationExample } from "./examples";
import { wouldReplaceEditedValue } from "./formHelpers";
import { inspectEvidenceRequest, verifyObservationRequest } from "./apiClient";
import { useCancellableRequest } from "./useCancellableRequest";
import { useVerificationFieldHelp } from "./useVerificationFieldHelp";
import { useWorkflowFeedback } from "./useWorkflowFeedback";
import { DEFAULT_VERIFICATION_SCENARIO, LINKS, REQUIRED_VERIFICATION_MESSAGES, isInspectionComplete } from "./workflowContent";
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
  const [inspectionRequiredError, setInspectionRequiredError] = useState(false);
  // The panel is removed when verification is selected; keep its page and open details here.
  const [sequenceView, setSequenceView] = useState<SequenceView>({
    page: 0, failuresOnly: false, expandedMembers: [], expandedContinuity: [],
  });
  const verification = useCancellableRequest<VerificationState>({ kind: "idle" });
  const inspection = useCancellableRequest<InspectionState>({ kind: "idle" });
  const fieldHelp = useVerificationFieldHelp();
  const feedback = useWorkflowFeedback(activeWorkflow, verification.state, inspection.state);
  const feedbackAnnouncement = feedback.announcement;
  const executionIdInputRef = useRef<HTMLInputElement>(null);
  const executedAtInputRef = useRef<HTMLInputElement>(null);
  const scenarioInputRef = useRef<HTMLSelectElement>(null);
  const observationEvidenceInputRef = useRef<HTMLTextAreaElement>(null);
  const inspectionEvidenceInputRef = useRef<HTMLTextAreaElement>(null);
  const verificationExampleBaselineRef = useRef({ executionId: "", executedAt: "", observationEvidence: "" });
  const inspectionExampleBaselineRef = useRef("");
  // A new request replaces the completed or edited state. Keep that history so
  // edits after a cancelled or failed retry still prompt for a new check.
  const verificationHadResultRef = useRef(false);
  const inspectionHadResultRef = useRef(false);

  function verificationNeedsConfirmation(variant: ExampleVariant) {
    const example = verificationExample(scenarioId || DEFAULT_VERIFICATION_SCENARIO, variant);
    return (["executionId", "executedAt", "observationEvidence"] as const).some(field => wouldReplaceEditedValue(
      verificationInputs[field],
      verificationExampleBaselineRef.current[field],
      example[field],
    ));
  }

  function inspectionNeedsConfirmation(variant: InspectionExampleVariant) {
    return wouldReplaceEditedValue(evidence, inspectionExampleBaselineRef.current, inspectionExample(evidenceType, variant) ?? "");
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

  function changeVerificationInput<Key extends keyof VerificationInputs>(field: Key, value: VerificationInputs[Key]) {
    setVerificationInputs(current => ({ ...current, [field]: value }));
    clearVerificationRequiredError(field);
    clearVerificationResult();
  }

  function clearVerificationResult(inputsChanged = true) {
    const staleHistory = inputsChanged && verificationHadResultRef.current;
    verification.setState(current => current.kind === "dirty" ? current
      : { kind: current.kind === "completed" || staleHistory ? "dirty" : "idle" });
  }

  function clearInspectionResult(inputsChanged = true) {
    const staleHistory = inputsChanged && inspectionHadResultRef.current;
    inspection.setState(current => current.kind === "dirty" ? current
      : { kind: isInspectionComplete(current) || staleHistory ? "dirty" : "idle" });
  }

  function selectEvidenceType(type: EvidenceType) {
    setEvidenceType(type);
    clearInspectionResult();
  }

  function changeInspectionEvidence(value: string) {
    setEvidence(value);
    setInspectionRequiredError(false);
    clearInspectionResult();
  }

  function loadVerificationExample(variant: ExampleVariant) {
    const selectedScenario = scenarioId === "" ? DEFAULT_VERIFICATION_SCENARIO : scenarioId;
    const example = verificationExample(selectedScenario, variant);
    const inputsChanged = executionId !== example.executionId
      || executedAt !== example.executedAt
      || scenarioId !== selectedScenario
      || observationEvidence !== example.observationEvidence;
    verificationExampleBaselineRef.current = example;
    setVerificationInputs({ ...example, scenarioId: selectedScenario });
    setVerificationRequiredErrors({});
    if (inputsChanged || verification.state.kind !== "completed") {
      clearVerificationResult(inputsChanged);
    }
  }

  function loadInspectionExample(variant: InspectionExampleVariant) {
    const example = inspectionExample(evidenceType, variant);
    if (example === undefined) return;
    const inputsChanged = evidence !== example;
    inspectionExampleBaselineRef.current = example;
    setEvidence(example);
    setInspectionRequiredError(false);
    if (inputsChanged || !isInspectionComplete(inspection.state)) {
      clearInspectionResult(inputsChanged);
    }
  }

  function cancelVerification() {
    if (verification.cancel({ kind: "cancelled" })) feedback.verificationTargets.pendingRef.current = true;
  }

  function cancelInspection() {
    if (inspection.cancel({ kind: "cancelled" })) feedback.inspectionTargets.pendingRef.current = true;
  }

  async function verifyObservation(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (verification.state.kind === "loading" || verification.state.kind === "completed") return;

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
    if (verification.state.kind === "dirty") verificationHadResultRef.current = true;
    feedback.verificationTargets.pendingRef.current = true;
    feedback.setAnnouncement("Verifying observation…");
    await verification.run({ kind: "loading" }, signal => verifyObservationRequest(verificationInputs, signal));
  }

  async function inspectEvidence(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inspection.state.kind === "loading" || isInspectionComplete(inspection.state)) return;
    if (!evidence.trim()) {
      setInspectionRequiredError(true);
      inspectionEvidenceInputRef.current?.focus();
      return;
    }
    setInspectionRequiredError(false);
    if (inspection.state.kind === "dirty") inspectionHadResultRef.current = true;
    setSequenceView({ page: 0, failuresOnly: false, expandedMembers: [], expandedContinuity: [] });
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
        <h1>Check what a system reported against what it should have done</h1>
        <p>
          OrbiRig compares recorded command results with a scenario you choose and
          recomputes saved results instead of trusting them.
        </p>
        <p className="field-hint">
          JSON is processed on the server. Use synthetic, non-sensitive data in the public demo.
        </p>
        <ol className="check-flow" aria-label="How a check works">
          <li><strong>Expected behaviour</strong><span>A scenario defined apart from the data.</span></li>
          <li><strong>Recorded result</strong><span>The command and its reported values.</span></li>
          <li><strong>Independent checks</strong><span>Each shows expected and actual values.</span></li>
          <li><strong>Outcome</strong><span>PASS or FAIL for valid input.</span></li>
        </ol>
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
          onClick={() => { if (activeWorkflow !== "verification") fieldHelp.closePinned(); setActiveWorkflow("verification"); }}
        >
          <span>Verify observation</span>
          <small>Compare a recorded result with a scenario.</small>
        </button>
        <button
          type="button"
          className="workflow-choice"
          aria-label="Show Inspect evidence"
          aria-pressed={activeWorkflow === "inspection"}
          onClick={() => { if (activeWorkflow !== "inspection") fieldHelp.closePinned(); setActiveWorkflow("inspection"); }}
        >
          <span>Inspect evidence</span>
          <small>Validate saved records and recheck any verification results they contain.</small>
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
          evidenceHelp={fieldHelp.inspectionEvidence}
          closeFieldHelp={fieldHelp.closePinned}
          evidenceType={evidenceType}
          evidence={evidence}
          state={inspection.state}
          requiredError={inspectionRequiredError}
          evidenceInputRef={inspectionEvidenceInputRef}
          sequenceView={sequenceView}
          onSequenceViewChange={setSequenceView}
          feedback={feedback.inspectionTargets}
          requiresConfirmation={inspectionNeedsConfirmation}
          onEvidenceTypeChange={selectEvidenceType}
          onEvidenceChange={changeInspectionEvidence}
          onLoadExample={loadInspectionExample}
          onSubmit={inspectEvidence}
          onCancel={cancelInspection}
        />
      )}

      <footer className="page-footer">
        <div>
          <p>Example data uses a simplified spacecraft model.</p>
          <p>Built with a Python verification core, FastAPI, React and TypeScript.</p>
        </div>
        <p>
          <DocLink href={LINKS.source}>Source code</DocLink>
        </p>
      </footer>
    </main>
  );
}
