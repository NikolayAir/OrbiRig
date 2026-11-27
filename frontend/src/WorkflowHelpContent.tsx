import type { ReactNode } from "react";

import { DocLink } from "./DocLink";
import { LINKS } from "./workflowContent";

export type ExpandableSection =
  | "python-example"
  | "verification-results"
  | "inspection-results"
  | "cli-results"
  | "dotnet-example";

type HelpContentProps = {
  openSection: ExpandableSection | null;
  onOpenChange: (id: ExpandableSection, open: boolean, browserTop?: number) => void;
};

// One shared state value controls expanded sections. Selecting a section closes
// the previous section in the same update.
function ExpandableHelpSection({
  id, className, title, openSection, onOpenChange, children,
}: HelpContentProps & {
  id: ExpandableSection;
  className: string;
  title: string;
  children: ReactNode;
}) {
  const open = openSection === id;
  return (
    <details
      className={className}
      data-help-section={id}
      open={open}
      onToggle={(event) => {
        // The browser can open a section without a click, for example when it finds searched
        // text. It has already scrolled to that text, so pass on where the section is now.
        const details = event.currentTarget;
        if (details.open !== open) onOpenChange(id, details.open, details.getBoundingClientRect().top);
      }}
    >
      <summary
        onClick={(event) => {
          // Handle explicit activation in the guide's state so onToggle can
          // recognise a section the browser opened to reveal found text.
          event.preventDefault();
          onOpenChange(id, !open);
        }}
      >
        {title}
      </summary>
      {children}
    </details>
  );
}

export function VerificationHelpContent(props: HelpContentProps) {
  return (
    <>
      <p>Open <strong>Load example</strong> and choose <strong>Standard example</strong> or <strong>Failing example</strong>. Then choose <strong>Verify observation</strong>.</p>
      <ol>
        <li>
          For your own observation, select a <strong>Scenario</strong>, such as <strong>NOMINAL to SAFE</strong>.
        </li>
        <li>
          Enter an <strong>Execution ID</strong> and the time the command ran in <strong>Execution time (UTC)</strong>.
        </li>
        <li>Choose <strong>Open JSON file</strong> (the folder icon) or paste the observation into <strong>Observation evidence JSON</strong>.</li>
        <li>
          Choose <strong>Verify observation</strong> to see the individual checks
          and overall <strong>PASS</strong> or <strong>FAIL</strong> result.
        </li>
        <li>
          Choose <strong>Download result JSON</strong> to save the result.
          In <strong>Inspect evidence</strong>, select <strong>Verified execution</strong> and
          reopen the file with <strong>Open JSON file</strong>.
          Then choose <strong>Inspect evidence</strong> to see the same checks and outcome.
        </li>
      </ol>
      <ExpandableHelpSection
        id="python-example"
        className="workflow-help-example"
        title="When a command returns no result (Python API example)"
        {...props}
      >
        <p>
          Example from a local run using the Python API.
        </p>
        <ol>
          <li>A command requests a change from NOMINAL to SAFE.</li>
          <li>
            The independent test target saves SAFE, then exits before returning an observation.
          </li>
          <li>
            OrbiRig reports a <strong>collection error</strong>. With no observation to check,
            it has no <strong>PASS</strong> or <strong>FAIL</strong> result.
          </li>
          <li>
            Reading the target's state file confirms it saved SAFE.
          </li>
          <li>
            The next command starts from SAFE, changes to NOMINAL and produces <strong>PASS</strong>.
          </li>
        </ol>
        <p>
          After a collection error, check the target separately to find out whether it saved a change.
        </p>
        <p><DocLink href={LINKS.statefulTarget}>Run the Python example</DocLink></p>
      </ExpandableHelpSection>
      <ExpandableHelpSection
        id="verification-results"
        className="workflow-help-reference"
        title="Understanding results and further reading"
        {...props}
      >
        <p>
          <strong>PASS</strong> means the recorded behaviour matches the selected
          scenario. This can include a rejected command if rejection was expected.
        </p>
        <p>
          <strong>FAIL</strong> means the observation is valid, but one or more verification
          checks do not meet their expectations. Invalid input is reported as an error, not as a FAIL result.
        </p>
        <p>
          After a completed result, change an input to run <strong>Verify observation</strong> again.
          This clears the previous result.
        </p>
        <ul className="workflow-help-links">
          <li><DocLink href={LINKS.scenarios}>Supported scenarios and checks</DocLink></li>
          <li><DocLink href={LINKS.executionMetadata}>Execution ID and UTC time rules</DocLink></li>
        </ul>
      </ExpandableHelpSection>
    </>
  );
}

