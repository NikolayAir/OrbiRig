import { FormEvent, useState } from "react";

type EvidenceType =
  | "observation"
  | "verified-execution"
  | "verified-execution-sequence";

type ScenarioId =
  | "nominal_to_safe_mode"
  | "nominal_to_nominal_rejection"
  | "safe_to_nominal_mode";

type VerificationErrorCode =
  | "invalid_request"
  | "invalid_scenario"
  | "invalid_observation_evidence"
  | "invalid_execution_metadata"
  | "scenario_command_mismatch";

type ObservationPresentation = {
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

type VerifiedExecutionPresentation = {
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
  outcome: string;
};

type VerifiedExecutionSequencePresentation = {
  records: VerifiedExecutionPresentation[];
  continuity_results: Array<{
    previous_execution_id: string;
    next_execution_id: string;
    expected_operating_mode: string;
    observed_operating_mode: string;
    passed: boolean;
  }>;
  outcome: string;
};

type InspectionState =
  | { kind: "idle" }
  | { kind: "loading" }
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
  | { kind: "transport-failure" };

type VerificationState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "completed"; record: VerifiedExecutionPresentation }
  | { kind: "validation-failure"; code: VerificationErrorCode }
  | { kind: "network-failure" }
  | { kind: "server-failure" };

const INSPECTION_ENDPOINTS: Record<EvidenceType, string> = {
  observation: "/api/inspect/observation",
  "verified-execution": "/api/inspect/verified-execution",
  "verified-execution-sequence":
    "/api/inspect/verified-execution-sequence",
};

const INVARIANT_TITLES: Record<string, string> = {
  pre_state_matches_expected: "Pre-state matches expected",
  acknowledgement_is_accepted: "Acknowledgement is accepted",
  acknowledgement_is_rejected: "Acknowledgement is rejected",
  post_state_matches_requested_mode: "Post-state matches requested mode",
  post_state_matches_pre_state: "Post-state matches pre-state",
  telemetry_matches_post_state: "Telemetry matches post-state",
};

