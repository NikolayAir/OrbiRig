import { FormEvent, useState } from "react";

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

type InspectionState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "valid"; observation: ObservationPresentation }
  | { kind: "invalid" }
  | { kind: "transport-failure" };

const INSPECTION_ENDPOINT = "/api/inspect/observation";

export function App() {
  const [evidence, setEvidence] = useState("");
  const [inspection, setInspection] = useState<InspectionState>({
    kind: "idle",
  });

  async function inspectEvidence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setInspection({ kind: "loading" });

    try {
      const response = await fetch(INSPECTION_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
        },
        body: evidence,
      });

      if (response.status === 422) {
        setInspection({ kind: "invalid" });
        return;
      }

      if (!response.ok) {
        setInspection({ kind: "transport-failure" });
        return;
      }

      setInspection({
        kind: "valid",
        observation: (await response.json()) as ObservationPresentation,
      });
    } catch {
      setInspection({ kind: "transport-failure" });
    }
  }

  return (
    <main>
      <header>
        <p className="eyebrow">OrbiRig</p>
        <h1>Observation evidence inspection</h1>
        <p>
          Paste observation evidence to inspect the reconstructed command, states, acknowledgement, and telemetry.
        </p>
      </header>

      <form onSubmit={inspectEvidence}>
        <label htmlFor="observation-evidence">Observation evidence</label>
        <textarea
          id="observation-evidence"
          name="observation-evidence"
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
        <p role="alert">The observation evidence is invalid.</p>
      )}

      {inspection.kind === "transport-failure" && (
        <p role="alert">
          The inspection request could not be completed. Try again.
        </p>
      )}

      {inspection.kind === "valid" && (
        <ObservationDetails observation={inspection.observation} />
      )}
    </main>
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
    </section>
  );
}
