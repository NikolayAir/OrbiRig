import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";
import {
  setupAppTests,
  selectInspectionWorkflow,
  selectVerificationWorkflow,
  selectVerifiedExecutionSequence,
  fetchMock,
  scrollIntoViewMock,
} from "./test/appTestSupport";

setupAppTests();

describe("App help", () => {
  it.each(["In the browser", "From the command line"])("opens only the requested %s guidance", (name) => {
    render(<App />);

    const entryPoints = within(screen.getByRole("region", { name: "How it works" }));
    const triggers = entryPoints.getAllByRole("button");
    expect(triggers.map((button) => button.textContent)).toEqual([
      "In the browser", "From the command line",
    ]);
    expect(entryPoints.getByRole("heading", { name: "How it works", level: 2 })).toBeVisible();
    const trigger = entryPoints.getByRole("button", { name });
    const help = screen.getByRole("dialog", { hidden: true });

    for (const button of triggers) {
      expect(button).toHaveAttribute("aria-haspopup", "dialog");
      expect(button).toHaveAttribute("aria-controls", help.id);
      expect(button).toHaveAttribute("tabindex", "0");
      expect(button).not.toHaveAttribute("aria-pressed");
    }
    expect(screen.getAllByRole("dialog", { hidden: true })).toHaveLength(1);
    expect(help).not.toHaveAttribute("open");

    fireEvent.click(trigger);

    expect(help).toHaveAttribute("open");
    expect(screen.getByRole("dialog", { name: "How it works" })).toBeVisible();
    const guidance = within(help);
    expect(guidance.getByRole("heading", { name: "How it works", level: 2 })).toBeVisible();
    expect(guidance.getByRole("tab", { name, selected: true })).toHaveAttribute("tabindex", "0");
    expect(guidance.getByRole("tabpanel", { name })).toBeVisible();
    if (name === "In the browser") {
      expect(guidance.getByRole("tab", { name: "Verify observation", selected: true })).toBeVisible();
      expect(guidance.getByRole("tabpanel", { name: "Verify observation" })).toBeVisible();
      expect(guidance.queryByRole("tabpanel", { name: "Inspect evidence" })).not.toBeInTheDocument();
      expect(guidance.queryByText(/OrbiRig can verify/)).not.toBeInTheDocument();
      expect(guidance.queryByRole("region", { name: "CLI verification command" })).not.toBeInTheDocument();
      expect(guidance.queryByRole("link")).not.toBeInTheDocument();
    } else {
      expect(guidance.getByRole("region", { name: "CLI verification command" })).toBeVisible();
      expect(guidance.queryByText(/OrbiRig checks command records/)).not.toBeInTheDocument();
      expect(guidance.queryByRole("list")).not.toBeInTheDocument();
    }

    fireEvent.click(within(help).getByRole("button", { name: "Close" }));

    expect(help).not.toHaveAttribute("open");
    expect(trigger).toHaveFocus();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(scrollIntoViewMock).not.toHaveBeenCalled();
  });

  it.each(["In the browser", "From the command line"])("switches help tabs without reopening the dialog opened by %s", (name) => {
    render(<App />);
    const help = screen.getByRole("dialog", { hidden: true }) as HTMLDialogElement;
    const showModal = vi.spyOn(help, "showModal");
    const close = vi.spyOn(help, "close");
    const trigger = screen.getByRole("button", { name });
    fireEvent.click(trigger);
    const otherName = name === "In the browser" ? "From the command line" : "In the browser";
    const otherTab = within(help).getByRole("tab", { name: otherName });
    within(help).getByRole("tabpanel", { name: /^(In the browser|From the command line)$/ }).scrollTop = 150;

    fireEvent.click(otherTab);

    expect(help).toHaveAttribute("open");
    expect(showModal).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled();
    expect(within(help).getByRole("tabpanel", { name: /^(In the browser|From the command line)$/ }).scrollTop).toBe(0);
    expect(otherTab).toHaveAttribute("aria-selected", "true");
    expect(otherTab).toHaveAttribute("tabindex", "0");
    const panel = within(help).getByRole("tabpanel", { name: otherName });
    expect(otherTab).toHaveAttribute("aria-controls", panel.id);
    expect(panel).toHaveAttribute("aria-labelledby", otherTab.id);
    expect(within(help).getAllByRole("tabpanel", { name: /^(In the browser|From the command line)$/ })).toHaveLength(1);
    expect(within(help).getByRole("tab", { name })).toHaveAttribute("tabindex", "-1");

    fireEvent.click(within(help).getByRole("button", { name: "Close" }));
    expect(trigger).toHaveFocus();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("selects and focuses help tabs with arrows, Home and End", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "In the browser" }));
    const help = screen.getByRole("dialog", { name: "How it works" });
    const tabs = within(help).getByRole("tablist", { name: "Help sections" });
    within(tabs).getByRole("tab", { name: "In the browser" }).focus();

    for (const [key, name] of [
      ["ArrowRight", "From the command line"],
      ["ArrowRight", "In the browser"],
      ["ArrowLeft", "From the command line"],
      ["ArrowLeft", "In the browser"],
      ["End", "From the command line"],
      ["Home", "In the browser"],
    ]) {
      within(help).getByRole("tabpanel", { name: /^(In the browser|From the command line)$/ }).scrollTop = 150;
      fireEvent.keyDown(document.activeElement!, { key });
      const selected = within(tabs).getByRole("tab", { name, selected: true });
      expect(selected).toHaveFocus();
      expect(selected).toHaveAttribute("tabindex", "0");
      expect(within(help).getByRole("tabpanel", { name })).toBeVisible();
      expect(within(help).getByRole("tabpanel", { name: /^(In the browser|From the command line)$/ }).scrollTop).toBe(0);
    }
  });

  it.each(["verification", "inspection"])("opens browser instructions for the active %s workflow on every opening", (workflow) => {
    render(<App />);
    if (workflow === "inspection") selectInspectionWorkflow();
    const selectedName = workflow === "verification" ? "Verify observation" : "Inspect evidence";
    const otherName = workflow === "verification" ? "Inspect evidence" : "Verify observation";
    const trigger = screen.getByRole("button", { name: "In the browser" });
    fireEvent.click(trigger);
    const help = within(screen.getByRole("dialog", { name: "How it works" }));
    expect(help.getByRole("tab", { name: selectedName, selected: true })).toBeVisible();
    fireEvent.click(help.getByRole("tab", { name: otherName }));
    expect(help.getByRole("tabpanel", { name: otherName })).toBeVisible();
    expect(help.queryByRole("tabpanel", { name: selectedName })).not.toBeInTheDocument();
    expect(help.getAllByRole("list")).toHaveLength(1);
    fireEvent.click(help.getByRole("button", { name: "Close" }));
    fireEvent.click(trigger);
    expect(help.getByRole("tab", { name: selectedName, selected: true })).toBeVisible();
    expect(screen.getByRole("button", {
      name: `Show ${selectedName}`,
    })).toHaveAttribute("aria-pressed", "true");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("navigates browser instruction tabs independently and retains their selection through CLI help", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "In the browser" }));
    const help = screen.getByRole("dialog", { name: "How it works" }) as HTMLDialogElement;
    const showModal = vi.spyOn(help, "showModal");
    const close = vi.spyOn(help, "close");
    const guidance = within(help);
    const tabs = guidance.getByRole("tablist", { name: "Browser instructions" });
    const browserPanel = guidance.getByRole("tabpanel", { name: "In the browser" });
    Object.defineProperty(tabs, "offsetTop", { value: 200 });
    Object.defineProperty(browserPanel, "offsetTop", { value: 100 });
    within(tabs).getByRole("tab", { name: "Verify observation" }).focus();
    for (const [key, name] of [
      ["ArrowRight", "Inspect evidence"],
      ["ArrowRight", "Verify observation"],
      ["ArrowLeft", "Inspect evidence"],
      ["ArrowLeft", "Verify observation"],
      ["End", "Inspect evidence"],
      ["Home", "Verify observation"],
      ["End", "Inspect evidence"],
    ]) {
      browserPanel.scrollTop = 500;
      fireEvent.keyDown(document.activeElement!, { key });
      const selected = within(tabs).getByRole("tab", { name, selected: true });
      const panel = guidance.getByRole("tabpanel", { name });
      expect(selected).toHaveFocus();
      expect(selected).toHaveAttribute("tabindex", "0");
      expect(within(tabs).getByRole("tab", { selected: false })).toHaveAttribute("tabindex", "-1");
      expect(selected).toHaveAttribute("aria-controls", panel.id);
      expect(panel).toHaveAttribute("aria-labelledby", selected.id);
      expect(panel).toHaveAttribute("tabindex", "0");
      expect(browserPanel.scrollTop).toBe(100);
      expect(guidance.getByRole("tab", { name: "In the browser" })).toHaveAttribute("aria-selected", "true");
    }
    fireEvent.click(guidance.getByRole("tab", { name: "From the command line" }));
    expect(guidance.queryByRole("tablist", { name: "Browser instructions" })).not.toBeInTheDocument();
    fireEvent.click(guidance.getByRole("tab", { name: "In the browser" }));
    expect(guidance.getByRole("tab", { name: "Inspect evidence", selected: true })).toBeVisible();
    expect(browserPanel.scrollTop).toBe(0);
    expect(showModal).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("starts at the top when reopening either guide or switching between them", () => {
    render(<App />);
    const help = screen.getByRole("dialog", { hidden: true });

    for (const name of ["In the browser", "In the browser", "From the command line", "From the command line", "In the browser"]) {
      fireEvent.click(screen.getByRole("button", { name }));
      expect(screen.getByRole("dialog", { name: "How it works" })).toBeVisible();
      expect(within(help).getByRole("tabpanel", { name: /^(In the browser|From the command line)$/ }).scrollTop).toBe(0);
      within(help).getByRole("tabpanel", { name: /^(In the browser|From the command line)$/ }).scrollTop = 150;
      fireEvent.click(within(help).getByRole("button", { name: "Close" }));
    }
  });

  it.each(["In the browser", "From the command line"])("reopens %s before the native close event arrives", (name) => {
    render(<App />);
    const trigger = screen.getByRole("button", { name });
    fireEvent.click(trigger);
    const help = screen.getByRole("dialog", { name: "How it works" }) as HTMLDialogElement;

    // Native close() removes open before delivering its queued close event.
    help.open = false;
    fireEvent.click(trigger);

    expect(help).toHaveAttribute("open");
    expect(screen.getByRole("dialog", { name: "How it works" })).toBeVisible();
  });

  it("explains the browser steps and keeps verification meaning precise", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "In the browser" }));

    const guidance = within(screen.getByRole("dialog", { name: "How it works" }));
    const verificationSteps = guidance.getByRole("list");

    expect(
      within(verificationSteps).getAllByRole("listitem").map((step) => step.textContent?.replace(/\s+/g, " ").trim()),
    ).toEqual([
      "Enter an execution ID and the UTC time of the recorded execution.",
      "Select a scenario describing the expected behaviour, such as switching from NOMINAL to SAFE mode.",
      "Paste the observation JSON or choose Load example to try a sample.",
      "Choose Verify observation to see the individual checks and overall PASS or FAIL result.",
    ]);

    expect(guidance.getByText(/OrbiRig checks command records/)).toHaveTextContent(
      "OrbiRig checks command records from simplified spacecraft tests. Each observation includes the command, whether it was accepted, the operating modes before and after execution, and the mode reported in telemetry (recorded status data).",
    );
    expect(guidance.getByText(/The web interface verifies and inspects submitted records/)).toHaveTextContent(
      "The web interface verifies and inspects submitted records. It does not connect to a real spacecraft, send spacecraft commands or collect live telemetry.",
    );
    expect(guidance.getByText(/means the recorded behaviour matches/)).toHaveTextContent(
      "PASS means the recorded behaviour matches the selected scenario. This can include a rejected command if rejection was expected.",
    );
    expect(guidance.getByText(/means the observation is valid/)).toHaveTextContent(
      "FAIL means the observation is valid, but the recorded behaviour does not meet the scenario's expectations. Invalid evidence is reported separately as an input error.",
    );
    expect(guidance.getByText(/The scenario defines/)).toHaveTextContent(
      "The scenario defines what should happen independently of the recorded observation.",
    );
    fireEvent.click(guidance.getByRole("tab", { name: "Inspect evidence" }));
    const inspectionSteps = guidance.getByRole("list");
    expect(
      within(inspectionSteps).getAllByRole("listitem").map((step) => step.textContent?.replace(/\s+/g, " ").trim()),
    ).toEqual([
      "Select the evidence type: observation, verified execution, or verified-execution sequence.",
      "Paste its JSON or choose Load example.",
      "Choose Inspect evidence to see the recorded values and any saved verification results.",
    ]);
    const observationInspection = guidance.getByText(/Inspecting an observation checks/);
    expect(observationInspection).toHaveTextContent(
      "Inspecting an observation checks its JSON structure and supported values. To compare the reported result with a scenario, use Verify observation.",
    );
    expect(observationInspection.querySelector("strong")).toHaveTextContent("Verify observation");
    expect(guidance.getByText(/For saved verified executions and sequences/)).toHaveTextContent(
      "For saved verified executions and sequences, OrbiRig recalculates each record's checks and outcome from its scenario and observation, then compares them with the stored results. For sequences, it also checks continuity in the saved order. A record with a FAIL outcome can still be inspected when these results match.",
    );
  });

  it("explains local CLI setup and shows a complete selectable command", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "From the command line" }));

    const help = screen.getByRole("dialog", { name: "How it works" });
    const guidance = within(help);
    const command = guidance.getByRole("region", { name: "CLI verification command" });

    expect(guidance.getAllByRole("heading").map((heading) => heading.textContent)).toEqual([
      "How it works",
    ]);
    expect(guidance.getByText(/OrbiRig can verify/)).toHaveTextContent(
      "OrbiRig can verify a saved observation from a terminal, without opening the web interface. It uses the same Python verification core. The command runs locally on your computer and does not execute spacecraft commands or collect observations.",
    );
    expect(guidance.getByText(/For this command/)).toHaveTextContent(
      "For this command, select NOMINAL to SAFE in Verify observation, choose Load example, and save the observation JSON to a UTF-8 file named observation.json. From an OrbiRig checkout, run uv sync --locked if needed, then:",
    );
    expect(command).toHaveAttribute("tabindex", "0");
    expect(command.querySelector("code")?.textContent).toBe([
      "uv run --no-sync orbirig verify-observation observation.json \\",
      "  --scenario nominal_to_safe_mode \\",
      "  --execution-id demo-001 \\",
      "  --executed-at 2026-10-21T10:00:00Z",
    ].join("\n"));
    expect(guidance.getByText(/The execution ID and timestamp/)).toHaveTextContent(
      "The execution ID and timestamp above are examples. For recorded executions, use the ID and UTC time recorded for that execution.",
    );
    expect(guidance.getByRole("link", { name: "CLI setup and full instructions" })).toHaveAttribute(
      "href",
      "https://github.com/NikolayAir/OrbiRig/blob/main/docs/cli.md",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("distinguishes completed CLI PASS and FAIL from input, file and internal errors", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "From the command line" }));

    const cli = within(screen.getByRole("dialog", { name: "How it works" }));
    const results = cli.getByText(/The command prints JSON evidence/);
    expect(results).toHaveTextContent(
      "The command prints JSON evidence in the terminal for both PASS and FAIL results. Exit code 0 means PASS and 1 means verification completed with FAIL. Invalid input returns 2, file or output errors return 3, and unexpected internal errors return 4.",
    );
    expect([...results.querySelectorAll("strong")].map((element) => element.textContent)).toEqual([
      "PASS", "FAIL", "PASS", "FAIL",
    ]);
    expect([...results.querySelectorAll("code")].map((element) => element.textContent)).toEqual([
      "0", "1", "2", "3", "4",
    ]);
  });

  it.each(["In the browser", "From the command line"])("preserves verification inputs through %s help and workflow switches", (name) => {
    render(<App />);

    fireEvent.change(screen.getByLabelText("Execution ID"), {
      target: { value: "exec-preserved" },
    });
    fireEvent.change(screen.getByLabelText("Execution time (UTC)"), {
      target: { value: "2026-08-25T18:30:00Z" },
    });
    fireEvent.change(screen.getByLabelText("Scenario"), {
      target: { value: "safe_to_nominal_mode" },
    });
    fireEvent.change(screen.getByLabelText("Observation evidence JSON"), {
      target: { value: "preserved observation" },
    });

    fireEvent.click(screen.getByRole("button", { name }));
    const help = screen.getByRole("dialog", { name: "How it works" });
    expect(help).toHaveAttribute("open");
    const otherGuide = name === "In the browser" ? "From the command line" : "In the browser";
    fireEvent.click(within(help).getByRole("tab", { name: otherGuide }));
    fireEvent.click(within(help).getByRole("tab", { name: "In the browser" }));
    fireEvent.click(within(help).getByRole("tab", { name: "Inspect evidence" }));
    fireEvent.click(within(help).getByRole("tab", { name: "Verify observation" }));
    fireEvent.click(within(help).getByRole("button", { name: "Close" }));
    selectInspectionWorkflow();
    selectVerificationWorkflow();
    expect(help).not.toHaveAttribute("open");

    expect(screen.getByLabelText("Execution ID")).toHaveValue(
      "exec-preserved",
    );
    expect(screen.getByLabelText("Execution time (UTC)")).toHaveValue(
      "2026-08-25T18:30:00Z",
    );
    expect(screen.getByLabelText("Scenario")).toHaveValue(
      "safe_to_nominal_mode",
    );
    expect(screen.getByLabelText("Observation evidence JSON")).toHaveValue(
      "preserved observation",
    );
  });

  it.each([
    ["Verify observation", "Provide execution details, select a supported scenario, and submit observation evidence for verification."],
    ["Inspect evidence", "Select an evidence type and paste its JSON to see the recorded values and any saved verification results."],
  ])("moves the %s introduction into accessible contextual help", (title, text) => {
    render(<App />);
    if (title === "Inspect evidence") selectInspectionWorkflow();

    const heading = screen.getByRole("heading", { name: title, level: 2 });
    const help = within(heading.parentElement!).getByRole("button", { name: `About ${title}` });
    const description = screen.getByText(text);

    expect(description).toHaveAttribute("role", "tooltip");
    expect(description.tagName).toBe("SPAN");
    expect(help).toHaveAccessibleDescription(description.textContent!);
    expect(help).toHaveAttribute("aria-controls", description.id);
    expect(help).toHaveTextContent("i");

    help.focus();
    fireEvent.click(help);
    expect(help.parentElement).toHaveAttribute("data-open", "true");
    fireEvent.keyDown(help, { key: "Escape" });
    expect(help.parentElement).toHaveAttribute("data-open", "false");
    expect(help.parentElement).toHaveAttribute("data-dismissed", "true");
    expect(help).toHaveFocus();

    fireEvent.click(help);
    expect(help.parentElement).toHaveAttribute("data-open", "true");
    expect(help.parentElement).toHaveAttribute("data-dismissed", "false");
    fireEvent.click(help);
    expect(help.parentElement).toHaveAttribute("data-open", "false");
    expect(help.parentElement).toHaveAttribute("data-dismissed", "true");
    expect(help).toHaveFocus();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["Verify observation", "Execution ID"],
    ["Inspect evidence", "Evidence JSON"],
  ])("dismisses %s help on outside interaction and when focus leaves", (title, outsideLabel) => {
    render(<App />);
    if (title === "Inspect evidence") selectInspectionWorkflow();

    const help = screen.getByRole("button", { name: `About ${title}` });
    help.focus();
    fireEvent.click(help);
    fireEvent.pointerDown(screen.getByLabelText(outsideLabel));
    expect(help.parentElement).toHaveAttribute("data-open", "false");
    expect(help.parentElement).toHaveAttribute("data-dismissed", "true");

    fireEvent.pointerEnter(help.parentElement!);
    expect(help.parentElement).toHaveAttribute("data-dismissed", "false");
    fireEvent.click(help);
    act(() => screen.getByLabelText(outsideLabel).focus());
    expect(help.parentElement).toHaveAttribute("data-open", "false");
    expect(help.parentElement).toHaveAttribute("data-dismissed", "true");
  });

  it("dismisses workflow introductions on switching without changing inspection inputs", () => {
    render(<App />);
    selectInspectionWorkflow();
    fireEvent.change(screen.getByLabelText("Evidence JSON"), { target: { value: "edited evidence" } });
    selectVerifiedExecutionSequence();
    fireEvent.click(screen.getByRole("button", { name: "About Inspect evidence" }));
    selectVerificationWorkflow();
    expect(screen.getByRole("button", { name: "About Verify observation" }).parentElement).toHaveAttribute("data-open", "false");
    selectInspectionWorkflow();
    expect(screen.getByRole("button", { name: "About Inspect evidence" }).parentElement).toHaveAttribute("data-open", "false");
    expect(screen.getByLabelText("Evidence JSON")).toHaveValue("edited evidence");
    expect(screen.getByRole("radio", { name: "Verified execution sequence" })).toBeChecked();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("provides accessible, dismissible Scenario help", () => {
    render(<App />);

    const help = screen.getByRole("button", { name: "About Scenario" });
    const description = screen.getByText(
      "Choose the expected behaviour for this command execution. OrbiRig checks the observation against this scenario.",
    );
    const scenario = screen.getByLabelText("Scenario");
    const helpContainer = help.parentElement;

    expect(help).toHaveAttribute(
      "aria-describedby",
      "scenario-help-description",
    );
    expect(scenario).toHaveAttribute(
      "aria-describedby",
      "scenario-help-description",
    );
    expect(description).toHaveTextContent(
      "OrbiRig checks the observation against this scenario.",
    );

    help.focus();
    expect(document.activeElement).toBe(help);

    fireEvent.click(help);
    expect(helpContainer).toHaveAttribute("data-open", "true");

    fireEvent.click(help);
    expect(helpContainer).toHaveAttribute("data-open", "false");
    expect(helpContainer).toHaveAttribute("data-dismissed", "true");
    expect(help).toHaveFocus();

    fireEvent.click(help);
    expect(helpContainer).toHaveAttribute("data-open", "true");
    expect(helpContainer).toHaveAttribute("data-dismissed", "false");

    fireEvent.keyDown(help, { key: "Escape" });
    expect(helpContainer).toHaveAttribute("data-open", "false");
    expect(helpContainer).toHaveAttribute("data-dismissed", "true");
    expect(help).toHaveFocus();
  });

  it("provides accessible, dismissible Execution ID help", () => {
    render(<App />);

    const help = screen.getByRole("button", { name: "About Execution ID" });
    const description = screen.getByText(
      "A label you provide for this command execution, such as run-001. It is saved with the result.",
    );
    const executionId = screen.getByLabelText("Execution ID");
    const helpContainer = help.parentElement;

    expect(help).toHaveAttribute(
      "aria-describedby",
      "execution-id-help-description",
    );
    expect(executionId).toHaveAttribute(
      "aria-describedby",
      "execution-id-help-description",
    );
    expect(description).toHaveAttribute("role", "tooltip");

    help.focus();
    fireEvent.click(help);
    expect(helpContainer).toHaveAttribute("data-open", "true");

    fireEvent.click(help);
    expect(helpContainer).toHaveAttribute("data-open", "false");
    expect(helpContainer).toHaveAttribute("data-dismissed", "true");
    expect(help).toHaveFocus();

    fireEvent.click(help);
    expect(helpContainer).toHaveAttribute("data-dismissed", "false");
    fireEvent.keyDown(help, { key: "Escape" });
    expect(helpContainer).toHaveAttribute("data-open", "false");
    expect(helpContainer).toHaveAttribute("data-dismissed", "true");
    expect(help).toHaveFocus();
  });

  it("keeps only one contextual-help control click-pinned at a time", () => {
    render(<App />);

    const executionIdHelp = screen.getByRole("button", {
      name: "About Execution ID",
    });
    const scenarioHelp = screen.getByRole("button", {
      name: "About Scenario",
    });

    fireEvent.click(executionIdHelp);
    expect(executionIdHelp.parentElement).toHaveAttribute("data-open", "true");
    expect(scenarioHelp.parentElement).toHaveAttribute("data-open", "false");

    fireEvent.click(scenarioHelp);
    expect(executionIdHelp.parentElement).toHaveAttribute("data-open", "false");
    expect(scenarioHelp.parentElement).toHaveAttribute("data-open", "true");
  });

  it.each([
    ["About Execution ID", "Execution ID"],
    ["About Scenario", "Scenario"],
  ])(
    "dismisses pinned %s on outside pointer interaction",
    (helpName, outsideLabel) => {
      render(<App />);

      const help = screen.getByRole("button", { name: helpName });
      const outsideControl = screen.getByLabelText(outsideLabel);
      help.focus();
      fireEvent.click(help);

      expect(help.parentElement).toHaveAttribute("data-open", "true");
      expect(document.activeElement).toBe(help);

      fireEvent.pointerDown(outsideControl);

      expect(help.parentElement).toHaveAttribute("data-open", "false");
      expect(document.activeElement).not.toBe(help);
    },
  );
});
