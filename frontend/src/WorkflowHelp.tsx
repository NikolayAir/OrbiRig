import { useEffect, useRef, useState } from "react";

type HelpSection = "browser" | "cli";

export function WorkflowHelp() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [help, setHelp] = useState<{
    section: HelpSection;
    trigger: HTMLButtonElement;
  } | null>(null);
  const section = help?.section;

  useEffect(() => {
    if (help !== null && dialogRef.current !== null) {
      dialogRef.current.showModal();
      dialogRef.current.scrollTop = 0;
    }
  }, [help]);

  function openHelp(section: HelpSection, trigger: HTMLButtonElement) {
    // A distinct request also reopens the same guide before the close event arrives.
    setHelp({ section, trigger });
  }

  return (
    <section className="workflow-help" aria-labelledby="workflow-help-section-title">
      <h2 id="workflow-help-section-title">How it works</h2>
      <div className="workflow-help-actions">
        <button
          type="button"
          className="workflow-help-trigger"
          aria-haspopup="dialog"
          aria-controls="workflow-help-dialog"
          tabIndex={0}
          onClick={(event) => openHelp("browser", event.currentTarget)}
        >
          In the browser
        </button>
        <button
          type="button"
          className="workflow-help-trigger"
          aria-haspopup="dialog"
          aria-controls="workflow-help-dialog"
          tabIndex={0}
          onClick={(event) => openHelp("cli", event.currentTarget)}
        >
          From the command line
        </button>
      </div>
      <dialog
        ref={dialogRef}
        id="workflow-help-dialog"
        className="workflow-help-dialog"
        aria-labelledby="workflow-help-title"
        onClose={() => help?.trigger.focus({ preventScroll: true })}
        onClick={(event) => {
          if (event.target !== event.currentTarget) {
            return;
          }

          const bounds = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < bounds.left || event.clientX > bounds.right ||
            event.clientY < bounds.top || event.clientY > bounds.bottom
          ) {
            event.currentTarget.close();
          }
        }}
      >
        <div className="workflow-help-heading">
          <h2 id="workflow-help-title">
            {section === "cli" ? "From the command line" : "In the browser"}
          </h2>
          <button
            type="button"
            className="secondary-action"
            autoFocus
            onClick={() => dialogRef.current?.close()}
          >
            Close
          </button>
        </div>
        <div className="workflow-help-content">
          {section === "browser" && (
            <>
              <p>
                OrbiRig checks command records from simplified spacecraft tests.
                Each observation includes the command, whether it was accepted,
                the operating modes before and after execution, and the mode reported by
                telemetry.
              </p>
              <p>
                The web interface checks these records. It does not send commands to a
                spacecraft.
              </p>

              <h3>Verify observation</h3>
              <ol>
                <li>Enter an execution ID and the UTC time of the recorded execution.</li>
                <li>
                  Select a scenario describing the expected behaviour, such as switching
                  from NOMINAL to SAFE mode.
                </li>
                <li>
                  Paste the observation JSON or choose <strong>Load example</strong> to
                  try a sample.
                </li>
                <li>
                  Choose <strong>Verify observation</strong> to see the individual checks
                  and overall <strong>PASS</strong> or <strong>FAIL</strong> result.
                </li>
              </ol>
              <p>
                <strong>PASS</strong> means the recorded behaviour matches the selected
                scenario. This can include a rejected command if rejection was expected.
              </p>
              <p>
                <strong>FAIL</strong> means the observation is valid, but the recorded
                behaviour does not meet the scenario's expectations. Invalid evidence is
                reported separately as an input error.
              </p>
              <p>
                The scenario defines what should happen independently of the recorded
                observation.
              </p>

              <h3>Inspect evidence</h3>
              <ol>
                <li>
                  Select the type of saved record: observation, verified execution, or
                  verified-execution sequence.
                </li>
                <li>
                  Paste its JSON or choose <strong>Load example</strong>.
                </li>
                <li>
                  Choose <strong>Inspect evidence</strong> to explore its contents in a
                  structured view.
                </li>
              </ol>
              <p>
                Inspecting an observation checks whether the record is valid. To check
                it against a scenario, use <strong>Verify observation</strong>.
              </p>
              <p>
                For saved verified executions and sequences, OrbiRig independently
                recalculates verification results and checks their consistency. Evidence
                with a correctly derived <strong>FAIL</strong> outcome is still valid and
                can be inspected.
              </p>
            </>
          )}
          {section === "cli" && (
            <>
              <p>
                OrbiRig can verify a saved observation from a terminal, without
                opening the web interface. It uses the same Python verification core.
                The command runs locally on your computer and does not execute
                spacecraft commands or collect observations.
              </p>
              <p>
                Save the observation JSON as <code>observation.json</code> file (UTF-8).
                You can copy a built-in example from the browser. From an OrbiRig
                checkout, run <code>uv sync --locked</code> if needed, then:
              </p>
              <pre
                className="workflow-help-command"
                role="region"
                aria-label="CLI verification command"
                tabIndex={0}
              >
                <code>{`uv run --no-sync orbirig verify-observation observation.json \\
  --scenario nominal_to_safe_mode \\
  --execution-id demo-001 \\
  --executed-at 2026-10-21T10:00:00Z`}</code>
              </pre>
              <p>
                The execution ID and timestamp above are examples. For recorded
                executions, use the corresponding recorded metadata.
              </p>
              <p>
                The command prints JSON evidence in the terminal for both <strong>PASS</strong> and <strong>FAIL</strong> results.
                Exit code <code>0</code> means <strong>PASS</strong> and <code>1</code> means
                verification completed with <strong>FAIL</strong>. Invalid input returns <code>2</code>,
                file or output errors return <code>3</code>, and unexpected internal
                errors return <code>4</code>.
              </p>
              <p>
                <a href="https://github.com/NikolayAir/OrbiRig#verify-a-saved-observation-from-the-command-line">
                  CLI setup and full instructions
                </a>
              </p>
            </>
          )}
        </div>
      </dialog>
    </section>
  );
}
