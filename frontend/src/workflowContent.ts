import type { VerificationErrorCode } from "./apiResponses";

import type {
  EvidenceType,
  InspectionState,
  ScenarioId,
  VerificationRequiredField,
} from "./workflowTypes";

export const SUPPORTED_SCENARIOS: Array<{ value: ScenarioId; label: string }> = [
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

export const VERIFICATION_ERROR_MESSAGES: Record<VerificationErrorCode, string> = {
  invalid_request: "The verification request is invalid.",
  invalid_scenario: "Select a supported scenario.",
  invalid_observation_evidence: "The observation evidence is invalid.",
  invalid_execution_metadata: "The execution ID or UTC execution time is invalid.",
  scenario_command_mismatch:
    "The observation command does not match the selected scenario.",
};

export const REQUIRED_VERIFICATION_MESSAGES: Record<
  VerificationRequiredField,
  string
> = {
  executionId: "Execution ID is required.",
  executedAt: "Execution time (UTC) is required.",
  scenarioId: "Select a supported scenario.",
  observationEvidence: "Observation evidence is required.",
};

export const DEFAULT_VERIFICATION_SCENARIO: ScenarioId = "nominal_to_safe_mode";

export const VERIFICATION_CANCELLED = "Verification request cancelled. Your inputs are kept.";

export const INSPECTION_CANCELLED = "Inspection request cancelled. Your inputs are kept.";

export function evidenceTypeName(evidenceType: EvidenceType): string {
  if (evidenceType === "observation") {
    return "observation evidence";
  }
  if (evidenceType === "verified-execution") {
    return "verified-execution evidence";
  }
  return "verified-execution-sequence evidence";
}

export function invalidEvidenceMessage(evidenceType: EvidenceType): string {
  return `The ${evidenceTypeName(evidenceType)} is invalid.`;
}

export function inspectionAnnouncement(inspection: InspectionState): string {
  switch (inspection.kind) {
    case "valid-observation":
      return "Inspection completed. Valid observation evidence. No scenario verification was performed.";
    case "valid-verified-execution":
      return `Inspection completed. Valid verified execution evidence. Verification outcome: ${inspection.record.outcome}.`;
    case "valid-verified-execution-sequence":
      return `Inspection completed. Valid verified execution sequence evidence. Sequence outcome: ${inspection.sequence.outcome}.`;
    default:
      // Request errors already have their own alert.
      return "";
  }
}
