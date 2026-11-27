import { type SubmitEvent, useRef, useState } from "react";
import { AppearanceSettings } from "./AppearanceSettings";
import { DocLink } from "./DocLink";
import { WorkflowHelp } from "./WorkflowHelp";
import { VerificationPanel } from "./VerificationPanel";
import { InspectionPanel } from "./InspectionPanel";
import { OrbitalDiagram } from "./OrbitalDiagram";
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

declare const __ORBIRIG_VERSION__: string;

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
  const verificationInputBaselineRef = useRef({ executionId: "", executedAt: "", observationEvidence: "" });
  const inspectionEvidenceBaselineRef = useRef("");
  // A new request replaces the completed or edited state. Keep that history so
  // edits after a cancelled or failed retry still prompt for a new check.
  const verificationHadResultRef = useRef(false);
  const inspectionHadResultRef = useRef(false);

  function verificationNeedsConfirmation(variant: ExampleVariant) {
    const example = verificationExample(scenarioId || DEFAULT_VERIFICATION_SCENARIO, variant);
    return (["executionId", "executedAt", "observationEvidence"] as const).some(field => wouldReplaceEditedValue(
      verificationInputs[field],
      verificationInputBaselineRef.current[field],
      example[field],
    ));
  }

  function observationNeedsConfirmation(next: string) {
    return wouldReplaceEditedValue(observationEvidence, verificationInputBaselineRef.current.observationEvidence, next);
  }

  function inspectionNeedsConfirmation(next: string) {
    return wouldReplaceEditedValue(evidence, inspectionEvidenceBaselineRef.current, next);
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
    verificationInputBaselineRef.current = example;
    setVerificationInputs({ ...example, scenarioId: selectedScenario });
    setVerificationRequiredErrors({});
    if (inputsChanged || verification.state.kind !== "completed") {
      clearVerificationResult(inputsChanged);
    }
  }

  function replaceObservationEvidence(value: string) {
    const inputsChanged = observationEvidence !== value;
    verificationInputBaselineRef.current = { ...verificationInputBaselineRef.current, observationEvidence: value };
    setVerificationInputs(current => ({ ...current, observationEvidence: value }));
    clearVerificationRequiredError("observationEvidence");
    if (inputsChanged || verification.state.kind !== "completed") {
      clearVerificationResult(inputsChanged);
    }
  }

  function replaceInspectionEvidence(value: string) {
    const inputsChanged = evidence !== value;
    inspectionEvidenceBaselineRef.current = value;
    setEvidence(value);
    setInspectionRequiredError(false);
    if (inputsChanged || !isInspectionComplete(inspection.state)) {
      clearInspectionResult(inputsChanged);
    }
  }

  function loadInspectionExample(variant: InspectionExampleVariant) {
    const example = inspectionExample(evidenceType, variant);
    if (example !== undefined) replaceInspectionEvidence(example);
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
        <div className="header-toolbar">
          <p className="brand">
            <img src="/assets/orbirig-mark.svg#header" width="40" height="40" alt="" />
            <span className="brand-label">
              <span className="brand-name">OrbiRig</span>{" "}
              <span className="brand-version">v{__ORBIRIG_VERSION__}</span>
            </span>
          </p>
          <AppearanceSettings />
        </div>
        <div className="header-intro">
          <div>
            <h1>Check recorded command results</h1>
            <p>
              OrbiRig uses a simplified spacecraft model. NOMINAL is its normal mode
              and SAFE is its protective mode.
            </p>
            <p className="field-hint">
              The browser sends submitted JSON to the server for checking.
              On the public site, use only non-sensitive example data.
            </p>
          </div>
          <OrbitalDiagram />
        </div>
        <ol className="check-flow" aria-label="How a check works">
          <li><strong>Expected behaviour</strong><span>Choose a scenario that says what you expect.</span></li>
          <li><strong>Observation</strong><span>The command and what the program reported.</span></li>
          <li><strong>Verification checks</strong><span>Compare the expected and actual values.</span></li>
          <li><strong>Outcome</strong><span>PASS or FAIL when the input is valid.</span></li>
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
          aria-describedby="verification-workflow-description"
          aria-pressed={activeWorkflow === "verification"}
          onClick={() => { if (activeWorkflow !== "verification") fieldHelp.closePinned(); setActiveWorkflow("verification"); }}
        >
          <span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
              <path d="m3 5 2 2 4-4m-6 9 2 2 4-4m-6 9 2 2 4-4M12 5h9m-9 7h9m-9 7h9" />
            </svg>
            Verify observation
          </span>
          <small id="verification-workflow-description">Compare a recorded result with a scenario.</small>
        </button>
        <button
          type="button"
          className="workflow-choice"
          aria-label="Show Inspect evidence"
          aria-describedby="inspection-workflow-description"
          aria-pressed={activeWorkflow === "inspection"}
          onClick={() => { if (activeWorkflow !== "inspection") fieldHelp.closePinned(); setActiveWorkflow("inspection"); }}
        >
          <span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
              <path d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10Zm0 0v7h7" />
              <circle cx="10.5" cy="13.5" r="2.5" />
              <path d="m12.25 15.25 2.25 2.25" />
            </svg>
            Inspect evidence
          </span>
          <small id="inspection-workflow-description">Read a JSON document and check that any saved results match its data.</small>
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
          requiresFileConfirmation={observationNeedsConfirmation}
          onOpenFile={replaceObservationEvidence}
          onInputChange={changeVerificationInput}
          onLoadExample={loadVerificationExample}
          onSubmit={verifyObservation}
          onCancel={cancelVerification}
        />
      )}

      {activeWorkflow === "inspection" && (
        <InspectionPanel
          evidenceHelp={fieldHelp.inspectionEvidence}
          evidenceType={evidenceType}
          evidence={evidence}
          state={inspection.state}
          requiredError={inspectionRequiredError}
          evidenceInputRef={inspectionEvidenceInputRef}
          sequenceView={sequenceView}
          onSequenceViewChange={setSequenceView}
          feedback={feedback.inspectionTargets}
          requiresConfirmation={variant => inspectionNeedsConfirmation(inspectionExample(evidenceType, variant) ?? "")}
          requiresFileConfirmation={inspectionNeedsConfirmation}
          onOpenFile={replaceInspectionEvidence}
          onEvidenceTypeChange={selectEvidenceType}
          onEvidenceChange={changeInspectionEvidence}
          onLoadExample={loadInspectionExample}
          onSubmit={inspectEvidence}
          onCancel={cancelInspection}
        />
      )}

      <footer className="page-footer">
        <div>
          <p>Built with a Python verification core, FastAPI, React and TypeScript.</p>
        </div>
        <p>
          <DocLink href={LINKS.source}>
            <svg className="doc-link-icon" width="15" height="15" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
              strokeLinejoin="round" aria-hidden="true" focusable="false">
              <path d="m7 7-5 5 5 5m10-10 5 5-5 5M14 4l-4 16" />
            </svg>
            Source code
          </DocLink>
        </p>
      </footer>
    </main>
  );
}
