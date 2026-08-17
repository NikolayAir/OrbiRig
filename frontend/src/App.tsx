import { FormEvent, useState } from "react";

type EvidenceType = "observation" | "verified-execution";

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

type InspectionState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "valid-observation"; observation: ObservationPresentation }
  | {
      kind: "valid-verified-execution";
      record: VerifiedExecutionPresentation;
    }
  | { kind: "invalid"; evidenceType: EvidenceType }
  | { kind: "transport-failure" };

const INSPECTION_ENDPOINTS: Record<EvidenceType, string> = {
  observation: "/api/inspect/observation",
  "verified-execution": "/api/inspect/verified-execution",
};

export function App() {
  const [evidenceType, setEvidenceType] =
    useState<EvidenceType>("observation");
  const [evidence, setEvidence] = useState("");
  const [inspection, setInspection] = useState<InspectionState>({
    kind: "idle",
  });

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
      } else {
        setInspection({
          kind: "valid-verified-execution",
          record: (await response.json()) as VerifiedExecutionPresentation,
        });
      }
    } catch {
      setInspection({ kind: "transport-failure" });
    }
  }

  const evidenceLabel =
    evidenceType === "observation"
      ? "Observation evidence"
      : "Verified-execution evidence";

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
              onChange={() => {
                setEvidenceType("observation");
                setInspection({ kind: "idle" });
              }}
            />
            Observation
          </label>
          <label>
            <input
              type="radio"
              name="evidence-type"
              value="verified-execution"
              checked={evidenceType === "verified-execution"}
              onChange={() => {
                setEvidenceType("verified-execution");
                setInspection({ kind: "idle" });
              }}
            />
            Verified execution
          </label>
        </fieldset>

        <label htmlFor="evidence">{evidenceLabel}</label>
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
        <p role="alert">
          {inspection.evidenceType === "observation"
            ? "The observation evidence is invalid."
            : "The verified-execution evidence is invalid."}
        </p>
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
    </main>
  );
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

function VerifiedExecutionDetails({
  record,
}: {
  record: VerifiedExecutionPresentation;
}) {
  return (
    <section aria-labelledby="verified-execution">
      <h2 id="verified-execution">Verified execution</h2>
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

      <h3>Reconstructed observation</h3>
      <ObservationFields observation={record.observation} />

      <h3>Invariant results</h3>
      <ol>
        {record.invariant_results.map((result, index) => (
          <li key={`${result.invariant_id}-${index}`}>
            <h4>{result.invariant_id}</h4>
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
    </section>
  );
}

function formatInvariantValue(value: boolean | string): string {
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return value;
}
