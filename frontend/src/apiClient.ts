import {
  isObservationPresentation,
  isVerifiedExecutionPresentation,
  isVerifiedExecutionSequencePresentation,
  verificationErrorCode,
} from "./apiResponses";
import type {
  EvidenceType,
  InspectionState,
  VerificationInputs,
  VerificationState,
} from "./workflowTypes";

const INSPECTION_ENDPOINTS: Record<EvidenceType, string> = {
  observation: "/api/inspect/observation",
  "verified-execution": "/api/inspect/verified-execution",
  "verified-execution-sequence": "/api/inspect/verified-execution-sequence",
};

export async function verifyObservationRequest(
  input: VerificationInputs,
  signal: AbortSignal,
): Promise<VerificationState | null> {
  let response: Response;
  try {
    response = await fetch("/api/verify/observation", {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      // Keep the observation as text inside the request. Parsing it here would
      // hide repeated JSON fields before Python can reject them.
      body: JSON.stringify({
        execution_id: input.executionId,
        executed_at: input.executedAt,
        scenario_id: input.scenarioId,
        observation_evidence: input.observationEvidence,
      }),
    });
  } catch {
    return { kind: "network-failure" };
  }

  // A mock or already-delivered response can arrive despite cancellation.
  // Do not start reading its body when the request has already been abandoned.
  if (signal.aborted) return null;
  if (response.status === 413) return { kind: "request-too-large" };
  if (response.status === 422) {
    try {
      const code = verificationErrorCode(await response.json());
      if (code !== null) return { kind: "validation-failure", code };
    } catch {
      // A malformed error response is a server failure, not invalid user input.
    }
    return { kind: "server-failure" };
  }
  if (!response.ok) return { kind: "server-failure" };
  try {
    const payload: unknown = await response.json();
    return isVerifiedExecutionPresentation(payload)
      ? { kind: "completed", record: payload }
      : { kind: "server-failure" };
  } catch {
    return { kind: "server-failure" };
  }
}

export async function inspectEvidenceRequest(
  evidenceType: EvidenceType,
  evidence: string,
  signal: AbortSignal,
): Promise<InspectionState | null> {
  try {
    const response = await fetch(INSPECTION_ENDPOINTS[evidenceType], {
      method: "POST",
      signal,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
      body: evidence, // Python must receive the exact textarea text.
    });
    if (signal.aborted) return null;
    if (response.status === 413) return { kind: "request-too-large" };
    if (response.status === 422) return { kind: "invalid", evidenceType };
    if (!response.ok) return { kind: "transport-failure" };

    const payload: unknown = await response.json();
    if (evidenceType === "observation") {
      return isObservationPresentation(payload)
        ? { kind: "valid-observation", observation: payload }
        : { kind: "transport-failure" };
    }
    if (evidenceType === "verified-execution") {
      return isVerifiedExecutionPresentation(payload)
        ? { kind: "valid-verified-execution", record: payload }
        : { kind: "transport-failure" };
    }
    return isVerifiedExecutionSequencePresentation(payload)
      ? { kind: "valid-verified-execution-sequence", sequence: payload }
      : { kind: "transport-failure" };
  } catch {
    return { kind: "transport-failure" };
  }
}
