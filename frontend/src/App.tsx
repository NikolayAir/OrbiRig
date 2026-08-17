import { FormEvent, useState } from "react";

type EvidenceType =
  | "observation"
  | "verified-execution"
  | "verified-execution-sequence";

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

const INSPECTION_ENDPOINTS: Record<EvidenceType, string> = {
  observation: "/api/inspect/observation",
  "verified-execution": "/api/inspect/verified-execution",
  "verified-execution-sequence":
    "/api/inspect/verified-execution-sequence",
};

export function App() {
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
        <h1>Evidence inspection</h1>
        <p>
          Select an evidence type and paste its JSON document to inspect the
          reconstructed data.
        </p>
      </header>

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

        <label htmlFor="evidence">{evidenceLabel(evidenceType)}</label>
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
          rows={18}
        />
        <button type="submit" disabled={inspection.kind === "loading"}>
          Inspect evidence
        </button>
      </form>

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

function evidenceLabel(evidenceType: EvidenceType): string {
  if (evidenceType === "observation") {
    return "Observation evidence";
  }
  if (evidenceType === "verified-execution") {
    return "Verified-execution evidence";
  }
  return "Verified-execution-sequence evidence";
}

function invalidEvidenceMessage(evidenceType: EvidenceType): string {
  return `The ${evidenceLabel(evidenceType).toLowerCase()} is invalid.`;
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
        <dt>ScenarioId</dt>
        <dd>{record.execution.scenario_id}</dd>
        <dt>Outcome</dt>
        <dd>{record.outcome}</dd>
      </dl>

      <Subheading>Reconstructed observation</Subheading>
      <ObservationFields observation={record.observation} />

      <Subheading>Invariant results</Subheading>
      <ol>
        {record.invariant_results.map((result, index) => (
          <li key={`${result.invariant_id}-${index}`}>
            <InvariantHeading>{result.invariant_id}</InvariantHeading>
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
}: {
  record: VerifiedExecutionPresentation;
}) {
  return (
    <section aria-labelledby="verified-execution">
      <h2 id="verified-execution">Verified execution</h2>
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
      <ol aria-label="Sequence member records">
        {sequence.records.map((record, index) => {
          const headingId = `sequence-member-${index}`;
          return (
            <li key={`${record.execution.execution_id}-${index}`}>
              <article aria-labelledby={headingId}>
                <h4 id={headingId}>Member {index + 1}</h4>
                <VerifiedExecutionFields record={record} nested />
              </article>
            </li>
          );
        })}
      </ol>

      <h3>Continuity boundaries</h3>
      <ol aria-label="Continuity boundaries">
        {sequence.continuity_results.map((result, index) => {
          const headingId = `continuity-boundary-${index}`;
          return (
            <li
              key={`${result.previous_execution_id}-${result.next_execution_id}-${index}`}
            >
              <article aria-labelledby={headingId}>
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