const SUPPORTED_SCENARIOS: Array<{ value: ScenarioId; label: string }> = [
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

const VERIFICATION_ERROR_MESSAGES: Record<VerificationErrorCode, string> = {
  invalid_request: "The verification request is invalid.",
  invalid_scenario: "Select a supported scenario.",
  invalid_observation_evidence: "The observation evidence is invalid.",
  invalid_execution_metadata: "The execution metadata is invalid.",
  scenario_command_mismatch:
    "The observation command does not match the selected scenario.",
};

export function App() {
  const [executionId, setExecutionId] = useState("");
  const [executedAt, setExecutedAt] = useState("");
  const [scenarioId, setScenarioId] = useState<ScenarioId | "">("");
  const [observationEvidence, setObservationEvidence] = useState("");
  const [verification, setVerification] = useState<VerificationState>({
    kind: "idle",
  });
  const [evidenceType, setEvidenceType] =
    useState<EvidenceType>("observation");
  const [evidence, setEvidence] = useState("");
  const [inspection, setInspection] = useState<InspectionState>({
    kind: "idle",
  });

  function selectEvidenceType(selectedType: EvidenceType) {
    setEvidenceType(selectedType);
    setInspection({ kind: "idle" });
  }

  async function verifyObservation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setVerification({ kind: "loading" });

    let response: Response;

    try {
      response = await fetch("/api/verify/observation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          execution_id: executionId,
          executed_at: executedAt,
          scenario_id: scenarioId,
          observation_evidence: observationEvidence,
        }),
      });
    } catch {
      setVerification({ kind: "network-failure" });
      return;
    }

    if (response.status === 422) {
      try {
        const code = verificationErrorCode(await response.json());

        if (code !== null) {
          setVerification({ kind: "validation-failure", code });
          return;
        }
      } catch {
        // An invalid error response is an unexpected server failure.
      }

      setVerification({ kind: "server-failure" });
      return;
    }

    if (!response.ok) {
      setVerification({ kind: "server-failure" });
      return;
    }

    try {
      const payload: unknown = await response.json();

      if (!isVerifiedExecutionPresentation(payload)) {
        setVerification({ kind: "server-failure" });
        return;
      }

      setVerification({
        kind: "completed",
        record: payload,
      });
    } catch {
      setVerification({ kind: "server-failure" });
    }
  }

  async function inspectEvidence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setInspection({ kind: "loading" });

    try {
      const response = await fetch(INSPECTION_ENDPOINTS[evidenceType], {
        method: "POST",
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
        },
        body: evidence,
      });

      if (response.status === 422) {
        setInspection({ kind: "invalid", evidenceType });
        return;
      }

      if (!response.ok) {
        setInspection({ kind: "transport-failure" });
        return;
      }

      if (evidenceType === "observation") {
        setInspection({
          kind: "valid-observation",
          observation: (await response.json()) as ObservationPresentation,
        });
        return;
      }

      if (evidenceType === "verified-execution") {
        setInspection({
          kind: "valid-verified-execution",
          record: (await response.json()) as VerifiedExecutionPresentation,
        });
        return;
      }

      setInspection({
        kind: "valid-verified-execution-sequence",
        sequence:
          (await response.json()) as VerifiedExecutionSequencePresentation,
      });
    } catch {
      setInspection({ kind: "transport-failure" });
    }
  }

  return (
    <main>
      <header>
        <p className="eyebrow">OrbiRig</p>
        <h1>Observation verification and evidence inspection</h1>
        <p>
          Verify submitted observations against explicit scenarios or inspect
          existing evidence without changing it.
        </p>
      </header>

      <section className="workflow" aria-labelledby="observation-verification">
        <h2 id="observation-verification">Verify observation</h2>
        <p>
          Provide execution metadata, select a supported scenario, and submit
          raw observation evidence for canonical verification.
        </p>

        <form onSubmit={verifyObservation}>
          <fieldset disabled={verification.kind === "loading"}>
            <legend>Verification input</legend>

            <label htmlFor="verification-execution-id">Execution ID</label>
            <input
              id="verification-execution-id"
              value={executionId}
              onChange={(event) => {
                setExecutionId(event.target.value);
                setVerification({ kind: "idle" });
              }}
              required
            />

            <label htmlFor="verification-executed-at">
              UTC execution timestamp
            </label>
            <input
              id="verification-executed-at"
              value={executedAt}
              onChange={(event) => {
                setExecutedAt(event.target.value);
                setVerification({ kind: "idle" });
              }}
              placeholder="2026-08-25T18:30:00Z"
              required
            />

            <label htmlFor="verification-scenario">Scenario ID</label>
            <select
              id="verification-scenario"
              value={scenarioId}
              onChange={(event) => {
                setScenarioId(event.target.value as ScenarioId | "");
                setVerification({ kind: "idle" });
              }}
              required
            >
              <option value="">Select a supported scenario</option>
              {SUPPORTED_SCENARIOS.map((scenario) => (
                <option key={scenario.value} value={scenario.value}>
                  {scenario.label} ({scenario.value})
                </option>
              ))}
            </select>

            <label htmlFor="verification-observation-evidence">
              Observation evidence JSON
            </label>
            <textarea
              id="verification-observation-evidence"
              value={observationEvidence}
              onChange={(event) => {
                setObservationEvidence(event.target.value);
                setVerification({ kind: "idle" });
              }}
              spellCheck={false}
              rows={12}
              required
            />
          </fieldset>

          <button type="submit" disabled={verification.kind === "loading"}>
            Verify observation
          </button>
        </form>

        {verification.kind === "loading" && (
          <p role="status">Verifying observation…</p>
        )}

        {verification.kind === "validation-failure" && (
          <p role="alert">{VERIFICATION_ERROR_MESSAGES[verification.code]}</p>
        )}

        {verification.kind === "network-failure" && (
          <p role="alert">
            The verification request could not reach the server. Try again.
          </p>
        )}

        {verification.kind === "server-failure" && (
          <p role="alert">
            The server could not complete verification. Try again.
          </p>
        )}

        {verification.kind === "completed" && (
          <VerifiedExecutionDetails
            record={verification.record}
            headingId="verified-observation-result"
          />
        )}
      </section>

      <section className="workflow" aria-labelledby="evidence-inspection">
        <h2 id="evidence-inspection">Inspect evidence</h2>
        <p>
          Select an evidence type and paste its JSON document to inspect the
          reconstructed data.
        </p>

        <form onSubmit={inspectEvidence}>
          <fieldset disabled={inspection.kind === "loading"}>
            <legend>Evidence type</legend>
            <label>
              <input
                type="radio"
                name="evidence-type"
                value="observation"
                checked={evidenceType === "observation"}
                onChange={() => selectEvidenceType("observation")}
              />
              Observation
            </label>
            <label>
              <input
                type="radio"
                name="evidence-type"
                value="verified-execution"
                checked={evidenceType === "verified-execution"}
                onChange={() => selectEvidenceType("verified-execution")}
              />
              Verified execution
            </label>
            <label>
              <input
                type="radio"
                name="evidence-type"
                value="verified-execution-sequence"
                checked={evidenceType === "verified-execution-sequence"}
                onChange={() =>
                  selectEvidenceType("verified-execution-sequence")
                }
              />
              Verified execution sequence
            </label>
          </fieldset>

          <label htmlFor="evidence">Evidence JSON</label>
          <textarea
            id="evidence"
            name="evidence"
            value={evidence}
            onChange={(event) => {
              setEvidence(event.target.value);
              setInspection({ kind: "idle" });
            }}
            disabled={inspection.kind === "loading"}
            spellCheck={false}
            rows={12}
          />
          <button type="submit" disabled={inspection.kind === "loading"}>
            Inspect evidence
          </button>
        </form>
      </section>

      {inspection.kind === "loading" && (
        <p role="status">Inspecting evidence…</p>
      )}

      {inspection.kind === "invalid" && (
        <p role="alert">{invalidEvidenceMessage(inspection.evidenceType)}</p>
      )}

      {inspection.kind === "transport-failure" && (
        <p role="alert">
          The inspection request could not be completed. Try again.
        </p>
      )}

      {inspection.kind === "valid-observation" && (
        <ObservationDetails observation={inspection.observation} />
      )}

      {inspection.kind === "valid-verified-execution" && (
        <VerifiedExecutionDetails record={inspection.record} />
      )}

      {inspection.kind === "valid-verified-execution-sequence" && (
        <VerifiedExecutionSequenceDetails sequence={inspection.sequence} />
      )}
    </main>
  );
}

