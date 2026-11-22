import { type KeyboardEvent, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";

import { DocLink } from "./DocLink";
import { scrollDeltaToReveal } from "./helpSectionScroll";
import { LINKS } from "./workflowContent";
import type { Workflow } from "./workflowTypes";

type HelpSection = "browser" | "cli";
type ExpandableSection = "python-example" | "verification-results" | "inspection-results" | "cli-results" | "dotnet-example";

function HelpSectionLabel({ section }: { section: HelpSection }) {
  const browser = section === "browser";
  return (
    <>
      <svg
        className="workflow-help-icon"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d={browser ? "M3 9h18 M6.5 6.5h.01 M9.5 6.5h.01" : "m7 9 3 3-3 3m6 0h4"} />
      </svg>
      <span>{browser ? "In the browser" : "From the command line"}</span>
    </>
  );
}

// One shared state value controls expanded sections. Selecting a section closes
// the previous section in the same update.
function ExpandableHelpSection({ id, className, title, openSection, onOpenChange, children }: {
  id: ExpandableSection;
  className: string;
  title: string;
  openSection: ExpandableSection | null;
  onOpenChange: (id: ExpandableSection, open: boolean, browserTop?: number) => void;
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

function focusOutlineOutset(style: CSSStyleDeclaration) {
  if (style.outlineStyle === "none") return 0;
  return Math.max(0, (parseFloat(style.outlineWidth) || 0) + (parseFloat(style.outlineOffset) || 0));
}

function scrollFocusedControlIntoView(scroller: HTMLElement, element: HTMLElement) {
  const focused = element.getBoundingClientRect();
  const outline = focusOutlineOutset(getComputedStyle(element));
  const area = scroller.getBoundingClientRect();
  const viewportTop = area.top + scroller.clientTop;
  const top = viewportTop + outline;
  // clientHeight can round up past a fractional rendered edge, as on the content panel.
  const bottom = Math.min(viewportTop + scroller.clientHeight, area.bottom) - outline;
  // Some browsers scroll only by whole pixels.
  // Round the distance outwards so the entire focus outline stays visible.
  if (focused.top < top) {
    scroller.scrollTop += Math.floor(focused.top - top);
  } else if (focused.bottom > bottom) {
    scroller.scrollTop += Math.ceil(focused.bottom - bottom);
  }
}

export function WorkflowHelp({ activeWorkflow }: { activeWorkflow: Workflow }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const backdropPress = useRef(false);
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
  // Kept apart from `help` because changing `help` resets the scroll position.
  const [openSection, setOpenSection] = useState<ExpandableSection | null>(null);
  const previousOpenSection = useRef<ExpandableSection | null>(null);
  // Where a section that the browser opened by itself was on screen, so it can stay there.
  const browserOpened = useRef<{ id: ExpandableSection; top: number } | null>(null);
  const section = help?.section;
  const browserWorkflow = help?.browserWorkflow;

  // Set the scroll position after opening the guide, navigating within it, or
  // changing scroll modes. The effect below measures the resulting layout.
  useLayoutEffect(() => {
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

  // Measure the open section before the browser paints. A change of scroll mode
  // uses the new layout after the effect above sets its scroll position.
  // On close, the browser can clamp the existing position as the content gets shorter.
  useLayoutEffect(() => {
    const sectionAlreadyOpen = previousOpenSection.current === openSection;
    previousOpenSection.current = openSection;
    const kept = browserOpened.current;
    browserOpened.current = null;
    const dialog = dialogRef.current;
    const details = openSection === null
      ? null
      : dialog?.querySelector<HTMLElement>(`details[data-help-section="${openSection}"]`);
    const summary = details?.querySelector("summary");
    if (!dialog || !details || !summary) return;
    // The dialog scrolls as a whole in short windows; otherwise only the content panel does.
    const scroller = dialog.dataset.scrollWhole === "true"
      ? dialog
      : details.closest<HTMLElement>(".workflow-help-content");
    if (scroller === null) return;
    if (kept?.id === openSection) {
      // The browser has already shown the text it found. Closing another section may have
      // moved it, so move the content back by the same distance instead of revealing the heading.
      scroller.scrollTop += details.getBoundingClientRect().top - kept.top;
      return;
    }
    // For an already open section, keep the control with a keyboard focus indicator
    // in view as the scroll area changes. Focus on the heading or its container
    // uses the normal section reveal.
    const focused = document.activeElement;
    if (
      sectionAlreadyOpen && focused instanceof HTMLElement && focused.matches(":focus-visible") &&
      scroller.contains(focused) && !focused.contains(summary)
    ) {
      scrollFocusedControlIntoView(scroller, focused);
      return;
    }
    // Measure from the heading so its divider and padding do not take up the scroll area.
    const headingTop = summary.getBoundingClientRect().top;
    const headingStyle = getComputedStyle(summary);
    const area = scroller.getBoundingClientRect();
    const areaTop = area.top + scroller.clientTop;
    // Measure the next heading on activation. Resizing keeps the open section as the target.
    const followingHeading = sectionAlreadyOpen
      ? null
      : details.nextElementSibling?.querySelector(":scope > summary");
    scroller.scrollTop += scrollDeltaToReveal({
      areaTop,
      areaHeight: Math.min(scroller.clientHeight, area.bottom - areaTop),
      sectionTop: headingTop,
      sectionHeight: details.getBoundingClientRect().bottom - headingTop,
      // The summary keeps room for its focus outline through its scroll margin.
      margin: parseFloat(headingStyle.scrollMarginTop) || 0,
      preferBottomClearance: !sectionAlreadyOpen,
      followingHeading: followingHeading ? {
        bottom: followingHeading.getBoundingClientRect().bottom,
        openHeadingOutline: focusOutlineOutset(headingStyle),
      } : undefined,
    });
  }, [openSection, scrollWholeDialog]);

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
    // This lets the effect reopen the dialog even if its close event has not been delivered yet.
    setHelp({ section, trigger, browserWorkflow: activeWorkflow, scrollToWorkflow: false });
    setOpenSection(null);
  }

  function selectHelp(section: HelpSection) {
    setHelp((current) => current === null || current.section === section
      ? current
      : { ...current, section, scrollToWorkflow: false });
    // Switching tabs starts from the main instructions, not from earlier expanded text.
    if (help !== null && help.section !== section) setOpenSection(null);
  }

  function selectBrowserWorkflow(browserWorkflow: Workflow) {
    setHelp((current) => current === null || current.browserWorkflow === browserWorkflow
      ? current
      : { ...current, browserWorkflow, scrollToWorkflow: true });
    if (help !== null && help.browserWorkflow !== browserWorkflow) setOpenSection(null);
  }

  function changeOpenSection(id: ExpandableSection, open: boolean, browserTop?: number) {
    browserOpened.current = open && browserTop !== undefined ? { id, top: browserTop } : null;
    setOpenSection((current) => {
      if (open) return id;
      return current === id ? null : current;
    });
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
          <HelpSectionLabel section="browser" />
        </button>
        <button
          type="button"
          className="workflow-help-trigger"
          aria-haspopup="dialog"
          aria-controls="workflow-help-dialog"
          tabIndex={0}
          onClick={(event) => openHelp("cli", event.currentTarget)}
        >
          <HelpSectionLabel section="cli" />
        </button>
      </div>
      <DocLink href={LINKS.documentation} className="workflow-help-trigger">
        <svg className="doc-link-icon" width="15" height="15" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
          strokeLinejoin="round" aria-hidden="true" focusable="false">
          <path d="M12 6a5 5 0 0 0-4-2H3v15h5a5 5 0 0 1 4 2 5 5 0 0 1 4-2h5V4h-5a5 5 0 0 0-4 2Zm0 0v15" />
        </svg>
        Documentation
      </DocLink>
      <dialog
        ref={dialogRef}
        id="workflow-help-dialog"
        className="workflow-help-dialog"
        data-scroll-whole={scrollWholeDialog}
        aria-labelledby="workflow-help-title"
        onFocus={(event) => {
          if (
            scrollWholeDialog && dialogRef.current !== null &&
            event.target instanceof HTMLElement && event.target.matches("a, summary") &&
            event.target.closest(".workflow-help-content") !== null
          ) {
            scrollFocusedControlIntoView(dialogRef.current, event.target);
          }
        }}
        onClose={() => help?.trigger.focus({ preventScroll: true })}
        onPointerDown={(event) => {
          // A selection can start inside but produce a click outside on release.
          const bounds = event.currentTarget.getBoundingClientRect();
          backdropPress.current = event.target === event.currentTarget && event.isPrimary && event.button === 0 && (
            event.clientX < bounds.left || event.clientX > bounds.right ||
            event.clientY < bounds.top || event.clientY > bounds.bottom
          );
        }}
        onPointerCancel={() => { backdropPress.current = false; }}
        onClick={(event) => {
          const startedOnBackdrop = backdropPress.current;
          backdropPress.current = false;
          if (!startedOnBackdrop) return;
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
              <HelpSectionLabel section="browser" />
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
              <HelpSectionLabel section="cli" />
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
                An observation records the command, whether it was accepted, and the operating
                mode before and after it ran. It also includes telemetry, a separate report of the mode.
              </p>
              <p>
                For verification, choose the scenario that describes what you expect. For inspection,
                provide the saved JSON document (evidence) you want to check.
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
                <p>Open <strong>Load example</strong> and choose <strong>Standard example</strong> or <strong>Failing example</strong>. Then choose <strong>Verify observation</strong>.</p>
                <ol>
                  <li>
                    For your own observation, select a <strong>Scenario</strong>, such as <strong>NOMINAL to SAFE</strong>.
                  </li>
                  <li>
                    Enter an <strong>Execution ID</strong> and the time the command ran in <strong>Execution time (UTC)</strong>.
                  </li>
                  <li>Paste the observation into the <strong>Observation evidence JSON</strong> field.</li>
                  <li>
                    Choose <strong>Verify observation</strong> to see the individual checks
                    and overall <strong>PASS</strong> or <strong>FAIL</strong> result.
                  </li>
                </ol>
                <ExpandableHelpSection
                  id="python-example"
                  className="workflow-help-example"
                  title="When a command returns no result (Python API example)"
                  openSection={openSection}
                  onOpenChange={changeOpenSection}
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
                  openSection={openSection}
                  onOpenChange={changeOpenSection}
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
                    Select the <strong>Evidence type</strong> that matches your document.
                  </li>
                  <li>
                    Paste the document into <strong>Evidence JSON</strong> or choose a sample from <strong>Load example</strong>.
                  </li>
                  <li>
                    Choose <strong>Inspect evidence</strong> to see the recorded values
                    and any saved verification results.
                  </li>
                </ol>
                <ExpandableHelpSection
                  id="inspection-results"
                  className="workflow-help-reference"
                  title="Understanding inspection and further reading"
                  openSection={openSection}
                  onOpenChange={changeOpenSection}
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
                openSection={openSection}
                onOpenChange={changeOpenSection}
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
                openSection={openSection}
                onOpenChange={changeOpenSection}
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
          )}
        </div>
      </dialog>
    </section>
  );
}
