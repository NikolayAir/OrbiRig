import type {
  ObservationPresentation,
  VerifiedExecutionPresentation,
  VerifiedExecutionSequencePresentation,
  VerificationErrorCode,
} from "./apiResponses";

export type EvidenceType =
  | "observation"
  | "verified-execution"
  | "verified-execution-sequence";

export type Workflow = "verification" | "inspection";

export type ScenarioId =
  | "nominal_to_safe_mode"
  | "nominal_to_nominal_rejection"
  | "safe_to_nominal_mode";

export type VerificationRequiredField =
  | "executionId"
  | "executedAt"
  | "scenarioId"
  | "observationEvidence";

export type VerificationRequiredErrors = Partial<
  Record<VerificationRequiredField, string>
>;

export type InspectionState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "cancelled" }
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
  | { kind: "request-too-large" }
  | { kind: "transport-failure" };

export type VerificationState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "cancelled" }
  | { kind: "completed"; record: VerifiedExecutionPresentation }
  | { kind: "validation-failure"; code: VerificationErrorCode }
  | { kind: "request-too-large" }
  | { kind: "network-failure" }
  | { kind: "server-failure" };

export type VerificationInputs = {
  executionId: string;
  executedAt: string;
  scenarioId: ScenarioId | "";
  observationEvidence: string;
};