function evidenceTypeName(evidenceType: EvidenceType): string {
  if (evidenceType === "observation") {
    return "observation evidence";
  }
  if (evidenceType === "verified-execution") {
    return "verified-execution evidence";
  }
  return "verified-execution-sequence evidence";
}

function invalidEvidenceMessage(evidenceType: EvidenceType): string {
  return `The ${evidenceTypeName(evidenceType)} is invalid.`;
}

function verificationErrorCode(
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
    Object.hasOwn(VERIFICATION_ERROR_MESSAGES, code)
  ) {
    return code as VerificationErrorCode;
  }

  return null;
}

function isVerifiedExecutionPresentation(
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
    !isObject(observation) ||
    !isObject(observation.command) ||
    typeof observation.command.command_type !== "string" ||
    typeof observation.command.target_mode !== "string" ||
    !isObject(observation.pre_state) ||
    typeof observation.pre_state.operating_mode !== "string" ||
    !isObject(observation.acknowledgement) ||
    typeof observation.acknowledgement.accepted !== "boolean" ||
    !isObject(observation.post_state) ||
    typeof observation.post_state.operating_mode !== "string" ||
    !isObject(observation.telemetry) ||
    typeof observation.telemetry.operating_mode !== "string" ||
    !Array.isArray(results) ||
    typeof outcome !== "string"
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

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function ObservationFields({
  observation,
}: {
  observation: ObservationPresentation;
}) {
  return (
    <dl>
      <dt>Command type</dt>
      <dd>{observation.command.command_type}</dd>
      <dt>Target mode</dt>
      <dd>{observation.command.target_mode}</dd>
      <dt>Pre-state operating mode</dt>
      <dd>{observation.pre_state.operating_mode}</dd>
      <dt>Acknowledgement</dt>
      <dd>{observation.acknowledgement.accepted ? "Accepted" : "Rejected"}</dd>
      <dt>Post-state operating mode</dt>
      <dd>{observation.post_state.operating_mode}</dd>
      <dt>Telemetry operating mode</dt>
      <dd>{observation.telemetry.operating_mode}</dd>
    </dl>
  );
}

function ObservationDetails({
  observation,
}: {
  observation: ObservationPresentation;
}) {
  return (
    <section aria-labelledby="reconstructed-observation">
      <h2 id="reconstructed-observation">Reconstructed observation</h2>
      <ObservationFields observation={observation} />
    </section>
  );
}

function VerifiedExecutionFields({
  record,
  nested = false,
}: {
  record: VerifiedExecutionPresentation;
  nested?: boolean;
}) {
  const Subheading = nested ? "h5" : "h3";
  const InvariantHeading = nested ? "h6" : "h4";

  return (
    <>
      <dl>
        <dt>Execution ID</dt>
        <dd>{record.execution.execution_id}</dd>
        <dt>UTC execution timestamp</dt>
        <dd>{record.execution.executed_at}</dd>
        <dt>Scenario ID</dt>
        <dd>{record.execution.scenario_id}</dd>
        <dt>Outcome</dt>
        <dd>{record.outcome}</dd>
      </dl>

      <Subheading>Reconstructed observation</Subheading>
      <ObservationFields observation={record.observation} />

      <Subheading>Invariant results</Subheading>
      <ol className="invariant-results">
        {record.invariant_results.map((result, index) => (
          <li key={`${result.invariant_id}-${index}`}>
            <InvariantHeading className="invariant-title">
              {Object.hasOwn(INVARIANT_TITLES, result.invariant_id)
                ? INVARIANT_TITLES[result.invariant_id]
                : "Invariant result"}
            </InvariantHeading>
            <p className="invariant-id">
              <code>{result.invariant_id}</code>
            </p>
            <dl>
              <dt>Expected</dt>
              <dd>{formatInvariantValue(result.expected)}</dd>
              <dt>Actual</dt>
              <dd>{formatInvariantValue(result.actual)}</dd>
              <dt>Result</dt>
              <dd>{result.passed ? "PASS" : "FAIL"}</dd>
            </dl>
          </li>
        ))}
      </ol>
    </>
  );
}

function VerifiedExecutionDetails({
  record,
  headingId = "verified-execution",
}: {
  record: VerifiedExecutionPresentation;
  headingId?: string;
}) {
  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId}>Verified execution</h2>
      <VerifiedExecutionFields record={record} />
    </section>
  );
}

