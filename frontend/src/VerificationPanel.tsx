import type { RefObject, SubmitEvent } from "react";
import { LoadExampleButton } from "./LoadExampleButton";
import { EvidenceRequestSizeError, RequestError } from "./RequestFeedback";
import { describedBy, preventRepeatedRequestAction } from "./formHelpers";
import type { FeedbackTargets } from "./useWorkflowFeedback";

import { FieldHelp } from "./FieldHelp";
import { VerifiedExecutionDetails } from "./EvidenceDetails";
import type { ExampleVariant } from "./examples";
import {
  SUPPORTED_SCENARIOS,
  VERIFICATION_CANCELLED,
  VERIFICATION_ERROR_GUIDANCE,
  VERIFICATION_ERROR_MESSAGES,
  VERIFICATION_INPUTS_CHANGED,
} from "./workflowContent";
import type {
  ScenarioId,
  VerificationInputs,
  VerificationRequiredErrors,
  VerificationState,
} from "./workflowTypes";
import type { useVerificationFieldHelp } from "./useVerificationFieldHelp";

type Props = {
  input: VerificationInputs;
  state: VerificationState;
  errors: VerificationRequiredErrors;
  inputRefs: {
    executionId: RefObject<HTMLInputElement | null>;
    executedAt: RefObject<HTMLInputElement | null>;
    scenarioId: RefObject<HTMLSelectElement | null>;
    observationEvidence: RefObject<HTMLTextAreaElement | null>;
  };
  feedback: FeedbackTargets;
  fieldHelp: ReturnType<typeof useVerificationFieldHelp>;
  requiresConfirmation: (variant: ExampleVariant) => boolean;
  onInputChange: <Key extends keyof VerificationInputs>(field: Key, value: VerificationInputs[Key]) => void;
  onLoadExample: (variant: ExampleVariant) => void;
  onSubmit: (event: SubmitEvent<HTMLFormElement>) => Promise<void>;
  onCancel: () => void;
};

export function VerificationPanel({
  input,
  state: verification, errors: verificationRequiredErrors,
  inputRefs,
  feedback,
  fieldHelp, requiresConfirmation: verificationNeedsConfirmation, onInputChange,
  onLoadExample: loadVerificationExample, onSubmit: verifyObservation, onCancel: cancelVerification,
}: Props) {
  const { executionId, executedAt, scenarioId, observationEvidence } = input;
  const {
    executionId: executionIdInputRef,
    executedAt: executedAtInputRef,
    scenarioId: scenarioInputRef,
    observationEvidence: observationEvidenceInputRef,
  } = inputRefs;
  const {
    containerRef: verificationFeedbackRef,
    submitRef: verificationSubmitRef,
    cancelRef: verificationCancelRef,
  } = feedback;
  // A completed result already belongs to these inputs: the same check would repeat it exactly.
  const completed = verification.kind === "completed";
  const actionStatus = completed ? "Verification completed."
    : verification.kind === "dirty" ? VERIFICATION_INPUTS_CHANGED : undefined;

  return (<section
    className="workflow-panel"
    id="verification-workflow"
    aria-labelledby="observation-verification"
  >
    <div className="workflow-heading">
      <h2 id="observation-verification">Verify observation</h2>
      <div className="example-actions">
        <LoadExampleButton
          description="Replaces current inputs"
          disabled={verification.kind === "loading"}
          requiresConfirmation={verificationNeedsConfirmation("passing")}
          onLoad={() => loadVerificationExample("passing")}
        />
        <LoadExampleButton
          label="Load failing example"
          tone="negative"
          description="Telemetry disagrees with the recorded state. Replaces current inputs"
          disabled={verification.kind === "loading"}
          requiresConfirmation={verificationNeedsConfirmation("failing")}
          onLoad={() => loadVerificationExample("failing")}
        />
      </div>
    </div>

    <form
      className="verification-form"
      noValidate
      onKeyDown={preventRepeatedRequestAction}
      onSubmit={verifyObservation}
    >
      <fieldset
        className="verification-inputs"
        disabled={verification.kind === "loading"}
      >
        <legend className="visually-hidden">Verification input</legend>

        <div className="metadata-fields">
          <div className="form-field">
            <div className="field-label">
              <label htmlFor="verification-execution-id">
                Execution ID
              </label>
              <FieldHelp control={fieldHelp.executionId} label="Execution ID" helpId="execution-id-help-description">
                A label you choose for this recorded command, such as run-001.
                It is saved with the result.
              </FieldHelp>
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
              onChange={(event) => onInputChange("executionId", event.target.value)}
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
              onChange={(event) => onInputChange("executedAt", event.target.value)}
              placeholder="YYYY-MM-DDTHH:MM:SSZ"
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
            <FieldHelp control={fieldHelp.scenario} label="Scenario" helpId="scenario-help-description">
              Choose the expected behaviour for this command execution.
              OrbiRig checks the observation against this scenario.
            </FieldHelp>
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
            onChange={(event) => onInputChange("scenarioId", event.target.value as ScenarioId | "")}
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
          <div className="field-label">
            <label htmlFor="verification-observation-evidence">Observation evidence JSON</label>
            <FieldHelp control={fieldHelp.observationEvidence} label="Observation evidence JSON" helpId="verification-observation-hint">
              Include the command, whether it was accepted (acknowledgement), the operating mode before and after
              the command was handled, and the separately reported mode (telemetry).
            </FieldHelp>
          </div>
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
            onChange={(event) => onInputChange("observationEvidence", event.target.value)}
            disabled={verification.kind === "loading"}
            spellCheck={false}
            rows={7}
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
            ref={verificationSubmitRef}
            type="submit"
            className="primary-action"
            disabled={verification.kind === "loading" || completed}
            data-completed={completed || undefined}
            aria-describedby={actionStatus ? "verification-action-status" : undefined}
          >
            {verification.kind === "loading" ? "Verifying…" : "Verify observation"}
          </button>
          {verification.kind === "loading" && (
            <button ref={verificationCancelRef} type="button" name="cancel-request" className="secondary-action" onClick={cancelVerification}>
              Cancel request
            </button>
          )}
          {actionStatus && <p className="action-status" id="verification-action-status">{actionStatus}</p>}
        </div>
      </div>
    </form>

    <div className="workflow-feedback" ref={verificationFeedbackRef}>
      {verification.kind === "cancelled" && (
        <p className="feedback-progress">{VERIFICATION_CANCELLED}</p>
      )}

      {verification.kind === "request-too-large" && <EvidenceRequestSizeError />}

      {verification.kind === "validation-failure" && (
        <RequestError title="Input error" guidance={VERIFICATION_ERROR_GUIDANCE[verification.code]}>
          {VERIFICATION_ERROR_MESSAGES[verification.code]}
        </RequestError>
      )}

      {verification.kind === "network-failure" && (
        <RequestError title="Verification unavailable">The verification request could not reach the server. Try again.</RequestError>
      )}

      {verification.kind === "server-failure" && (
        <RequestError title="Verification unavailable">The server could not complete verification. Try again.</RequestError>
      )}

      {verification.kind === "completed" && (
        <VerifiedExecutionDetails
          record={verification.record}
          headingId="verified-observation-result"
        />
      )}
    </div>
  </section>);
}
