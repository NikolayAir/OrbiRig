import type { Dispatch, RefObject, SetStateAction, SubmitEvent } from "react";
import { WorkflowTitle } from "./WorkflowTitle";
import { LoadExampleButton } from "./LoadExampleButton";
import { EvidenceRequestSizeError, RequestError } from "./RequestFeedback";
import { describedBy, preventRepeatedRequestAction } from "./formHelpers";
import type { FeedbackTargets } from "./useWorkflowFeedback";

import {
  ObservationDetails,
  VerifiedExecutionDetails,
  VerifiedExecutionSequenceDetails,
  type SequenceView,
} from "./EvidenceDetails";
import { INSPECTION_CANCELLED, INSPECTION_INPUTS_CHANGED, invalidEvidenceMessage, isInspectionComplete } from "./workflowContent";
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
  requiresConfirmation: boolean;
  onEvidenceTypeChange: (type: EvidenceType) => void;
  onEvidenceChange: (value: string) => void;
  onLoadExample: () => void;
  onSubmit: (event: SubmitEvent<HTMLFormElement>) => Promise<void>;
  onCancel: () => void;
};

export function InspectionPanel({
  evidenceType, evidence, state: inspection,
  requiredError, evidenceInputRef,
  sequenceView, onSequenceViewChange,
  feedback,
  requiresConfirmation, onEvidenceTypeChange: selectEvidenceType, onEvidenceChange,
  onLoadExample: loadInspectionExample, onSubmit: inspectEvidence, onCancel: cancelInspection,
}: Props) {
  const {
    containerRef: inspectionFeedbackRef,
    submitRef: inspectionSubmitRef,
    cancelRef: inspectionCancelRef,
  } = feedback;
  const completed = isInspectionComplete(inspection);
  const actionStatus = completed ? "Inspection completed. Evidence is valid."
    : inspection.kind === "dirty" ? INSPECTION_INPUTS_CHANGED : undefined;

  return (<section
    className="workflow-panel"
    id="inspection-workflow"
    aria-labelledby="evidence-inspection"
  >
    <div className="workflow-heading">
      <WorkflowTitle
        headingId="evidence-inspection"
        helpId="inspection-help-description"
        title="Inspect evidence"
        description="Select an evidence type and paste its JSON to see the recorded values and any saved verification results."
      />
      <LoadExampleButton
        description="Replaces evidence JSON"
        disabled={inspection.kind === "loading"}
        requiresConfirmation={requiresConfirmation}
        onLoad={loadInspectionExample}
      />
    </div>

    <form className="inspection-form" noValidate onKeyDown={preventRepeatedRequestAction} onSubmit={inspectEvidence}>
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
            <small id="execution-type-description">1 execution with its scenario and checks.</small>
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

      <div className="inspection-evidence">
        <div className="form-field evidence-input">
          <label htmlFor="evidence">Evidence JSON</label>
          <p className="field-hint" id="inspection-evidence-hint">
            Paste the complete document for the selected evidence type.
          </p>
          <textarea
            id="evidence"
            name="evidence"
            ref={evidenceInputRef}
            aria-describedby={describedBy("inspection-evidence-hint", requiredError ? "inspection-evidence-error" : undefined)}
            aria-invalid={requiredError ? true : undefined}
            value={evidence}
            onChange={(event) => onEvidenceChange(event.target.value)}
            disabled={inspection.kind === "loading"}
            spellCheck={false}
            rows={7}
            required
          />
          {requiredError && <p className="field-error" id="inspection-evidence-error" role="alert">Evidence JSON is required.</p>}
        </div>
        <div className="form-actions">
          <button
            ref={inspectionSubmitRef}
            type="submit"
            className="primary-action"
            disabled={inspection.kind === "loading"}
            aria-describedby={actionStatus ? "inspection-action-status" : undefined}
          >
            {inspection.kind === "loading" ? "Inspecting…" : completed || inspection.kind === "dirty" ? "Inspect again" : "Inspect evidence"}
          </button>
          {inspection.kind === "loading" && (
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
        <RequestError title="Invalid evidence">{invalidEvidenceMessage(inspection.evidenceType)}</RequestError>
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