function VerifiedExecutionSequenceDetails({
  sequence,
}: {
  sequence: VerifiedExecutionSequencePresentation;
}) {
  return (
    <section aria-labelledby="verified-execution-sequence">
      <h2 id="verified-execution-sequence">Verified execution sequence</h2>
      <dl>
        <dt>Sequence outcome</dt>
        <dd>{sequence.outcome}</dd>
      </dl>

      <h3>Member records</h3>
      <ol
        className="sequence-members"
        aria-label="Sequence member records"
        role="list"
      >
        {sequence.records.map((record, index) => {
          const headingId = `sequence-member-${index}`;
          return (
            <li key={`${record.execution.execution_id}-${index}`}>
              <article className="sequence-member" aria-labelledby={headingId}>
                <h4 id={headingId}>Member {index + 1}</h4>
                <VerifiedExecutionFields record={record} nested />
              </article>
            </li>
          );
        })}
      </ol>

      <h3>Continuity boundaries</h3>
      <ol
        className="continuity-boundaries"
        aria-label="Continuity boundaries"
        role="list"
      >
        {sequence.continuity_results.map((result, index) => {
          const headingId = `continuity-boundary-${index}`;
          return (
            <li
              key={`${result.previous_execution_id}-${result.next_execution_id}-${index}`}
            >
              <article
                className="continuity-boundary"
                aria-labelledby={headingId}
              >
                <h4 id={headingId}>Boundary {index + 1}</h4>
                <dl>
                  <dt>Previous execution ID</dt>
                  <dd>{result.previous_execution_id}</dd>
                  <dt>Next execution ID</dt>
                  <dd>{result.next_execution_id}</dd>
                  <dt>Expected operating mode</dt>
                  <dd>{result.expected_operating_mode}</dd>
                  <dt>Observed operating mode</dt>
                  <dd>{result.observed_operating_mode}</dd>
                  <dt>Result</dt>
                  <dd>{result.passed ? "PASS" : "FAIL"}</dd>
                </dl>
              </article>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function formatInvariantValue(value: boolean | string): string {
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return value;
}
