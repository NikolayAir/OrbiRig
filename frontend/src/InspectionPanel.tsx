import type { Dispatch, RefObject, SetStateAction, SubmitEvent } from "react";
import { EvidenceFilePicker, useEvidenceFilePicker } from "./EvidenceFilePicker";
import { ExamplePicker, type ExampleOption } from "./ExamplePicker";
import { FieldHelp } from "./FieldHelp";
import type { InspectionExampleVariant } from "./examples";
import { EvidenceRequestSizeError, RequestError } from "./RequestFeedback";
import { describedBy, preventRepeatedRequestAction } from "./formHelpers";
import type { FeedbackTargets } from "./useWorkflowFeedback";
import type { FieldHelpControl } from "./useVerificationFieldHelp";

import {
  ObservationDetails,
  VerifiedExecutionDetails,
  VerifiedExecutionSequenceDetails,
  type SequenceView,
} from "./EvidenceDetails";
import { INSPECTION_CANCELLED, INSPECTION_INPUTS_CHANGED, inspectionCompletedStatus, invalidEvidenceGuidance, invalidEvidenceMessage, isInspectionComplete } from "./workflowContent";
import type { EvidenceType, InspectionState } from "./workflowTypes";

type Props = {
  evidenceType: EvidenceType;
  evidence: string;
  state: InspectionState;
  requiredError: boolean;
  evidenceInputRef: RefObject<HTMLTextAreaElement | null>;
  sequenceView: SequenceView;
  onSequenceViewChange: Dispatch<SetStateAction<SequenceView>>;
  feedback: FeedbackTargets;
  evidenceHelp: FieldHelpControl;
  requiresConfirmation: (variant: InspectionExampleVariant) => boolean;
  requiresFileConfirmation: (text: string) => boolean;
  onOpenFile: (text: string) => void;
  onEvidenceTypeChange: (type: EvidenceType) => void;
  onEvidenceChange: (value: string) => void;
  onLoadExample: (variant: InspectionExampleVariant) => void;
  onSubmit: (event: SubmitEvent<HTMLFormElement>) => Promise<void>;
  onCancel: () => void;
};

