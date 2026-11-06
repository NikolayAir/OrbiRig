import { type KeyboardEvent, useEffect, useRef, useState } from "react";

import { DocLink } from "./DocLink";
import { LINKS } from "./workflowContent";
import type { Workflow } from "./workflowTypes";

type HelpSection = "browser" | "cli";

function scrollFocusedControlIntoView(dialog: HTMLDialogElement, element: HTMLElement) {
  const focused = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  const outline = Math.max(0, parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset));
  const viewportTop = dialog.getBoundingClientRect().top + dialog.clientTop;
  const top = viewportTop + outline;
  const bottom = viewportTop + dialog.clientHeight - outline;
  // Some browsers scroll only by whole pixels.
  // Round the distance outwards so the entire focus outline stays visible.
  if (focused.top < top) {
    dialog.scrollTop += Math.floor(focused.top - top);
  } else if (focused.bottom > bottom) {
    dialog.scrollTop += Math.ceil(focused.bottom - bottom);
  }
}

export function WorkflowHelp({ activeWorkflow }: { activeWorkflow: Workflow }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const browserTabRef = useRef<HTMLButtonElement>(null);
  const cliTabRef = useRef<HTMLButtonElement>(null);
  const browserPanelRef = useRef<HTMLDivElement>(null);
  const cliPanelRef = useRef<HTMLDivElement>(null);
  const browserWorkflowsRef = useRef<HTMLDivElement>(null);
  const verificationTabRef = useRef<HTMLButtonElement>(null);
  const inspectionTabRef = useRef<HTMLButtonElement>(null);
  const [help, setHelp] = useState<{
    section: HelpSection;
    browserWorkflow: Workflow;
    scrollToWorkflow: boolean;
    trigger: HTMLButtonElement;
  } | null>(null);
  const [scrollWholeDialog, setScrollWholeDialog] = useState(false);
  const section = help?.section;
  const browserWorkflow = help?.browserWorkflow;

  useEffect(() => {
    if (help !== null && dialogRef.current !== null) {
      if (!dialogRef.current.open) {
        dialogRef.current.showModal();
        dialogRef.current.scrollTop = 0;
      }
      const panel = help.section === "browser" ? browserPanelRef.current : cliPanelRef.current;
      if (panel !== null) {
        const tabs = browserWorkflowsRef.current;
        if (scrollWholeDialog) {
          panel.scrollTop = 0;
          if (help.scrollToWorkflow && tabs !== null) {
            dialogRef.current.scrollTop = tabs.offsetTop;
            if (document.activeElement instanceof HTMLElement && tabs.contains(document.activeElement)) {
              scrollFocusedControlIntoView(dialogRef.current, document.activeElement);
            }
          } else if (document.activeElement instanceof HTMLElement && headerRef.current?.contains(document.activeElement)) {
            scrollFocusedControlIntoView(dialogRef.current, document.activeElement);
          }
        } else {
          dialogRef.current.scrollTop = 0;
          panel.scrollTop = help.scrollToWorkflow && tabs !== null
            ? tabs.offsetTop - panel.offsetTop
            : 0;
        }
      }
    }
  }, [help, scrollWholeDialog]);

  useEffect(() => {
    const dialog = dialogRef.current;
    const header = headerRef.current;
    const panel = help?.section === "browser" ? browserPanelRef.current : cliPanelRef.current;
    if (help === null || dialog === null || header === null || panel === null) return;

    const measureAvailableSpace = () => {
      if (!dialog.open) return;
      const style = getComputedStyle(panel);
      // Keep the header stationary only while the panel can show a full line.
      const minimumPanelHeight = parseFloat(style.lineHeight)
        + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
      setScrollWholeDialog(header.getBoundingClientRect().height + minimumPanelHeight > dialog.clientHeight);
    };

    measureAvailableSpace();
    // Header wrapping and enlarged text can change the available space without a window resize.
    const observer = new ResizeObserver(measureAvailableSpace);
    observer.observe(dialog);
    observer.observe(header);
    return () => observer.disconnect();
  }, [help]);

  function openHelp(section: HelpSection, trigger: HTMLButtonElement) {
    // Create a new state object even when reopening the same guide.
    // This reruns the code that calls showModal() (useEffect), even if the previous
    // close event has not been delivered yet.
    setHelp({ section, trigger, browserWorkflow: activeWorkflow, scrollToWorkflow: false });
  }

  function selectHelp(section: HelpSection) {
    setHelp((current) => current === null || current.section === section
      ? current
      : { ...current, section, scrollToWorkflow: false });
  }

  function selectBrowserWorkflow(browserWorkflow: Workflow) {
    setHelp((current) => current === null || current.browserWorkflow === browserWorkflow
      ? current
      : { ...current, browserWorkflow, scrollToWorkflow: true });
  }

  function navigateBrowserTabs(event: KeyboardEvent<HTMLButtonElement>, current: Workflow) {
    let next: Workflow;
    switch (event.key) {
      case "ArrowLeft":
      case "ArrowRight":
        next = current === "verification" ? "inspection" : "verification";
        break;
      case "Home":
        next = "verification";
        break;
      case "End":
        next = "inspection";
        break;
      default:
        return;
    }
    event.preventDefault();
    selectBrowserWorkflow(next);
    (next === "verification" ? verificationTabRef : inspectionTabRef).current?.focus({ preventScroll: true });
  }

  function navigateTabs(event: KeyboardEvent<HTMLButtonElement>, current: HelpSection) {
    let next: HelpSection;
    switch (event.key) {
      case "ArrowLeft":
      case "ArrowRight":
        next = current === "browser" ? "cli" : "browser";
        break;
      case "Home":
        next = "browser";
        break;
      case "End":
        next = "cli";
        break;
      default:
        return;
    }
    event.preventDefault();
    selectHelp(next);
    (next === "browser" ? browserTabRef : cliTabRef).current?.focus({ preventScroll: true });
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
        <DocLink href={LINKS.documentation} className="workflow-help-trigger">Documentation</DocLink>
      </div>
      <dialog
        ref={dialogRef}
        id="workflow-help-dialog"
        className="workflow-help-dialog"
        data-scroll-whole={scrollWholeDialog}
        aria-labelledby="workflow-help-title"
        onFocus={(event) => {
          if (
            scrollWholeDialog && dialogRef.current !== null &&
            event.target instanceof HTMLAnchorElement && event.target.closest(".workflow-help-content") !== null
          ) {
            scrollFocusedControlIntoView(dialogRef.current, event.target);
          }
        }}
        onClose={() => help?.trigger.focus({ preventScroll: true })}
        onClick={(event) => {
          if (event.target !== event.currentTarget) {
            return;
          }

          // Backdrop clicks also target the dialog; close only when the click is outside its bounds.
          const bounds = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < bounds.left || event.clientX > bounds.right ||
            event.clientY < bounds.top || event.clientY > bounds.bottom
          ) {
            event.currentTarget.close();
          }
        }}
      >
        <div
          ref={headerRef}
          className="workflow-help-header"
          onFocus={(event) => {
            if (scrollWholeDialog && dialogRef.current !== null) {
              scrollFocusedControlIntoView(dialogRef.current, event.target);
            }
          }}
        >
          <div className="workflow-help-heading">
            <h2 id="workflow-help-title">How it works</h2>
            <button
              type="button"
              className="workflow-help-close"
              aria-label="Close"
              autoFocus
              onClick={() => dialogRef.current?.close()}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                aria-hidden="true"
                focusable="false"
              >
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
          <div className="workflow-help-tabs" role="tablist" aria-label="Help sections">
            <button
              ref={browserTabRef}
              type="button"
              role="tab"
              id="workflow-help-browser-tab"
              className="workflow-help-tab"
              aria-selected={section === "browser"}
              aria-controls="workflow-help-browser-panel"
              tabIndex={section === "browser" ? 0 : -1}
              onClick={() => selectHelp("browser")}
              onKeyDown={(event) => navigateTabs(event, "browser")}
            >
              In the browser
            </button>
            <button
              ref={cliTabRef}
              type="button"
              role="tab"
              id="workflow-help-cli-tab"
              className="workflow-help-tab"
              aria-selected={section === "cli"}
              aria-controls="workflow-help-cli-panel"
              tabIndex={section === "cli" ? 0 : -1}
              onClick={() => selectHelp("cli")}
              onKeyDown={(event) => navigateTabs(event, "cli")}
            >
              From the command line
            </button>
          </div>
        </div>
        <div
          ref={browserPanelRef}
          className="workflow-help-content"
          role="tabpanel"
          id="workflow-help-browser-panel"
          aria-labelledby="workflow-help-browser-tab"
          hidden={section !== "browser"}
          tabIndex={0}
        >
          {section === "browser" && (
            <>
              <p>
                OrbiRig checks recorded command results against expectations defined independently
                of the recorded data. When verification can proceed, it shows which checks pass or
                fail; invalid input is reported separately. It rechecks saved verification results
                for consistency with the recorded data.
              </p>
              <p>
                The examples use a simplified spacecraft model with two operating modes, NOMINAL and SAFE.
                A command requests a mode; an observation records the request, whether it was accepted,
                the mode before and after, and a separately reported mode (telemetry). OrbiRig currently
                supports three such scenarios. This approach shares principles with software testing and
                data-quality practices, such as checking API responses against expected values or validating
                data in processing pipelines. The web interface only checks submitted records; it does not
                connect to real systems, send commands or collect live data.
              </p>


              <div
                ref={browserWorkflowsRef}
                className="workflow-help-workflows"
                role="tablist"
                aria-label="Browser instructions"
              >
                <button
                  ref={verificationTabRef}
                  type="button"
                  role="tab"
                  id="workflow-help-verification-tab"
                  aria-selected={browserWorkflow === "verification"}
                  aria-controls="workflow-help-verification-panel"
                  tabIndex={browserWorkflow === "verification" ? 0 : -1}
                  onClick={() => selectBrowserWorkflow("verification")}
                  onKeyDown={(event) => navigateBrowserTabs(event, "verification")}
                >
                  Verify observation
                </button>
                <button
                  ref={inspectionTabRef}
                  type="button"
                  role="tab"
                  id="workflow-help-inspection-tab"
                  aria-selected={browserWorkflow === "inspection"}
                  aria-controls="workflow-help-inspection-panel"
                  tabIndex={browserWorkflow === "inspection" ? 0 : -1}
                  onClick={() => selectBrowserWorkflow("inspection")}
                  onKeyDown={(event) => navigateBrowserTabs(event, "inspection")}
                >
                  Inspect evidence
                </button>
              </div>
              <div
                className="workflow-help-instructions"
                role="tabpanel"
                id="workflow-help-verification-panel"
                aria-labelledby="workflow-help-verification-tab"
                hidden={browserWorkflow !== "verification"}
                tabIndex={0}
              >
                <ol>
                  <li>Enter an execution ID and the UTC time of the recorded execution.</li>
                  <li>
                    Select a scenario describing the expected behaviour, such as switching
                    from NOMINAL to SAFE mode.
                  </li>
                  <li>
                    Paste the observation JSON, or choose <strong>Load example</strong> or{" "}
                    <strong>Load failing example</strong> to try a sample.
                  </li>
                  <li>
                    Choose <strong>Verify observation</strong> to see the individual checks
                    and overall <strong>PASS</strong> or <strong>FAIL</strong> result.
                  </li>
                </ol>
                <details className="workflow-help-example">
                  <summary>When a command returns no result (Python API example)</summary>
                  <p>
                    Illustrative example from the Python API. The browser does not run the test target.
                  </p>
                  <ol>
                    <li>A command requests a change from NOMINAL to SAFE.</li>
                    <li>
                      The independent test target saves SAFE, then exits before returning an observation.
                    </li>
                    <li>
                      OrbiRig reports a <strong>collection error</strong>.
                      No verification <strong>PASS</strong> or <strong>FAIL</strong> is produced.
                    </li>
                    <li>
                      In this controlled example, a separate check of the target's state file
                      confirms SAFE was saved.
                    </li>
                    <li>
                      The next command starts from SAFE, changes to NOMINAL and produces <strong>PASS</strong>.
                    </li>
                  </ol>
                  <p>
                    A missing response does not prove that a command failed to execute.
                    The collection error alone does not establish the state of an external system.
                  </p>
                  <p><DocLink href={LINKS.statefulTarget}>Reproduce the stateful-target example</DocLink></p>
                </details>
                <p>
                  <strong>PASS</strong> means the recorded behaviour matches the selected
                  scenario. This can include a rejected command if rejection was expected.
                </p>
                <p>
                  <strong>FAIL</strong> means the observation is valid, but one or more verification
                  checks do not meet their expectations. Invalid input, including a command that does not
                  match the selected scenario, is reported as an error instead of FAIL.
                </p>
                <p>
                  Choose the scenario based on the behaviour you intended to test, not on the
                  values reported in the observation.
                </p>
                <p>
                  Both <strong>PASS</strong> and <strong>FAIL</strong> are completed results.{" "}
                  <strong>Verify observation</strong> stays unavailable until an input changes,
                  since identical inputs produce the same result. Editing an input clears the previous
                  result and prompts a new check.
                </p>
                <ul className="workflow-help-links">
                  <li><DocLink href={LINKS.scenarios}>Supported scenarios and checks</DocLink></li>
                  <li><DocLink href={LINKS.executionMetadata}>Execution ID and UTC time rules</DocLink></li>
                </ul>
              </div>
              <div
                className="workflow-help-instructions"
                role="tabpanel"
                id="workflow-help-inspection-panel"
                aria-labelledby="workflow-help-inspection-tab"
                hidden={browserWorkflow !== "inspection"}
                tabIndex={0}
              >
                <ol>
                  <li>
                    Select the evidence type: observation, verified execution, or
                    verified-execution sequence.
                  </li>
                  <li>
                    Paste its JSON or load an example. <strong>Load altered example</strong> shows
                    why evidence with repeated fields or outdated saved results is rejected.
                  </li>
                  <li>
                    Choose <strong>Inspect evidence</strong> to see the recorded values
                    and any saved verification results.
                  </li>
                </ol>
                <p>
                  Inspecting an observation checks its JSON structure and supported values.
                  To compare the reported result with a scenario, use <strong>Verify observation</strong>.
                </p>
                <p>
                  For saved verified executions and sequences, OrbiRig recalculates each
                  record's checks and outcome from its scenario and observation, then compares
                  them with the stored results. For sequences, it also checks continuity in
                  the saved order. A record with a <strong>FAIL</strong> outcome can still be
                  inspected when these results match.
                </p>
                <p>
                  After a successful inspection, <strong>Inspect evidence</strong> stays unavailable until
                  the JSON or evidence type changes, since identical inputs produce the same result.
                  Editing either clears the result and prompts a new inspection.
                </p>
                <ul className="workflow-help-links">
                  <li><DocLink href={LINKS.evidenceFormats}>Evidence formats and JSON rules</DocLink></li>
                  <li><DocLink href={LINKS.savedEvidence}>How saved evidence is rechecked</DocLink></li>
                  <li><DocLink href={LINKS.validationLimits}>What validation establishes</DocLink></li>
                </ul>
              </div>
            </>
          )}
        </div>
        <div
          ref={cliPanelRef}
          className="workflow-help-content"
          role="tabpanel"
          id="workflow-help-cli-panel"
          aria-labelledby="workflow-help-cli-tab"
          hidden={section !== "cli"}
          tabIndex={0}
        >
          {section === "cli" && (
            <>
              <p>
                OrbiRig can verify recorded observations in two ways: by submitting JSON
                in the browser or by reading a local JSON file from the command line.
                Both interfaces use the same Python verification core. Neither interface
                sends commands to a target system (the software or device described in
                the records) or collects new observations from it.
              </p>
              <p>
                To try the included example, open a terminal in an OrbiRig checkout. Run{" "}
                <code>uv sync --locked</code> if the Python environment is not yet installed, then:
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
                The execution ID and UTC timestamp are example values. For your own recorded
                execution, replace the file path with a UTF-8 observation JSON file and use
                the recorded execution ID and time.
              </p>
              <p>
                The command prints JSON evidence containing the individual checks and overall <strong>PASS</strong> or <strong>FAIL</strong> result.
                Exit code <code>0</code> means <strong>PASS</strong>, while <code>1</code> means
                verification completed with <strong>FAIL</strong>. Invalid input returns <code>2</code>,
                file or output errors return <code>3</code>, and unexpected internal
                errors <span className="keep-together">return <code>4</code></span>.
              </p>
              <p>
                <DocLink href={LINKS.cli}>CLI setup and full instructions</DocLink>
              </p>
            </>
          )}
        </div>
      </dialog>
    </section>
  );
}
