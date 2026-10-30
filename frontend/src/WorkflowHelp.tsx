import { type KeyboardEvent, useEffect, useRef, useState } from "react";

type HelpSection = "browser" | "cli";
type BrowserWorkflow = "verification" | "inspection";

function revealFocusedControl(dialog: HTMLDialogElement, element: HTMLElement) {
  const focused = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  const outline = Math.max(0, parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset));
  const viewportTop = dialog.getBoundingClientRect().top + dialog.clientTop;
  const top = viewportTop + outline;
  const bottom = viewportTop + dialog.clientHeight - outline;
  // Keep the focus outline visible, including engines with integral scroll offsets.
  if (focused.top < top) {
    dialog.scrollTop += Math.floor(focused.top - top);
  } else if (focused.bottom > bottom) {
    dialog.scrollTop += Math.ceil(focused.bottom - bottom);
  }
}

export function WorkflowHelp({ activeWorkflow }: { activeWorkflow: BrowserWorkflow }) {
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
    browserWorkflow: BrowserWorkflow;
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
          } else if (document.activeElement instanceof HTMLElement && headerRef.current?.contains(document.activeElement)) {
            revealFocusedControl(dialogRef.current, document.activeElement);
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
    const observer = new ResizeObserver(measureAvailableSpace);
    observer.observe(dialog);
    observer.observe(header);
    return () => observer.disconnect();
  }, [help]);

  function openHelp(section: HelpSection, trigger: HTMLButtonElement) {
    // A distinct request also reopens the same guide before the close event arrives.
    setHelp({ section, trigger, browserWorkflow: activeWorkflow, scrollToWorkflow: false });
  }

  function selectHelp(section: HelpSection) {
    setHelp((current) => current === null || current.section === section
      ? current
      : { ...current, section, scrollToWorkflow: false });
  }

  function selectBrowserWorkflow(browserWorkflow: BrowserWorkflow) {
    setHelp((current) => current === null || current.browserWorkflow === browserWorkflow
      ? current
      : { ...current, browserWorkflow, scrollToWorkflow: true });
  }

  function navigateBrowserTabs(event: KeyboardEvent<HTMLButtonElement>, current: BrowserWorkflow) {
    let next: BrowserWorkflow;
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
      </div>
      <dialog
        ref={dialogRef}
        id="workflow-help-dialog"
        className="workflow-help-dialog"
        data-scroll-whole={scrollWholeDialog}
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
        <div
          ref={headerRef}
          className="workflow-help-header"
          onFocus={(event) => {
            if (scrollWholeDialog && dialogRef.current !== null) {
              revealFocusedControl(dialogRef.current, event.target);
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
                OrbiRig checks command records from simplified spacecraft tests.
                Each observation includes the command, whether it was accepted,
                the operating modes before and after execution, and the mode reported in
                telemetry (recorded status data).
              </p>
              <p>
                The web interface verifies and inspects submitted records. It does not
                connect to a real spacecraft, send spacecraft commands or collect live
                telemetry.
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
                OrbiRig can verify a saved observation from a terminal, without
                opening the web interface. It uses the same Python verification core.
                The command runs locally on your computer and does not execute
                spacecraft commands or collect observations.
              </p>
              <p>
                For this command, select <strong>NOMINAL to SAFE</strong> in{" "}
                <strong>Verify observation</strong>, choose <strong>Load example</strong>,
                and save the observation JSON to a UTF-8 file named{" "}
                <code>observation.json</code>. From an OrbiRig checkout, run{" "}
                <code>uv sync --locked</code> if needed, then:
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
                errors <span className="keep-together">return <code>4</code></span>.
              </p>
              <p>
                <a href="https://github.com/NikolayAir/OrbiRig/blob/main/docs/cli.md">
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