export function InspectionPanel({
  evidenceType, evidence, state: inspection,
  requiredError, evidenceInputRef,
  sequenceView, onSequenceViewChange,
  feedback, evidenceHelp,
  requiresConfirmation, requiresFileConfirmation, onOpenFile,
  onEvidenceTypeChange: selectEvidenceType, onEvidenceChange,
  onLoadExample: loadInspectionExample, onSubmit: inspectEvidence, onCancel: cancelInspection,
}: Props) {
  const {
    containerRef: inspectionFeedbackRef,
    submitRef: inspectionSubmitRef,
    cancelRef: inspectionCancelRef,
  } = feedback;
  const filePicker = useEvidenceFilePicker(requiresFileConfirmation, onOpenFile);
  const inspecting = inspection.kind === "loading";
  const inputsLocked = inspecting || filePicker.state.kind === "reading";

  const completed = isInspectionComplete(inspection);
  const actionStatus = completed ? inspectionCompletedStatus(inspection)
    : inspection.kind === "dirty" ? INSPECTION_INPUTS_CHANGED : undefined;
  const options: ExampleOption<InspectionExampleVariant>[] = [{
    variant: "passing", label: "Standard example",
    description: evidenceType === "observation"
      ? "A valid observation to inspect."
      : "Valid saved evidence with a PASS outcome.",
  }];
  if (evidenceType === "verified-execution-sequence") {
    options.push({
      variant: "long", label: "Long sequence", tone: "negative",
      description: "100 records across 4 pages, including failed telemetry and continuity checks.",
    });
  }
  if (evidenceType !== "observation") {
    options.push({
      variant: "failing", label: "Failing example", tone: "negative",
      description: evidenceType === "verified-execution"
        ? "Valid saved evidence with a FAIL outcome."
        : "Valid saved evidence with a failed check between records.",
    });
  }
  options.push({
    variant: "altered", label: "Altered example", tone: "negative",
    description: evidenceType === "observation"
      ? "OrbiRig rejects the repeated field name."
      : "OrbiRig rejects evidence whose saved checks disagree with the recorded values.",
  });

  return (<section
    className="workflow-panel"
    id="inspection-workflow"
    aria-labelledby="evidence-inspection"
  >
    <div className="workflow-heading">
      <h2 id="evidence-inspection">Inspect evidence</h2>
      <ExamplePicker
        options={options}
        disabled={inputsLocked}
        requiresConfirmation={requiresConfirmation}
        onLoad={variant => {
          if (filePicker.clearFeedback()) loadInspectionExample(variant);
        }}
      />
    </div>

    <form className="inspection-form" noValidate onKeyDown={preventRepeatedRequestAction} onSubmit={event => {
      if (filePicker.clearFeedback()) void inspectEvidence(event);
      else event.preventDefault();
    }}>
      <fieldset
        className="evidence-types"
        disabled={inputsLocked}
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
            <small id="observation-type-description">A command and its reported result.</small>
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
            <small id="execution-type-description">One command run with its scenario and check results.</small>
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
            <small id="sequence-type-description">Two or more verified records with checks between them.</small>
          </span>
        </label>
      </fieldset>

      <div className="inspection-evidence">
        <div className="form-field evidence-input">
          <EvidenceFilePicker picker={filePicker} fieldLabel="Evidence JSON" disabled={inspecting}>
            <label htmlFor="evidence">Evidence JSON</label>
            <FieldHelp control={evidenceHelp} label="Evidence JSON" helpId="inspection-evidence-hint">
              Use Open JSON file (the folder icon) or paste the full document for the selected evidence type.
              Use Load example to choose a sample.
            </FieldHelp>
          </EvidenceFilePicker>
          <textarea
            id="evidence"
            name="evidence"
            ref={evidenceInputRef}
            aria-describedby={describedBy("inspection-evidence-hint", requiredError ? "inspection-evidence-error" : undefined)}
            aria-invalid={requiredError ? true : undefined}
            placeholder="Paste evidence JSON here…"
            value={evidence}
            onChange={event => {
              if (filePicker.clearFeedback()) onEvidenceChange(event.target.value);
            }}
            disabled={inputsLocked}
            spellCheck={false}
            rows={8}
            required
          />
          {requiredError && <p className="field-error" id="inspection-evidence-error" role="alert">Evidence JSON is required.</p>}
        </div>
        <div className="form-actions">
          <button
            ref={inspectionSubmitRef}
            type="submit"
            className="primary-action"
            disabled={inputsLocked || completed}
            data-completed={completed || undefined}
            aria-describedby={actionStatus ? "inspection-action-status" : undefined}
          >
            {inspecting ? "Inspecting…" : "Inspect evidence"}
          </button>
          {inspecting && (
            <button ref={inspectionCancelRef} type="button" name="cancel-request" className="secondary-action" onClick={cancelInspection}>
              Cancel request
            </button>
          )}
          {actionStatus && <p className="action-status" id="inspection-action-status">{actionStatus}</p>}
        </div>
      </div>
    </form>

    <div className="workflow-feedback" ref={inspectionFeedbackRef}>
      {inspection.kind === "cancelled" && (
        <p className="feedback-progress">{INSPECTION_CANCELLED}</p>
      )}

      {inspection.kind === "request-too-large" && <EvidenceRequestSizeError />}

      {inspection.kind === "invalid" && (
        <RequestError title="Invalid evidence" guidance={invalidEvidenceGuidance(inspection.evidenceType)}>
          {inspection.message ?? invalidEvidenceMessage(inspection.evidenceType)}
        </RequestError>
      )}

      {inspection.kind === "transport-failure" && (
        <RequestError title="Inspection unavailable">The inspection request could not be completed. Try again.</RequestError>
      )}

      {inspection.kind === "valid-observation" && (
        <ObservationDetails observation={inspection.observation} />
      )}

      {inspection.kind === "valid-verified-execution" && (
        <VerifiedExecutionDetails record={inspection.record} inspected />
      )}

      {inspection.kind === "valid-verified-execution-sequence" && (
        <VerifiedExecutionSequenceDetails
          sequence={inspection.sequence} view={sequenceView} onViewChange={onSequenceViewChange}
        />
      )}
    </div>
  </section>);
}
