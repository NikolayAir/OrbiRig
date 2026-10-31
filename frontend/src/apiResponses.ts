// These are HTTP response shapes for display, not the versioned evidence-file formats.

export type PresentationOutcome = "PASS" | "FAIL";

export type ObservationPresentation = {
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

export type VerifiedExecutionPresentation = {
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

export type VerifiedExecutionSequencePresentation = {
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

const VERIFICATION_ERROR_CODES = [
  "invalid_request",
  "invalid_scenario",
  "invalid_observation_evidence",
  "invalid_execution_metadata",
  "scenario_command_mismatch",
] as const;

export type VerificationErrorCode = typeof VERIFICATION_ERROR_CODES[number];

export function verificationErrorCode(
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
    VERIFICATION_ERROR_CODES.includes(code as VerificationErrorCode)
  ) {
    return code as VerificationErrorCode;
  }

  return null;
}

export function isVerifiedExecutionPresentation(
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

export function isObservationPresentation(
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

export function isPresentationOutcome(
  value: unknown,
): value is PresentationOutcome {
  return value === "PASS" || value === "FAIL";
}

export function isVerifiedExecutionSequencePresentation(
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
