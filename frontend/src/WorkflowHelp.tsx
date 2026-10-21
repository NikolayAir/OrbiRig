import { useRef } from "react";

export function WorkflowHelp() {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <div className="workflow-help">
      <button
        type="button"
        className="workflow-help-trigger"
        aria-haspopup="dialog"
        aria-controls="workflow-help-dialog"
        tabIndex={0}
        onClick={() => {
          const dialog = dialogRef.current;
          if (dialog !== null) {
            dialog.showModal();
            dialog.scrollTop = 0;
          }
        }}
      >
        How it works
      </button>
      <dialog
        ref={dialogRef}
        id="workflow-help-dialog"
        className="workflow-help-dialog"
        aria-labelledby="workflow-help-title"
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
          <h2 id="workflow-help-title">How it works</h2>
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
          <h3>In the browser</h3>
          <p>
            OrbiRig checks records of how commands behaved in simplified spacecraft
            tests. Each observation contains the command, whether it was accepted,
            the operating mode before and after execution, and the mode reported by
            telemetry.
          </p>
          <p>
            The web interface checks these records. It does not send commands to a
            spacecraft.
          </p>

          <h4>Verify observation</h4>
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

          <h4>Inspect evidence</h4>
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
            Inspection checks whether the supplied evidence is valid. It does not
            automatically mean the recorded behaviour met a scenario's expectations.
          </p>
          <p>
            For saved verified executions and sequences, OrbiRig independently
            recalculates verification results and checks their consistency. Evidence
            with a correctly derived <strong>FAIL</strong> outcome is still valid and
            can be inspected.
          </p>
        </div>
      </dialog>
    </div>
  );
}
