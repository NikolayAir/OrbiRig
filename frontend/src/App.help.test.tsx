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
  it("shows the steps first and reveals explanations and documentation on demand", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "In the browser" }));
    const help = within(screen.getByRole("dialog", { name: "How it works" }));
    expect(help.getByText(/The examples use a simplified spacecraft/)).toBeVisible();
    for (const name of ["Verify observation", "Inspect evidence"]) {
      fireEvent.click(help.getByRole("tab", { name }));
      const panel = help.getByRole("tabpanel", { name });
      const details = panel.querySelector(".workflow-help-reference")!;
      expect(details).not.toHaveAttribute("open");
      expect(panel.querySelector("ol")).toBeVisible();
      expect(details.querySelector("a")).not.toBeVisible();
      fireEvent.click(details.querySelector("summary")!);
      expect(details.querySelector("a")).toBeVisible();
      fireEvent.click(details.querySelector("summary")!);
      expect(details.querySelector("a")).not.toBeVisible();
    }
  });

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
      expect(within(guidance.getByRole("tabpanel", { name: "Verify observation" }).querySelector(".workflow-help-links")!).getAllByRole("link")).toHaveLength(2);
    } else {
      expect(guidance.getByRole("region", { name: "CLI verification command" })).toBeVisible();
      expect(guidance.queryByText(/OrbiRig checks recorded command results/)).not.toBeInTheDocument();
      expect(guidance.getByText("Example outcomes from a local run")).not.toBeVisible();
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
    expect(within(help.getByRole("tabpanel", { name: otherName })).getAllByRole("list")).toHaveLength(otherName === "Verify observation" ? 3 : 2);
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
    const verificationSteps = guidance.getByRole("tabpanel", { name: "Verify observation" }).querySelector<HTMLOListElement>(":scope > ol")!;

    expect(
      within(verificationSteps).getAllByRole("listitem").map((step) => step.textContent?.replace(/\s+/g, " ").trim()),
    ).toEqual([
      "Enter an execution ID and the UTC time of the recorded execution.",
      "Select a scenario describing the expected behaviour, such as switching from NOMINAL to SAFE mode.",
      "Paste the observation JSON, or choose Load example or Load failing example to try a sample.",
      "Choose Verify observation to see the individual checks and overall PASS or FAIL result.",
    ]);

    const browserPanel = within(guidance.getByRole("tabpanel", { name: "In the browser" }));
    expect(browserPanel.getByText(/OrbiRig checks recorded command results/)).toHaveTextContent(
      "OrbiRig checks recorded command results against expectations defined independently of the recorded data. When verification can proceed, it shows which checks pass or fail; invalid input is reported separately. It rechecks saved verification results for consistency with the recorded data.",
    );
    expect(guidance.getByRole("tabpanel", { name: "In the browser" }).querySelector("p"))
      .toBe(browserPanel.getByText(/OrbiRig checks recorded command results/));
    expect(browserPanel.queryByText(/^You can verify recorded observations/)).not.toBeInTheDocument();
    expect(guidance.getByText(/The examples use a simplified spacecraft/)).toHaveTextContent(
      "The examples use a simplified spacecraft model with two operating modes, NOMINAL and SAFE. A command requests a mode; an observation records the request, whether it was accepted, the mode before and after, and a separately reported mode (telemetry). OrbiRig currently supports three such scenarios. This approach shares principles with software testing and data-quality practices, such as checking API responses against expected values or validating data in processing pipelines.",
    );
    expect(browserPanel.getByText(/^The web interface verifies submitted/)).toHaveTextContent(
      "The web interface verifies submitted command results and inspects saved records. It does not connect to external systems, send commands or collect live data.",
    );
    expect(guidance.getByText(/means the recorded behaviour matches/)).toHaveTextContent(
      "PASS means the recorded behaviour matches the selected scenario. This can include a rejected command if rejection was expected.",
    );
    expect(guidance.getByText(/means the observation is valid/)).toHaveTextContent(
      "FAIL means the observation is valid, but one or more verification checks do not meet their expectations. Invalid input, including a command that does not match the selected scenario, is reported as an error instead of FAIL.",
    );
    expect(guidance.getByText(/Choose the scenario based/)).toHaveTextContent(
      "Choose the scenario based on the behaviour you intended to test, not on the values reported in the observation.",
    );
    expect(guidance.getByText(/are completed results/)).toHaveTextContent(
      "Both PASS and FAIL are completed results. Verify observation stays unavailable until an input changes, since identical inputs produce the same result. Editing an input clears the previous result and prompts a new check.",
    );
    fireEvent.click(guidance.getByRole("tab", { name: "Inspect evidence" }));
    const [inspectionSteps] = within(guidance.getByRole("tabpanel", { name: "Inspect evidence" })).getAllByRole("list");
    expect(
      within(inspectionSteps).getAllByRole("listitem").map((step) => step.textContent?.replace(/\s+/g, " ").trim()),
    ).toEqual([
      "Select the evidence type: observation, verified execution, or verified-execution sequence.",
      "Paste its JSON or load an example. Load altered example shows why evidence with repeated fields or outdated saved results is rejected.",
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
    expect(within(guidance.getByRole("tabpanel", { name: "Inspect evidence" })).getByText(/After a successful inspection/)).toHaveTextContent(
      "After a successful inspection, Inspect evidence stays unavailable until the JSON or evidence type changes, since identical inputs produce the same result. Editing either clears the result and prompts a new inspection.",
    );
  });

  it("offers the optional .NET guide in CLI help without executing a target or changing inputs", () => {
    render(<App />);
    const input = screen.getByLabelText("Execution ID", { exact: true });
    fireEvent.change(input, { target: { value: "keep-during-dotnet-help" } });
    const trigger = screen.getByRole("button", { name: "From the command line" });
    fireEvent.click(trigger);
    const help = within(screen.getByRole("dialog", { name: "How it works" }));
    const panel = within(help.getByRole("tabpanel", { name: "From the command line" }));
    const summary = panel.getByText("Verify a C#/.NET program (optional)", { selector: "summary" });
    const details = summary.closest("details")!;
    const link = within(details).getByRole("link", { name: /^Build and verify the C#\/\.NET example/, hidden: true });
    expect(details).not.toHaveAttribute("open");
    expect(link).not.toBeVisible();
    expect(panel.getByRole("region", { name: "CLI verification command" })).toBeVisible();

    fireEvent.click(summary);

    expect(link).toBeVisible();
    expect(details).toHaveTextContent("You can use the Python API to verify command responses from an independent C#/.NET program against a scenario you choose.");
    const outcomes = within(details).getAllByRole("listitem");
    expect(outcomes).toHaveLength(3);
    expect(outcomes[0]).toHaveTextContent(/Round trip.*PASS.*continuity/);
    expect(outcomes[1]).toHaveTextContent(/Stale telemetry.*saves SAFE.*reports NOMINAL.*verification FAIL/);
    expect(outcomes[2]).toHaveTextContent(/Collection error.*before returning an observation.*without creating a verified record/);
    expect(details).toHaveTextContent("The .NET 10 SDK is needed only to build and run this example.");
    expect(details).toHaveTextContent("The browser and CLI verify recorded JSON independently of the local run.");
    expect(link).toHaveAttribute("href", "https://github.com/NikolayAir/OrbiRig/blob/main/docs/dotnet-stateful-target.md");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer");
    fireEvent.click(help.getByRole("tab", { name: "In the browser" }));
    expect(help.queryByText("Verify a C#/.NET program (optional)")).not.toBeInTheDocument();
    fireEvent.click(help.getByRole("button", { name: "Close" }));
    expect(trigger).toHaveFocus();
    expect(input).toHaveValue("keep-during-dotnet-help");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("illustrates a missing command response separately from a verified FAIL without executing anything", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "In the browser" }));
    const help = within(screen.getByRole("dialog", { name: "How it works" }));
    const summary = help.getByText("When a command returns no result (Python API example)", { selector: "summary" });
    const example = summary.closest("details")!;
    const illustration = within(example);

    const verificationPanel = help.getByRole("tabpanel", { name: "Verify observation" });
    const verificationSteps = verificationPanel.firstElementChild!;
    expect(verificationSteps.tagName).toBe("OL");
    expect(within(verificationSteps as HTMLElement).getAllByRole("listitem")).toHaveLength(4);
    expect(verificationSteps.nextElementSibling).toBe(example);
    expect(example.nextElementSibling).toHaveTextContent("PASS means the recorded behaviour matches the selected scenario.");
    expect(example).not.toHaveAttribute("open");
    const exampleIntro = illustration.getByText("Example from a local run using the Python API.");
    expect(exampleIntro).not.toBeVisible();
    fireEvent.click(summary);
    expect(example).toHaveAttribute("open");
    expect(exampleIntro).toBeVisible();
    expect(illustration.getAllByRole("listitem").map((step) => step.textContent?.replace(/\s+/g, " ").trim())).toEqual([
      "A command requests a change from NOMINAL to SAFE.",
      "The independent test target saves SAFE, then exits before returning an observation.",
      "OrbiRig reports a collection error. No verification PASS or FAIL is produced.",
      "In this controlled example, a separate check of the target's state file confirms SAFE was saved.",
      "The next command starts from SAFE, changes to NOMINAL and produces PASS.",
    ]);
    expect(illustration.getByText(/A missing response/)).toHaveTextContent(
      "A missing response does not prove that a command failed to execute. The collection error alone does not establish the state of an external system.",
    );
    expect(help.getByText(/means the observation is valid/)).toHaveTextContent(
      "FAIL means the observation is valid, but one or more verification checks do not meet their expectations.",
    );
    const link = illustration.getByRole("link", { name: /^Reproduce the stateful-target example/ });
    expect(link).toHaveAttribute("href", "https://github.com/NikolayAir/OrbiRig/blob/main/docs/stateful-target.md#simulate-a-response-failure-after-state-commit");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer");
    expect(illustration.queryByRole("button")).not.toBeInTheDocument();
    expect(help.queryByRole("alert")).not.toBeInTheDocument();
    expect(help.queryByRole("status")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(help.getByRole("tab", { name: "Inspect evidence" }));
    expect(example).not.toBeVisible();
    expect(within(help.getByRole("tabpanel", { name: "Inspect evidence" })).queryByText("When a command returns no result (Python API example)")).not.toBeInTheDocument();
    // Returning does not bring back the text that was open before leaving.
    fireEvent.click(help.getByRole("tab", { name: "Verify observation" }));
    expect(summary).toBeVisible();
    expect(example).not.toHaveAttribute("open");
    expect(illustration.getByText("Example from a local run using the Python API.")).not.toBeVisible();
    fireEvent.click(summary);
    expect(example).toHaveAttribute("open");
    fireEvent.click(summary);
    expect(example).not.toHaveAttribute("open");
    fireEvent.click(help.getByRole("tab", { name: "From the command line" }));
    expect(help.queryByText("When a command returns no result (Python API example)", { selector: "summary" })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  describe("expandable sections", () => {
    const EXAMPLE = "When a command returns no result (Python API example)";
    const RESULTS = "Understanding results and further reading";
    const INSPECTION = "Understanding inspection and further reading";
    const CLI_RESULTS = "Understanding CLI results and exit codes";
    const DOTNET = "Verify a C#/.NET program (optional)";

    function openGuide(name: "In the browser" | "From the command line") {
      render(<App />);
      fireEvent.click(screen.getByRole("button", { name }));
      const dialog = screen.getByRole("dialog", { name: "How it works" });
      const help = within(dialog);
      return {
        dialog,
        help,
        toggle: (title: string) => fireEvent.click(help.getByText(title, { selector: "summary" })),
        // Reads every open section, including those in panels that are not shown.
        opened: () => [...dialog.querySelectorAll("details[open] > summary")].map((summary) => summary.textContent),
      };
    }

    it("closes the open section when another one is opened, and when it is selected again", () => {
      const { toggle, opened } = openGuide("In the browser");

      toggle(EXAMPLE);
      expect(opened()).toEqual([EXAMPLE]);
      toggle(RESULTS);
      expect(opened()).toEqual([RESULTS]);
      toggle(RESULTS);
      expect(opened()).toEqual([]);
    });

    it("starts closed after switching workflow or tab, and after the guide is reopened", () => {
      const { help, toggle, opened } = openGuide("In the browser");

      toggle(EXAMPLE);
      fireEvent.click(help.getByRole("tab", { name: "Inspect evidence" }));
      expect(opened()).toEqual([]);
      toggle(INSPECTION);
      // Selecting the tab that is already shown does not discard what the reader opened.
      fireEvent.click(help.getByRole("tab", { name: "Inspect evidence" }));
      fireEvent.click(help.getByRole("tab", { name: "In the browser" }));
      expect(opened()).toEqual([INSPECTION]);
      fireEvent.click(help.getByRole("tab", { name: "From the command line" }));
      expect(opened()).toEqual([]);
      toggle(CLI_RESULTS);
      expect(opened()).toEqual([CLI_RESULTS]);
      toggle(DOTNET);
      expect(opened()).toEqual([DOTNET]);
      fireEvent.click(help.getByRole("tab", { name: "In the browser" }));
      fireEvent.click(help.getByRole("tab", { name: "From the command line" }));
      expect(opened()).toEqual([]);

      toggle(DOTNET);
      fireEvent.click(help.getByRole("button", { name: "Close" }));
      fireEvent.click(screen.getByRole("button", { name: "From the command line" }));
      expect(opened()).toEqual([]);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("follows the browser when it opens or closes a section without a click", () => {
      const { dialog, toggle, opened } = openGuide("In the browser");
      const section = (title: string) => within(dialog).getByText(title, { selector: "summary" }).closest("details")!;

      toggle(EXAMPLE);
      // Searching for text on the page makes the browser expand the section that contains it.
      const results = section(RESULTS);
      results.open = true;
      fireEvent(results, new Event("toggle"));
      expect(opened()).toEqual([RESULTS]);
      results.open = false;
      fireEvent(results, new Event("toggle"));
      expect(opened()).toEqual([]);
    });
  });

  describe("revealing an opened section", () => {
    // jsdom has no layout, so each element reports the geometry the test gives it.
    function placeAt(element: HTMLElement, { top, height, clientHeight = height }: { top: number; height: number; clientHeight?: number }) {
      element.getBoundingClientRect = () => ({
        top, height, bottom: top + height, y: top, left: 0, right: 0, x: 0, width: 0, toJSON: () => ({}),
      });
      Object.defineProperty(element, "clientHeight", { configurable: true, value: clientHeight });
    }

    function openExample() {
      render(<App />);
      fireEvent.click(screen.getByRole("button", { name: "In the browser" }));
      const dialog = screen.getByRole("dialog", { name: "How it works" }) as HTMLDialogElement;
      const panel = within(dialog).getByRole("tabpanel", { name: "In the browser" });
      const summary = within(dialog).getByText("When a command returns no result (Python API example)", { selector: "summary" });
      const followingHeading = within(dialog).getByText("Understanding results and further reading", { selector: "summary" });
      return { dialog, panel, summary, followingHeading, details: summary.closest("details")! };
    }

    it("scrolls the content panel just far enough to show a section that fits", () => {
      const { panel, summary, followingHeading, details } = openExample();
      const pageScroll = vi.spyOn(window, "scrollTo");
      placeAt(panel, { top: 100, height: 400 });
      placeAt(details, { top: 450, height: 300 });
      placeAt(summary, { top: 483, height: 30 });
      placeAt(followingHeading, { top: 798, height: 90 });
      panel.scrollTop = 40;

      fireEvent.click(summary);

      // The section ends 250px below the visible area, so the panel moves by that distance.
      expect(panel.scrollTop).toBe(290);
      // Closing it leaves the position alone.
      fireEvent.click(summary);
      expect(panel.scrollTop).toBe(290);
      expect(pageScroll).not.toHaveBeenCalled();
      expect(scrollIntoViewMock).not.toHaveBeenCalled();
    });

    it("reveals a long section's heading below its divider in a short dialog", () => {
      const { dialog, panel, summary, followingHeading, details } = openExample();
      // The rendered switch to whole-dialog scrolling is checked in the browser tests.
      dialog.dataset.scrollWhole = "true";
      placeAt(dialog, { top: 0, height: 414 });
      placeAt(panel, { top: 160, height: 2000 });
      placeAt(details, { top: 700, height: 900 });
      // A wrapped heading fits only when the divider and its padding are scrolled away.
      placeAt(summary, { top: 733, height: 370 });
      placeAt(followingHeading, { top: 1650, height: 80 });
      summary.style.scrollMarginTop = "16px";

      fireEvent.click(summary);

      expect(dialog.scrollTop).toBe(717);
      expect(panel.scrollTop).toBe(0);
    });

    it("keeps a section that the browser opened where the browser put it", () => {
      const { panel, summary } = openExample();
      const example = summary.closest("details")!;
      const results = within(panel).getByText("Understanding results and further reading", { selector: "summary" }).closest("details")!;
      fireEvent.click(summary);
      placeAt(panel, { top: 100, height: 400 });
      // Closing the example above it moves the results section up by 250px.
      results.getBoundingClientRect = () => {
        const top = example.open ? 450 : 200;
        return { top, height: 300, bottom: top + 300, y: top, left: 0, right: 0, x: 0, width: 0, toJSON: () => ({}) };
      };
      panel.scrollTop = 300;

      // Finding text on the page makes the browser open the section and scroll to the text.
      results.open = true;
      fireEvent(results, new Event("toggle"));

      expect(example).not.toHaveAttribute("open");
      // The panel moves back by the same distance instead of revealing the heading.
      expect(panel.scrollTop).toBe(50);
    });

    it("leaves the position alone when the whole section is already visible", () => {
      const { panel, summary, followingHeading, details } = openExample();
      placeAt(panel, { top: 100, height: 400 });
      placeAt(details, { top: 120, height: 200 });
      placeAt(summary, { top: 153, height: 30 });
      placeAt(followingHeading, { top: 380, height: 30 });
      panel.scrollTop = 75;

      fireEvent.click(summary);

      expect(panel.scrollTop).toBe(75);
    });
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
    const cliPanel = within(guidance.getByRole("tabpanel", { name: "From the command line" }));
    expect(cliPanel.getByText(/^You can verify recorded observations/)).toHaveTextContent(
      "You can verify recorded observations by submitting JSON in the browser or passing a local JSON file path on the command line. Both interfaces use the same Python verification core. Use the Python API to collect new observations from a separate program.",
    );
    expect(guidance.getByRole("tabpanel", { name: "From the command line" }).querySelector("p"))
      .toBe(cliPanel.getByText(/^You can verify recorded observations/));
    expect(cliPanel.queryByText(/OrbiRig checks recorded command results/)).not.toBeInTheDocument();
    expect(guidance.getByText(/To try the included example/)).toHaveTextContent(
      "To try the included example, open a terminal in an OrbiRig checkout. Run uv sync --locked if the Python environment is not yet installed, then:",
    );
    expect(command).toHaveAttribute("tabindex", "0");
    expect(command.querySelector("code")?.textContent).toBe([
      "uv run --no-sync orbirig verify-observation docs/examples/nominal-to-safe.json \\",
      "  --scenario nominal_to_safe_mode \\",
      "  --execution-id demo-001 \\",
      "  --executed-at 2026-10-21T10:00:00Z",
    ].join("\n"));
    expect(guidance.getByText(/The execution ID and UTC timestamp/)).toHaveTextContent(
      "The execution ID and UTC timestamp are example values. For your own recorded execution, replace the file path with a UTF-8 observation JSON file and use the recorded execution ID and time.",
    );
    expect(guidance.getByText(/The command prints JSON evidence/)).toHaveTextContent(
      "The command prints JSON evidence containing the individual checks and overall PASS or FAIL result.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the CLI essentials visible and puts exit codes and documentation in their own section", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "From the command line" }));

    const cli = within(screen.getByRole("dialog", { name: "How it works" }));
    const summary = cli.getByText("Understanding CLI results and exit codes", { selector: "summary" });
    const section = summary.closest("details")!;

    // Setup, the command and the output summary are outside expandable sections.
    expect(cli.getByText(/To try the included example/)).toBeVisible();
    expect(cli.getByRole("region", { name: "CLI verification command" })).toBeVisible();
    const output = cli.getByText(/The command prints JSON evidence/);
    expect(output).toBeVisible();
    expect(output).toHaveTextContent(
      "The command prints JSON evidence containing the individual checks and overall PASS or FAIL result.",
    );
    expect(output).not.toHaveTextContent(/exit code/i);

    // Exit codes and the documentation link wait in a section that starts closed.
    expect(section).not.toHaveAttribute("open");
    const codes = within(section).getByText(/^Exit code/);
    expect(codes).not.toBeVisible();
    fireEvent.click(summary);
    expect(section).toHaveAttribute("open");
    expect(codes).toBeVisible();
    // Completed PASS and FAIL stay apart from input, file and internal errors.
    expect(codes).toHaveTextContent(
      "Exit code 0 means PASS, while 1 means verification completed with FAIL. Invalid input returns 2, file or output errors return 3, and unexpected internal errors return 4.",
    );
    expect([...codes.querySelectorAll("strong")].map((element) => element.textContent)).toEqual(["PASS", "FAIL"]);
    expect([...codes.querySelectorAll("code")].map((element) => element.textContent)).toEqual([
      "0", "1", "2", "3", "4",
    ]);
    const link = within(section).getByRole("link", { name: /^CLI setup and full instructions/ });
    expect(link).toBeVisible();
    expect(link).toHaveAttribute("href", "https://github.com/NikolayAir/OrbiRig/blob/main/docs/cli.md");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer");

    // The optional C#/.NET example is a separate section, and opening it replaces this one.
    const dotnetSummary = cli.getByText("Verify a C#/.NET program (optional)", { selector: "summary" });
    const dotnet = dotnetSummary.closest("details")!;
    expect(section.contains(dotnet)).toBe(false);
    fireEvent.click(dotnetSummary);
    expect(dotnet).toHaveAttribute("open");
    expect(section).not.toHaveAttribute("open");
    expect(fetchMock).not.toHaveBeenCalled();
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
    ["Verify observation", "observation-verification", "Compare a recorded result with a scenario."],
    ["Inspect evidence", "evidence-inspection", "Validate saved records and recheck any verification results they contain."],
  ])("keeps %s headings and instructions accessible without introduction help", (title, headingId, guidance) => {
    render(<App />);
    if (title === "Inspect evidence") selectInspectionWorkflow();

    const region = screen.getByRole("region", { name: title });
    const heading = within(region).getByRole("heading", { name: title, level: 2 });
    expect(heading).toHaveAttribute("id", headingId);
    expect(region).toHaveAttribute("aria-labelledby", headingId);
    expect(screen.queryByRole("button", { name: `About ${title}` })).not.toBeInTheDocument();
    expect(within(screen.getByRole("button", { name: `Show ${title}` })).getByText(guidance)).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "In the browser" }));
    const help = within(screen.getByRole("dialog", { name: "How it works" }));
    fireEvent.click(help.getByRole("tab", { name: title }));
    const instructions = help.getByRole("tabpanel", { name: title });
    expect(instructions).toBeVisible();
    const steps = instructions.querySelector(":scope > ol");
    expect(steps).toBeVisible();
    expect(steps).toHaveTextContent(`Choose ${title} to see`);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("dismisses field help on switching without changing inspection inputs", () => {
    render(<App />);
    selectInspectionWorkflow();
    fireEvent.change(screen.getByLabelText("Evidence JSON"), { target: { value: "edited evidence" } });
    selectVerifiedExecutionSequence();
    fireEvent.click(screen.getByRole("button", { name: "About Evidence JSON" }));
    selectVerificationWorkflow();
    expect(screen.getByRole("button", { name: "About Execution ID" }).parentElement).toHaveAttribute("data-open", "false");
    selectInspectionWorkflow();
    expect(screen.getByRole("button", { name: "About Evidence JSON" }).parentElement).toHaveAttribute("data-open", "false");
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
      "A label you choose for this recorded command, such as run-001. It is saved with the result.",
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

    const evidenceHelp = screen.getByRole("button", { name: "About Observation evidence JSON" });
    fireEvent.click(evidenceHelp);
    expect(scenarioHelp.parentElement).toHaveAttribute("data-open", "false");
    expect(evidenceHelp.parentElement).toHaveAttribute("data-open", "true");
  });

  it("provides accessible Evidence JSON help and closes it when switching workflows", () => {
    render(<App />);
    selectInspectionWorkflow();
    const help = screen.getByRole("button", { name: "About Evidence JSON" });
    const input = screen.getByLabelText("Evidence JSON", { exact: true });
    const description = "Paste the full JSON document matching the selected evidence type: observation, verified execution, or verified-execution sequence. Use Load example to see the expected structure.";
    expect(help).toHaveAccessibleDescription(description);
    expect(input).toHaveAccessibleDescription(description);
    fireEvent.change(input, { target: { value: "preserved JSON" } });
    fireEvent.click(help);
    expect(help.parentElement).toHaveAttribute("data-open", "true");
    fireEvent.keyDown(help, { key: "Escape" });
    expect(help.parentElement).toHaveAttribute("data-open", "false");
    fireEvent.click(help);
    selectVerificationWorkflow();
    selectInspectionWorkflow();
    expect(screen.getByRole("button", { name: "About Evidence JSON" }).parentElement).toHaveAttribute("data-open", "false");
    expect(screen.getByLabelText("Evidence JSON", { exact: true })).toHaveValue("preserved JSON");
  });

  it.each([
    ["About Execution ID", "Execution ID"],
    ["About Scenario", "Scenario"],
    ["About Observation evidence JSON", "Observation evidence JSON"],
    ["About Evidence JSON", "Evidence JSON"],
  ])(
    "dismisses pinned %s on outside pointer interaction",
    (helpName, outsideLabel) => {
      render(<App />);
      if (helpName === "About Evidence JSON") selectInspectionWorkflow();

      const help = screen.getByRole("button", { name: helpName });
      const outsideControl = screen.getByLabelText(outsideLabel);
      help.focus();
      fireEvent.click(help);

      expect(help.parentElement).toHaveAttribute("data-open", "true");
      expect(document.activeElement).toBe(help);

      fireEvent.pointerDown(outsideControl);

      expect(help.parentElement).toHaveAttribute("data-open", "false");
      expect(help.parentElement).toHaveAttribute("data-dismissed", "true");
      expect(document.activeElement).not.toBe(help);
      fireEvent.pointerEnter(help.parentElement!);
      expect(help.parentElement).toHaveAttribute("data-dismissed", "false");
    },
  );

  it.each([
    ["Verify observation", ["Supported scenarios and checks", "Execution ID and UTC time rules"]],
    ["Inspect evidence", ["Evidence formats and JSON rules", "How saved evidence is rechecked", "What validation establishes"]],
  ])("links %s guidance to its documentation without leaving the page", (tab, names) => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "In the browser" }));
    const guidance = within(screen.getByRole("dialog", { name: "How it works" }));
    fireEvent.click(guidance.getByRole("tab", { name: tab }));
    const links = within(guidance.getByRole("tabpanel", { name: tab }).querySelector(".workflow-help-links")!).getAllByRole("link");
    expect(links.map(link => link.textContent)).toEqual(names.map(name => `${name} (opens in a new tab)`));
    for (const link of links) {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noreferrer");
    }
  });

  it("offers the documentation beside the help actions", () => {
    render(<App />);
    const section = within(screen.getByRole("region", { name: "How it works" }));
    expect(section.getByRole("link", { name: /^Documentation/ })).toHaveAttribute(
      "href", "https://github.com/NikolayAir/OrbiRig#documentation",
    );
  });
});