export function InspectionHelpContent(props: HelpContentProps) {
  return (
    <>
      <ol>
        <li>
          Select the <strong>Evidence type</strong> that matches your document.
        </li>
        <li>
          Choose <strong>Open JSON file</strong> (the folder icon) or paste the document into <strong>Evidence JSON</strong>.
          To try a sample, use <strong>Load example</strong>.
        </li>
        <li>
          Choose <strong>Inspect evidence</strong> to see the recorded values
          and any saved verification results.
        </li>
        <li>
          Choose <strong>Download evidence JSON</strong> to save the submitted JSON after a successful inspection.
        </li>
      </ol>
      <ExpandableHelpSection
        id="inspection-results"
        className="workflow-help-reference"
        title="Understanding inspection and further reading"
        {...props}
      >
        <p>
          Inspecting an observation validates its JSON by checking the format, fields and values.
          To compare the reported result with a scenario, use <strong>Verify observation</strong>.
        </p>
        <p>
          For verified evidence, OrbiRig also recalculates the checks from the saved
          scenario and observation. A saved <strong>FAIL</strong> is valid when the stored
          results agree with those checks. In a sequence, each continuity check compares
          the ending mode of one record with the starting mode of the next.
        </p>
        <p>
          After a successful inspection, change the JSON or evidence type to run{" "}
          <strong>Inspect evidence</strong> again. This clears the previous result.
        </p>
        <ul className="workflow-help-links">
          <li><DocLink href={LINKS.evidenceFormats}>Evidence formats and JSON rules</DocLink></li>
          <li><DocLink href={LINKS.savedEvidence}>How saved evidence is rechecked</DocLink></li>
          <li><DocLink href={LINKS.validationLimits}>What validation establishes</DocLink></li>
        </ul>
      </ExpandableHelpSection>
    </>
  );
}

export function CommandLineHelpContent(props: HelpContentProps) {
  return (
    <>
      <p>The command line verifies an observation stored in a local JSON file.</p>
      <p>
        To try the example, open a terminal in the OrbiRig repository root and run <code>uv sync --locked</code> to install OrbiRig.
        Then run the verification command:
      </p>
      <pre
        className="workflow-help-command"
        role="region"
        aria-label="CLI verification command"
        tabIndex={0}
      >
        <code>{`uv run --no-sync orbirig verify-observation docs/examples/nominal-to-safe.json \\
  --scenario nominal_to_safe_mode \\
  --execution-id demo-001 \\
  --executed-at 2026-10-21T10:00:00Z`}</code>
      </pre>
      <p>
        To verify your own observation, provide the path to its UTF-8 JSON file and choose the scenario to check.
        Choose an execution ID for the run and use the command's execution time in UTC.
      </p>
      <p>
        The command prints JSON evidence containing the individual checks and overall <strong>PASS</strong> or <strong>FAIL</strong> result.
      </p>
      <ExpandableHelpSection
        id="cli-results"
        className="workflow-help-reference"
        title="Understanding CLI results and exit codes"
        {...props}
      >
        <p>
          Exit code <code>0</code> means <strong>PASS</strong>, while <code>1</code> means
          verification completed with <strong>FAIL</strong>. Invalid input returns <code>2</code>,
          file or output errors return <code>3</code>, and unexpected internal
          errors return <code>4</code>.
        </p>
        <p>
          <DocLink href={LINKS.cli}>CLI setup and full instructions</DocLink>
        </p>
      </ExpandableHelpSection>
      <ExpandableHelpSection
        id="dotnet-example"
        className="workflow-help-example"
        title="Verify a C#/.NET program (optional)"
        {...props}
      >
        <p>
          You can use the Python API to verify command responses from an independent
          C#/.NET program against a scenario you choose.
        </p>
        <p>
          The API starts a new process for each command. The same state file keeps the operating mode between runs.
        </p>
        <p><strong>Example outcomes from a local run</strong></p>
        <ul>
          <li>
            <strong>Round trip.</strong> The mode changes from <code>NOMINAL</code> to <code>SAFE</code> and back.
            OrbiRig reports <strong>PASS</strong>. The second run starts in the mode the first one left.
          </li>
          <li>
            <strong>Stale telemetry.</strong> The target saves <code>SAFE</code> and reports <code>NOMINAL</code> as telemetry.
            OrbiRig records a verification <strong>FAIL</strong>.
          </li>
          <li>
            <strong>Collection error.</strong> The target saves a change and exits before returning an observation.
            OrbiRig reports the error without creating a verified record.
          </li>
        </ul>
        <p>
          Use the .NET 10 SDK to build and run the optional target locally. The example saves
          the stale-telemetry result as JSON for inspection in the browser.
        </p>
        <p><DocLink href={LINKS.dotnetTarget}>Build and verify the C#/.NET example</DocLink></p>
      </ExpandableHelpSection>
    </>
  );
}
