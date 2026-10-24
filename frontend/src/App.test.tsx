import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";

const observation = {
  command: {
    command_type: "SET_OPERATING_MODE",
    target_mode: "SAFE",
  },
  pre_state: {
    operating_mode: "NOMINAL",
  },
  acknowledgement: {
    accepted: true,
  },
  post_state: {
    operating_mode: "SAFE",
  },
  telemetry: {
    operating_mode: "SAFE",
  },
};

const observationEvidenceDocument = JSON.stringify(
  {
    evidence_format_version: 1,
    ...observation,
  },
  null,
  2,
);

const expectedNominalToSafeObservationExample = {
  evidence_format_version: 1,
  command: {
    command_type: "SET_OPERATING_MODE",
    target_mode: "SAFE",
  },
  pre_state: {
    operating_mode: "NOMINAL",
  },
  acknowledgement: {
    accepted: true,
  },
  post_state: {
    operating_mode: "SAFE",
  },
  telemetry: {
    operating_mode: "SAFE",
  },
};

const expectedNominalToNominalRejectionObservationExample = {
  evidence_format_version: 1,
  command: {
    command_type: "SET_OPERATING_MODE",
    target_mode: "NOMINAL",
  },
  pre_state: {
    operating_mode: "NOMINAL",
  },
  acknowledgement: {
    accepted: false,
  },
  post_state: {
    operating_mode: "NOMINAL",
  },
  telemetry: {
    operating_mode: "NOMINAL",
  },
};

const expectedSafeToNominalObservationExample = {
  evidence_format_version: 1,
  command: {
    command_type: "SET_OPERATING_MODE",
    target_mode: "NOMINAL",
  },
  pre_state: {
    operating_mode: "SAFE",
  },
  acknowledgement: {
    accepted: true,
  },
  post_state: {
    operating_mode: "NOMINAL",
  },
  telemetry: {
    operating_mode: "NOMINAL",
  },
};

const expectedVerifiedExecutionInspectionExample = {
  schema_version: 1,
  execution: {
    execution_id: "example-execution-001",
    scenario_id: "nominal_to_safe_mode",
    executed_at: "2026-08-26T08:30:00Z",
  },
  observation: {
    command: {
      command_type: "SET_OPERATING_MODE",
      target_mode: "SAFE",
    },
    pre_state: {
      operating_mode: "NOMINAL",
    },
    acknowledgement: {
      accepted: true,
    },
    post_state: {
      operating_mode: "SAFE",
    },
    telemetry: {
      operating_mode: "SAFE",
    },
  },
  invariant_results: [
    {
      invariant_id: "pre_state_matches_expected",
      passed: true,
      expected: "NOMINAL",
      actual: "NOMINAL",
    },
    {
      invariant_id: "acknowledgement_is_accepted",
      passed: true,
      expected: true,
      actual: true,
    },
    {
      invariant_id: "post_state_matches_requested_mode",
      passed: true,
      expected: "SAFE",
      actual: "SAFE",
    },
    {
      invariant_id: "telemetry_matches_post_state",
      passed: true,
      expected: "SAFE",
      actual: "SAFE",
    },
  ],
  outcome: "PASS",
};

const expectedVerifiedExecutionSequenceInspectionExample = {
  schema_version: 1,
  records: [
    {
      schema_version: 1,
      execution: {
        execution_id: "example-sequence-001",
        scenario_id: "nominal_to_safe_mode",
        executed_at: "2026-08-26T08:30:00Z",
      },
      observation: {
        command: {
          command_type: "SET_OPERATING_MODE",
          target_mode: "SAFE",
        },
        pre_state: {
          operating_mode: "NOMINAL",
        },
        acknowledgement: {
          accepted: true,
        },
        post_state: {
          operating_mode: "SAFE",
        },
        telemetry: {
          operating_mode: "SAFE",
        },
      },
      invariant_results: [
        {
          invariant_id: "pre_state_matches_expected",
          passed: true,
          expected: "NOMINAL",
          actual: "NOMINAL",
        },
        {
          invariant_id: "acknowledgement_is_accepted",
          passed: true,
          expected: true,
          actual: true,
        },
        {
          invariant_id: "post_state_matches_requested_mode",
          passed: true,
          expected: "SAFE",
          actual: "SAFE",
        },
        {
          invariant_id: "telemetry_matches_post_state",
          passed: true,
          expected: "SAFE",
          actual: "SAFE",
        },
      ],
      outcome: "PASS",
    },
    {
      schema_version: 1,
      execution: {
        execution_id: "example-sequence-002",
        scenario_id: "safe_to_nominal_mode",
        executed_at: "2026-08-26T08:35:00Z",
      },
      observation: {
        command: {
          command_type: "SET_OPERATING_MODE",
          target_mode: "NOMINAL",
        },
        pre_state: {
          operating_mode: "SAFE",
        },
        acknowledgement: {
          accepted: true,
        },
        post_state: {
          operating_mode: "NOMINAL",
        },
        telemetry: {
          operating_mode: "NOMINAL",
        },
      },
      invariant_results: [
        {
          invariant_id: "pre_state_matches_expected",
          passed: true,
          expected: "SAFE",
          actual: "SAFE",
        },
        {
          invariant_id: "acknowledgement_is_accepted",
          passed: true,
          expected: true,
          actual: true,
        },
        {
          invariant_id: "post_state_matches_requested_mode",
          passed: true,
          expected: "NOMINAL",
          actual: "NOMINAL",
        },
        {
          invariant_id: "telemetry_matches_post_state",
          passed: true,
          expected: "NOMINAL",
          actual: "NOMINAL",
        },
      ],
      outcome: "PASS",
    },
  ],
  continuity_results: [
    {
      previous_execution_id: "example-sequence-001",
      next_execution_id: "example-sequence-002",
      expected_operating_mode: "SAFE",
      observed_operating_mode: "SAFE",
      passed: true,
    },
  ],
  outcome: "PASS",
};

const verifiedExecution = {
  execution: {
    execution_id: "exec-web-001",
    executed_at: "2026-08-17T10:15:30Z",
    scenario_id: "nominal_to_safe_mode",
  },
  observation,
  invariant_results: [
    {
      invariant_id: "pre_state_matches_expected",
      expected: "NOMINAL",
      actual: "NOMINAL",
      passed: true,
    },
    {
      invariant_id: "acknowledgement_is_accepted",
      expected: true,
      actual: true,
      passed: true,
    },
  ],
  outcome: "PASS",
};

const verifiedExecutionSequence = {
  records: [
    {
      ...verifiedExecution,
      execution: {
        execution_id: "exec-b",
        executed_at: "2026-08-17T14:00:00Z",
        scenario_id: "nominal_to_safe_mode",
      },
    },
    {
      ...verifiedExecution,
      execution: {
        execution_id: "exec-a",
        executed_at: "2026-08-17T10:00:00Z",
        scenario_id: "safe_to_nominal_mode",
      },
    },
    {
      ...verifiedExecution,
      execution: {
        execution_id: "exec-c",
        executed_at: "2026-08-17T12:00:00Z",
        scenario_id: "nominal_to_nominal_rejection",
      },
    },
  ],
  continuity_results: [
    {
      previous_execution_id: "exec-b",
      next_execution_id: "exec-a",
      expected_operating_mode: "SAFE",
      observed_operating_mode: "SAFE",
      passed: true,
    },
    {
      previous_execution_id: "exec-a",
      next_execution_id: "exec-c",
      expected_operating_mode: "NOMINAL",
      observed_operating_mode: "NOMINAL",
      passed: true,
    },
  ],
  outcome: "PASS",
};

const fetchMock = vi.fn();
const matchMediaMock = vi.fn();
const scrollIntoViewMock = vi.fn();

beforeEach(() => {
  matchMediaMock.mockReset();
  matchMediaMock.mockReturnValue({ matches: false });
  scrollIntoViewMock.mockReset();
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    value: scrollIntoViewMock,
  });
  // jsdom lacks the dialog lifecycle; Playwright checks native modal behaviour.
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value: function (this: HTMLDialogElement) { this.open = true; },
    },
    close: {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.open = false;
        this.dispatchEvent(new Event("close"));
      },
    },
  });
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("matchMedia", matchMediaMock);
  // Rendered sizing and resize behaviour are checked in Playwright.
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    disconnect() {}
  });
});

afterEach(() => {
  cleanup();
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

function selectVerifiedExecution() {
  fireEvent.click(screen.getByRole("radio", { name: "Verified execution" }));
}

function selectInspectionWorkflow() {
  fireEvent.click(
    screen.getByRole("button", { name: "Show Inspect evidence workflow" }),
  );
}

function selectVerificationWorkflow() {
  fireEvent.click(
    screen.getByRole("button", { name: "Show Verify observation workflow" }),
  );
}

function selectVerifiedExecutionSequence() {
  fireEvent.click(
    screen.getByRole("radio", { name: "Verified execution sequence" }),
  );
}

async function expectFeedbackScroll(behavior: ScrollBehavior = "smooth") {
  await waitFor(() => {
    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);
    expect(scrollIntoViewMock).toHaveBeenCalledWith({
      behavior,
      block: "start",
    });
  });
}

function submitEvidence(
  evidence: string,
  evidenceType:
    | "observation"
    | "verified-execution"
    | "verified-execution-sequence" = "observation",
) {
  render(<App />);
  selectInspectionWorkflow();
  if (evidenceType === "verified-execution") {
    selectVerifiedExecution();
  } else if (evidenceType === "verified-execution-sequence") {
    selectVerifiedExecutionSequence();
  }
  fireEvent.change(
    screen.getByLabelText("Evidence JSON"),
    { target: { value: evidence } },
  );
  fireEvent.click(screen.getByRole("button", { name: "Inspect evidence" }));
}

function submitVerification({
  evidence = "raw observation evidence",
  scenario = "nominal_to_safe_mode",
}: {
  evidence?: string;
  scenario?: string;
} = {}) {
  render(<App />);
  fireEvent.change(screen.getByLabelText("Execution ID"), {
    target: { value: "exec-web-verify-001" },
  });
  fireEvent.change(screen.getByLabelText("Execution time (UTC)"), {
    target: { value: "2026-08-25T18:30:00Z" },
  });
  fireEvent.change(screen.getByLabelText("Scenario"), {
    target: { value: scenario },
  });
  fireEvent.change(screen.getByLabelText("Observation evidence JSON"), {
    target: { value: evidence },
  });
  fireEvent.click(screen.getByRole("button", { name: "Verify observation" }));
}

describe("App", () => {
  it("pairs the product name with a decorative mark and keeps the page title explicit", () => {
    render(<App />);

    const heading = screen.getByRole("heading", {
      name: "Verify observations and inspect evidence",
      level: 1,
    });
    const header = heading.closest("header")!;
    expect(within(header).getByText("OrbiRig", { exact: true })).toBeVisible();
    const mark = header.querySelector("img")!;
    expect(mark.getAttribute("src")).toContain("orbirig-mark");
    expect(mark).toHaveAttribute("alt", "");
    expect(within(header).queryByRole("img")).not.toBeInTheDocument();
  });

  it("defaults to the verification workflow while making both tasks available", () => {
    render(<App />);

    expect(
      screen.getByRole("group", { name: "Choose a workflow" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Check recorded behaviour from simplified spacecraft tests/,
      ),
    ).toHaveTextContent(
      "Check recorded behaviour from simplified spacecraft tests against a selected scenario, or inspect saved evidence.",
    );

    const verificationChoice = screen.getByRole("button", {
      name: "Show Verify observation workflow",
    });
    const inspectionChoice = screen.getByRole("button", {
      name: "Show Inspect evidence workflow",
    });

    expect(verificationChoice).toHaveAttribute("aria-pressed", "true");
    expect(inspectionChoice).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByLabelText("Execution ID")).toBeInTheDocument();
    expect(screen.queryByLabelText("Evidence JSON")).not.toBeInTheDocument();
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
      name: `Show ${selectedName} workflow`,
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
      "Select the type of saved record: observation, verified execution, or verified-execution sequence.",
      "Paste its JSON or choose Load example.",
      "Choose Inspect evidence to explore its contents in a structured view.",
    ]);
    const observationInspection = guidance.getByText(/Inspecting an observation checks/);
    expect(observationInspection).toHaveTextContent(
      "Inspecting an observation checks whether the record is valid. To check it against a scenario, use Verify observation.",
    );
    expect(observationInspection.querySelector("strong")).toHaveTextContent("Verify observation");
    expect(guidance.getByText(/For saved verified executions and sequences/)).toHaveTextContent(
      "For saved verified executions and sequences, OrbiRig independently recalculates verification results and checks their consistency. Evidence with a correctly derived FAIL outcome is still valid and can be inspected.",
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
    expect(guidance.getByText(/Save the observation JSON/)).toHaveTextContent(
      "Save the observation JSON to a UTF-8 file named observation.json. You can copy a built-in example from the browser. From an OrbiRig checkout, run uv sync --locked if needed, then:",
    );
    expect(command).toHaveAttribute("tabindex", "0");
    expect(command.querySelector("code")?.textContent).toBe([
      "uv run --no-sync orbirig verify-observation observation.json \\",
      "  --scenario nominal_to_safe_mode \\",
      "  --execution-id demo-001 \\",
      "  --executed-at 2026-10-21T10:00:00Z",
    ].join("\n"));
    expect(guidance.getByText(/The execution ID and timestamp/)).toHaveTextContent(
      "The execution ID and timestamp above are examples. For recorded executions, use the corresponding recorded metadata.",
    );
    expect(guidance.getByRole("link", { name: "CLI setup and full instructions" })).toHaveAttribute(
      "href",
      "https://github.com/NikolayAir/OrbiRig#verify-a-saved-observation-from-the-command-line",
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

  it("switches to inspection and restores the verification workflow", () => {
    render(<App />);

    selectInspectionWorkflow();

    expect(screen.getByLabelText("Evidence JSON")).toBeInTheDocument();
    expect(screen.queryByLabelText("Execution ID")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Show Inspect evidence workflow",
      }),
    ).toHaveAttribute("aria-pressed", "true");

    selectVerificationWorkflow();

    expect(screen.getByLabelText("Execution ID")).toBeInTheDocument();
    expect(screen.queryByLabelText("Evidence JSON")).not.toBeInTheDocument();
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

  it("preserves completed verification state while switched away", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => verifiedExecution,
    });

    submitVerification();

    expect(
      await screen.findByRole("region", { name: "Verified execution" }),
    ).toBeInTheDocument();
    await expectFeedbackScroll();

    selectInspectionWorkflow();
    selectVerificationWorkflow();

    expect(
      screen.getByRole("region", { name: "Verified execution" }),
    ).toBeInTheDocument();
    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);
  });

  it.each([200, 413])("preserves the active workflow and avoids delayed scrolling when verification returns HTTP %s while hidden", async (status) => {
    let resolveVerification!: (response: Response) => void;
    const pendingResponse = new Promise<Response>((resolve) => {
      resolveVerification = resolve;
    });

    fetchMock.mockReturnValue(pendingResponse);

    submitVerification();

    expect(screen.getByRole("status")).toHaveTextContent(
      "Verifying observation…",
    );

    selectInspectionWorkflow();
    selectVerifiedExecutionSequence();
    fireEvent.change(screen.getByLabelText("Evidence JSON"), {
      target: { value: "independent inspection evidence" },
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => verifiedExecutionSequence,
    });
    fireEvent.click(screen.getByRole("button", { name: "Inspect evidence" }));

    const activeResult = await screen.findByRole("region", {
      name: "Verified execution sequence",
    });
    await expectFeedbackScroll();

    // The active workflow has already scrolled to its own result.
    // Completing the hidden request or returning to it must not scroll again.
    await act(async () => {
      resolveVerification({
        ok: status === 200,
        status,
        json: async () => verifiedExecution,
      } as Response);
    });

    expect(activeResult).toBeInTheDocument();
    expect(within(activeResult).getByText("exec-b")).toBeInTheDocument();
    expect(within(activeResult).getByLabelText("Sequence outcome: PASS")).toBeInTheDocument();
    expect(screen.getByLabelText("Evidence JSON")).toHaveValue("independent inspection evidence");
    expect(screen.getByRole("radio", { name: "Verified execution sequence" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Show Inspect evidence workflow" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);

    selectVerificationWorkflow();

    if (status === 200) {
      expect(screen.getByRole("region", { name: "Verified execution" })).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    } else {
      const alert = screen.getByRole("alert");
      expect(within(alert).getByText("Request too large")).toBeVisible();
      expect(alert).toHaveTextContent(
        "The complete HTTP request body is limited to 4 MiB. Reduce the submitted data before trying again.",
      );
      expect(screen.queryByRole("region", { name: "Verified execution" })).not.toBeInTheDocument();
    }
    expect(screen.getByLabelText("Execution ID")).toHaveValue("exec-web-verify-001");
    expect(screen.getByLabelText("Execution time (UTC)")).toHaveValue("2026-08-25T18:30:00Z");
    expect(screen.getByLabelText("Scenario")).toHaveValue("nominal_to_safe_mode");
    expect(screen.getByLabelText("Observation evidence JSON")).toHaveValue("raw observation evidence");
    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);
  });

  it.each([200, 413])("preserves the active workflow and avoids delayed scrolling when inspection returns HTTP %s while hidden", async (status) => {
    let resolveInspection!: (response: Response) => void;
    const pendingResponse = new Promise<Response>((resolve) => {
      resolveInspection = resolve;
    });

    fetchMock.mockReturnValue(pendingResponse);

    submitEvidence("pending sequence evidence", "verified-execution-sequence");

    expect(screen.getByRole("status")).toHaveTextContent(
      "Inspecting evidence…",
    );

    selectVerificationWorkflow();
    const activeInputs = [
      ["Execution ID", "exec-web-001"],
      ["Execution time (UTC)", "2026-08-17T10:15:30Z"],
      ["Scenario", "nominal_to_safe_mode"],
      ["Observation evidence JSON", observationEvidenceDocument],
    ] as const;
    for (const [label, value] of activeInputs) {
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    }
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => verifiedExecution,
    });
    fireEvent.click(screen.getByRole("button", { name: "Verify observation" }));

    const activeResult = await screen.findByRole("region", {
      name: "Verified execution",
    });
    await expectFeedbackScroll();

    // The active workflow has already scrolled to its own result.
    // Completing the hidden request or returning to it must not scroll again.
    await act(async () => {
      resolveInspection({
        ok: status === 200,
        status,
        json: async () => verifiedExecutionSequence,
      } as Response);
    });

    expect(activeResult).toBeInTheDocument();
    expect(within(activeResult).getByText("exec-web-001")).toBeInTheDocument();
    expect(within(activeResult).getByLabelText("Verification outcome: PASS")).toBeInTheDocument();
    for (const [label, value] of activeInputs) {
      expect(screen.getByLabelText(label)).toHaveValue(value);
    }
    expect(screen.getByRole("button", { name: "Show Verify observation workflow" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);

    selectInspectionWorkflow();

    if (status === 200) {
      expect(screen.getByRole("region", { name: "Verified execution sequence" })).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    } else {
      const alert = screen.getByRole("alert");
      expect(within(alert).getByText("Request too large")).toBeVisible();
      expect(alert).toHaveTextContent(
        "The complete HTTP request body is limited to 4 MiB. Reduce the submitted data before trying again.",
      );
      expect(screen.queryByRole("region", { name: "Verified execution sequence" })).not.toBeInTheDocument();
    }
    expect(screen.getByLabelText("Evidence JSON")).toHaveValue("pending sequence evidence");
    expect(screen.getByRole("radio", { name: "Verified execution sequence" })).toBeChecked();
    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);
  });

  it("preserves inspection input and reconstructed state while switched away", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => observation,
    });

    render(<App />);
    selectInspectionWorkflow();
    fireEvent.change(screen.getByLabelText("Evidence JSON"), {
      target: { value: "preserved evidence" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Inspect evidence" }));

    expect(
      await screen.findByRole("heading", {
        name: "Observation details",
      }),
    ).toBeInTheDocument();
    await expectFeedbackScroll();

    selectVerificationWorkflow();
    selectInspectionWorkflow();

    expect(screen.getByLabelText("Evidence JSON")).toHaveValue(
      "preserved evidence",
    );
    expect(
      screen.getByRole("heading", { name: "Observation details" }),
    ).toBeInTheDocument();
    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);
  });

  it("starts with no verification scenario selected", () => {
    render(<App />);

    const scenario = screen.getByLabelText("Scenario");
    const placeholder = screen.getByRole("option", {
      name: "Select a supported scenario",
    }) as HTMLOptionElement;
    const nominalScenario = screen.getByRole("option", {
      name: "NOMINAL to SAFE",
    }) as HTMLOptionElement;

    expect(scenario).toHaveValue("");
    expect(placeholder.selected).toBe(true);
    expect(nominalScenario.selected).toBe(false);
    expect(nominalScenario.value).toBe("nominal_to_safe_mode");
  });

  it.each([
    ["Verify observation", "Provide execution details, select a supported scenario, and submit observation evidence for verification."],
    ["Inspect evidence", "Select an evidence type and paste its JSON document to review it in a structured view."],
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
      "Select the scenario to verify against. It is not inferred from the evidence.",
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
      "It is not inferred from the evidence.",
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
      "A non-empty identifier recorded with the resulting evidence.",
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

  it("uses application-controlled English required-field validation", () => {
    render(<App />);

    const executionId = screen.getByLabelText("Execution ID");
    const executedAt = screen.getByLabelText("Execution time (UTC)");
    const scenario = screen.getByLabelText("Scenario");
    const observationEvidence = screen.getByLabelText(
      "Observation evidence JSON",
    );

    fireEvent.click(screen.getByRole("button", { name: "Verify observation" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(scrollIntoViewMock).not.toHaveBeenCalled();
    expect(screen.getByText("Execution ID is required.")).toBeInTheDocument();
    expect(
      screen.getByText("Execution time (UTC) is required."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Select a supported scenario.", { selector: '[role="alert"]' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Observation evidence is required."),
    ).toBeInTheDocument();
    expect(executionId).toHaveAttribute("aria-invalid", "true");
    expect(executedAt).toHaveAttribute("aria-invalid", "true");
    expect(scenario).toHaveAttribute("aria-invalid", "true");
    expect(observationEvidence).toHaveAttribute("aria-invalid", "true");
    expect(executionId).toHaveAttribute(
      "aria-describedby",
      "execution-id-help-description verification-execution-id-error",
    );
    expect(executedAt).toHaveAttribute(
      "aria-describedby",
      "verification-executed-at-error",
    );
    expect(scenario).toHaveAttribute(
      "aria-describedby",
      "scenario-help-description verification-scenario-error",
    );
    expect(observationEvidence).toHaveAttribute(
      "aria-describedby",
      "verification-observation-hint verification-observation-evidence-error",
    );
    expect(document.activeElement).toBe(executionId);

    fireEvent.change(executionId, { target: { value: "exec-required-001" } });

    expect(
      screen.queryByText("Execution ID is required."),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Execution time (UTC) is required."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Select a supported scenario.", { selector: '[role="alert"]' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Observation evidence is required."),
    ).toBeInTheDocument();
  });

  it.each([
    ["Execution ID", "manual-execution", "example-execution-001"],
    ["Execution time (UTC)", "2026-10-22T12:00:00Z", "2026-08-26T08:30:00Z"],
    ["Observation evidence JSON", "manual evidence", observationEvidenceDocument],
  ])("protects edited %s until replacement is confirmed", (label, value, example) => {
    render(<App />);
    const input = screen.getByLabelText(label);
    const trigger = screen.getByRole("button", { name: "Load example" });
    fireEvent.change(input, { target: { value } });
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Replace current inputs?" });
    expect(dialog).toHaveAccessibleDescription(
      "Loading the example will replace your current form inputs, including any unsaved changes.",
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(input).toHaveValue(value);
    expect(trigger).toHaveFocus();
    expect(screen.getByLabelText("Scenario")).toHaveValue("");

    fireEvent.click(trigger);
    fireEvent.click(within(screen.getByRole("dialog", { name: "Replace current inputs?" })).getByRole("button", { name: "Load example" }));
    expect(input).toHaveValue(example);
    expect(screen.queryByRole("dialog", { name: "Replace current inputs?" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["verification", "inspection"])("does not prompt for unchanged or reverted %s examples", (workflow) => {
    render(<App />);
    if (workflow === "inspection") selectInspectionWorkflow();
    const input = screen.getByLabelText(workflow === "inspection" ? "Evidence JSON" : "Execution ID") as HTMLInputElement;
    const trigger = screen.getByRole("button", { name: "Load example" });
    fireEvent.change(input, { target: { value: " \n " } });
    fireEvent.click(trigger);
    expect(screen.queryByRole("dialog", { name: "Replace current inputs?" })).not.toBeInTheDocument();
    const example = input.value;
    fireEvent.click(trigger);
    expect(input).toHaveValue(example);
    fireEvent.change(input, { target: { value: "manual value" } });
    fireEvent.change(input, { target: { value: example } });
    fireEvent.click(trigger);
    expect(screen.queryByRole("dialog", { name: "Replace current inputs?" })).not.toBeInTheDocument();

    if (workflow === "verification") {
      fireEvent.change(screen.getByLabelText("Scenario"), { target: { value: "safe_to_nominal_mode" } });
      fireEvent.click(trigger);
      expect(screen.queryByRole("dialog", { name: "Replace current inputs?" })).not.toBeInTheDocument();
      expect(input).toHaveValue("example-execution-003");
    }

    // Clearing a populated example is also a manual change.
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.click(trigger);
    fireEvent(screen.getByRole("dialog", { name: "Replace current inputs?" }), new Event("cancel", { cancelable: true }));
    expect(input).toHaveValue("");
    expect(trigger).toHaveFocus();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not prompt when a manually entered value already matches the next example", () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText("Execution ID"), { target: { value: "example-execution-001" } });
    fireEvent.click(screen.getByRole("button", { name: "Load example" }));
    expect(screen.queryByRole("dialog", { name: "Replace current inputs?" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Scenario")).toHaveValue("nominal_to_safe_mode");
  });

  it("preserves validation feedback and manual values when example replacement is cancelled", () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText("Execution ID"), { target: { value: "manual-id" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify observation" }));
    const errors = screen.getAllByRole("alert").map(element => element.textContent);
    fireEvent.click(screen.getByRole("button", { name: "Load example" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Replace current inputs?" })).getByRole("button", { name: "Cancel" }));
    expect(screen.getAllByRole("alert").map(element => element.textContent)).toEqual(errors);
    expect(screen.getByLabelText("Execution ID")).toHaveValue("manual-id");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps manual-change protection separate across workflow switches", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Load example" }));
    fireEvent.change(screen.getByLabelText("Execution ID"), { target: { value: "keep-verification" } });
    selectInspectionWorkflow();
    fireEvent.click(screen.getByRole("button", { name: "Load example" }));
    fireEvent.change(screen.getByLabelText("Evidence JSON"), { target: { value: "keep-inspection" } });
    selectVerifiedExecutionSequence();
    selectVerificationWorkflow();
    fireEvent.click(screen.getByRole("button", { name: "Load example" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Replace current inputs?" })).getByRole("button", { name: "Cancel" }));
    expect(screen.getByLabelText("Execution ID")).toHaveValue("keep-verification");
    selectInspectionWorkflow();
    fireEvent.click(screen.getByRole("button", { name: "Load example" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Replace current inputs?" })).getByRole("button", { name: "Cancel" }));
    expect(screen.getByLabelText("Evidence JSON")).toHaveValue("keep-inspection");
    expect(screen.getByRole("radio", { name: "Verified execution sequence" })).toBeChecked();
  });

  it("loads an editable verification example without submitting it", () => {
    render(<App />);

    expect(screen.getByRole("button", { name: "Load example" })).toHaveAccessibleDescription(
      "Replaces current inputs",
    );
    expect(screen.getByLabelText("Observation evidence JSON")).toHaveAccessibleDescription(
      "Include the command, acknowledgement, states and telemetry from the recorded execution.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Load example" }));

    expect(screen.getByLabelText("Execution ID")).toHaveValue(
      "example-execution-001",
    );
    expect(screen.getByLabelText("Execution time (UTC)")).toHaveValue(
      "2026-08-26T08:30:00Z",
    );
    expect(screen.getByLabelText("Scenario")).toHaveValue(
      "nominal_to_safe_mode",
    );
    expect(
      JSON.parse(
        (screen.getByLabelText(
          "Observation evidence JSON",
        ) as HTMLTextAreaElement).value,
      ),
    ).toEqual(expectedNominalToSafeObservationExample);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(scrollIntoViewMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Execution ID"), {
      target: { value: "edited-example-execution" },
    });
    expect(screen.getByLabelText("Execution ID")).toHaveValue(
      "edited-example-execution",
    );
  });

  it.each([
    [
      "nominal_to_nominal_rejection",
      "example-execution-002",
      "2026-08-26T08:35:00Z",
      expectedNominalToNominalRejectionObservationExample,
    ],
    [
      "safe_to_nominal_mode",
      "example-execution-003",
      "2026-08-26T08:40:00Z",
      expectedSafeToNominalObservationExample,
    ],
  ])(
    "loads the selected %s verification example",
    (scenario, executionId, executedAt, expectedEvidence) => {
      render(<App />);

      fireEvent.change(screen.getByLabelText("Scenario"), {
        target: { value: scenario },
      });
      fireEvent.click(screen.getByRole("button", { name: "Load example" }));

      expect(screen.getByLabelText("Execution ID")).toHaveValue(executionId);
      expect(screen.getByLabelText("Execution time (UTC)")).toHaveValue(
        executedAt,
      );
      expect(screen.getByLabelText("Scenario")).toHaveValue(scenario);
      expect(
        JSON.parse(
          (screen.getByLabelText(
            "Observation evidence JSON",
          ) as HTMLTextAreaElement).value,
        ),
      ).toEqual(expectedEvidence);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("does not replace observation evidence when only the scenario changes", () => {
    render(<App />);

    const evidence = screen.getByLabelText("Observation evidence JSON");

    fireEvent.change(evidence, {
      target: { value: "edited observation evidence" },
    });
    fireEvent.change(screen.getByLabelText("Scenario"), {
      target: { value: "safe_to_nominal_mode" },
    });

    expect(evidence).toHaveValue("edited observation evidence");
  });

  it("clears a completed verification when loading a new example", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => verifiedExecution,
    });

    submitVerification();
    expect(
      await screen.findByRole("region", { name: "Verified execution" }),
    ).toBeInTheDocument();
    await expectFeedbackScroll();

    fireEvent.click(screen.getByRole("button", { name: "Load example" }));
    const confirmation = screen.getByRole("dialog", { name: "Replace current inputs?" });
    fireEvent.click(within(confirmation).getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("region", { name: "Verified execution" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Load example" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Replace current inputs?" })).getByRole("button", { name: "Load example" }));

    expect(
      screen.queryByRole("region", { name: "Verified execution" }),
    ).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);
  });

  it("submits raw observation evidence with explicit verification input", async () => {
    const evidence = '{\n  "accepted": true,\n  "accepted": true\n}';
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => verifiedExecution,
    });

    submitVerification({ evidence });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/verify/observation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          execution_id: "exec-web-verify-001",
          executed_at: "2026-08-25T18:30:00Z",
          scenario_id: "nominal_to_safe_mode",
          observation_evidence: evidence,
        }),
      });
    });
  });

  it("submits an explicitly selected non-default scenario", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ...verifiedExecution,
        execution: {
          ...verifiedExecution.execution,
          scenario_id: "safe_to_nominal_mode",
        },
      }),
    });

    submitVerification({ scenario: "safe_to_nominal_mode" });

    await waitFor(() => {
      const request = fetchMock.mock.calls[0][1];
      expect(JSON.parse(request.body)).toMatchObject({
        scenario_id: "safe_to_nominal_mode",
      });
    });
  });

  it("renders completed PASS verification", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => verifiedExecution,
    });

    submitVerification();

    const record = await screen.findByRole("region", {
      name: "Verified execution",
    });
    expect(within(record).getByText("exec-web-001")).toBeInTheDocument();
    expect(within(record).getByText("Verification result")).toBeInTheDocument();
    expect(within(record).getByText("The recorded behaviour matches this execution's scenario.")).toBeVisible();
    expect(
      within(record).getByLabelText("Verification outcome: PASS"),
    ).toBeInTheDocument();
    expect(
      within(record).getByText("2026-08-17T10:15:30Z"),
    ).toBeInTheDocument();
    expect(
      within(record).getByText("nominal_to_safe_mode"),
    ).toBeInTheDocument();
    expect(
      within(record).getByText("SET_OPERATING_MODE"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("uses non-smooth feedback scrolling when reduced motion is preferred", async () => {
    matchMediaMock.mockReturnValue({ matches: true });
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => verifiedExecution,
    });

    submitVerification();

    expect(
      await screen.findByRole("region", { name: "Verified execution" }),
    ).toBeInTheDocument();
    await expectFeedbackScroll("auto");
    expect(matchMediaMock).toHaveBeenCalledWith(
      "(prefers-reduced-motion: reduce)",
    );
  });

  it.each(["verification", "inspection"])("keeps the example action disabled while %s is pending", (workflow) => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    if (workflow === "verification") {
      submitVerification();
    } else {
      submitEvidence("pending observation");
    }

    expect(screen.getByRole("button", { name: "Load example" })).toBeDisabled();
    if (workflow === "verification") {
      for (const label of ["Execution ID", "Execution time (UTC)", "Scenario", "Observation evidence JSON"]) {
        expect(screen.getByLabelText(label, { exact: true })).toBeDisabled();
      }
      expect(screen.getByRole("button", { name: "Verify observation" })).toBeDisabled();
    }
  });

  it("renders completed FAIL verification without an error state", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ...verifiedExecution,
        invariant_results: [
          {
            invariant_id: "telemetry_matches_post_state",
            expected: "SAFE",
            actual: "NOMINAL",
            passed: false,
          },
        ],
        outcome: "FAIL",
      }),
    });

    submitVerification();

    const record = await screen.findByRole("region", {
      name: "Verified execution",
    });
    expect(
      within(record).getByLabelText("Verification outcome: FAIL"),
    ).toBeInTheDocument();
    expect(within(record).getAllByText("FAIL")).toHaveLength(2);
    expect(within(record).getByText("The recorded behaviour does not meet this execution's scenario expectations. Review the failed checks below.")).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("clears a completed verification when an input changes", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => verifiedExecution,
    });

    submitVerification();

    expect(
      await screen.findByRole("region", { name: "Verified execution" }),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Observation evidence JSON"), {
      target: { value: "changed observation evidence" },
    });

    expect(
      screen.queryByRole("region", { name: "Verified execution" }),
    ).not.toBeInTheDocument();
  });

  it.each([
    ["invalid_scenario", "Select a supported scenario."],
    ["invalid_observation_evidence", "The observation evidence is invalid."],
    ["invalid_execution_metadata", "The execution metadata is invalid."],
    [
      "scenario_command_mismatch",
      "The observation command does not match the selected scenario.",
    ],
  ])("renders %s as a validation failure", async (code, message) => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ detail: { code, message: "server message" } }),
    });

    submitVerification();

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(
      screen.queryByRole("region", { name: "Verified execution" }),
    ).not.toBeInTheDocument();
  });

  it("keeps network failure separate from validation", async () => {
    fetchMock.mockRejectedValue(new TypeError("network failure"));

    submitVerification();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The verification request could not reach the server. Try again.",
    );
    await expectFeedbackScroll();
  });

  it("reports HTTP 413 and preserves the verification inputs and selection", async () => {
    const evidence = ' \n{"recorded": "é", "recorded": "unchanged"}\n ';
    const json = vi.fn().mockRejectedValue(new SyntaxError("Not JSON"));
    fetchMock.mockResolvedValue({ ok: false, status: 413, json });

    submitVerification({ evidence, scenario: "safe_to_nominal_mode" });

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("Request too large")).toBeVisible();
    expect(alert).toHaveTextContent(
      "The complete HTTP request body is limited to 4 MiB. Reduce the submitted data before trying again.",
    );
    expect(json).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Execution ID")).toHaveValue("exec-web-verify-001");
    expect(screen.getByLabelText("Execution time (UTC)")).toHaveValue("2026-08-25T18:30:00Z");
    expect(screen.getByLabelText("Scenario")).toHaveValue("safe_to_nominal_mode");
    expect(screen.getByLabelText("Observation evidence JSON")).toHaveValue(evidence);
    expect(screen.getByRole("button", { name: "Show Verify observation workflow" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Verify observation" })).toBeEnabled();
    expect(screen.queryByRole("region", { name: "Verified execution" })).not.toBeInTheDocument();
    await expectFeedbackScroll();

    fireEvent.change(screen.getByLabelText("Observation evidence JSON"), {
      target: { value: "reduced evidence" },
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps unexpected server failure separate from validation", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    submitVerification();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The server could not complete verification. Try again.",
    );
  });

  it("treats a malformed successful response as a server failure", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });

    submitVerification();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The server could not complete verification. Try again.",
    );
    expect(
      screen.queryByRole("region", { name: "Verified execution" }),
    ).not.toBeInTheDocument();
  });

  it("renders an inherited-property invariant ID with the generic title", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ...verifiedExecution,
        invariant_results: [
          {
            ...verifiedExecution.invariant_results[0],
            invariant_id: "__proto__",
          },
        ],
      }),
    });

    submitVerification();

    const record = await screen.findByRole("region", {
      name: "Verified execution",
    });
    expect(
      within(record).getByRole("heading", { name: "Verification check" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("provides explicit evidence-type selection", () => {
    render(<App />);
    selectInspectionWorkflow();

    const observationOption = screen.getByRole("radio", {
      name: "Observation",
    });
    const verifiedExecutionOption = screen.getByRole("radio", {
      name: "Verified execution",
    });
    const sequenceOption = screen.getByRole("radio", {
      name: "Verified execution sequence",
    });
    expect(observationOption).toBeChecked();
    expect(verifiedExecutionOption).not.toBeChecked();
    expect(sequenceOption).not.toBeChecked();
    expect(observationOption).toHaveAccessibleDescription("Recorded behaviour without verification results.");
    expect(verifiedExecutionOption).toHaveAccessibleDescription("One execution with its scenario and checks.");
    expect(sequenceOption).toHaveAccessibleDescription("Ordered executions and continuity checks.");
    expect(screen.getByRole("button", { name: "Load example" })).toHaveAccessibleDescription("Replaces evidence JSON");
    expect(screen.getByLabelText("Evidence JSON")).toHaveAccessibleDescription("Paste the complete document for the selected evidence type.");

    fireEvent.click(verifiedExecutionOption);

    expect(observationOption).not.toBeChecked();
    expect(verifiedExecutionOption).toBeChecked();
    expect(
      screen.getByLabelText("Evidence JSON"),
    ).toBeInTheDocument();

    fireEvent.click(sequenceOption);

    expect(verifiedExecutionOption).not.toBeChecked();
    expect(sequenceOption).toBeChecked();
    expect(
      screen.getByLabelText("Evidence JSON"),
    ).toBeInTheDocument();
  });

  it("loads examples for the explicitly selected inspection evidence type", () => {
    render(<App />);
    selectInspectionWorkflow();

    const evidenceInput = screen.getByLabelText("Evidence JSON");

    fireEvent.click(screen.getByRole("button", { name: "Load example" }));
    expect(JSON.parse((evidenceInput as HTMLTextAreaElement).value)).toEqual(
      expectedNominalToSafeObservationExample,
    );

    fireEvent.change(evidenceInput, { target: { value: "user evidence" } });
    fireEvent.click(screen.getByRole("radio", { name: "Verified execution" }));

    expect(evidenceInput).toHaveValue("user evidence");

    fireEvent.click(screen.getByRole("button", { name: "Load example" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Replace current inputs?" })).getByRole("button", { name: "Load example" }));
    expect(JSON.parse((evidenceInput as HTMLTextAreaElement).value)).toEqual(
      expectedVerifiedExecutionInspectionExample,
    );

    fireEvent.click(
      screen.getByRole("radio", { name: "Verified execution sequence" }),
    );

    expect(JSON.parse((evidenceInput as HTMLTextAreaElement).value)).toEqual(
      expectedVerifiedExecutionInspectionExample,
    );

    fireEvent.click(screen.getByRole("button", { name: "Load example" }));
    expect(JSON.parse((evidenceInput as HTMLTextAreaElement).value)).toEqual(
      expectedVerifiedExecutionSequenceInspectionExample,
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(scrollIntoViewMock).not.toHaveBeenCalled();
  });

  it("clears stale inspection feedback when loading an example", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 422 });

    render(<App />);
    selectInspectionWorkflow();
    fireEvent.change(screen.getByLabelText("Evidence JSON"), {
      target: { value: "invalid evidence" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Inspect evidence" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The observation evidence is invalid.",
    );
    await expectFeedbackScroll();

    fireEvent.click(screen.getByRole("button", { name: "Load example" }));
    const confirmation = screen.getByRole("dialog", { name: "Replace current inputs?" });
    fireEvent.click(within(confirmation).getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("alert")).toHaveTextContent("The observation evidence is invalid.");
    expect(screen.getByLabelText("Evidence JSON")).toHaveValue("invalid evidence");
    fireEvent.click(screen.getByRole("button", { name: "Load example" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Replace current inputs?" })).getByRole("button", { name: "Load example" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Evidence JSON")).toHaveValue(
      observationEvidenceDocument,
    );
    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);
  });

  it("keeps observation evidence invalid for explicitly selected verified types", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 422 });

    render(<App />);
    selectInspectionWorkflow();
    fireEvent.change(screen.getByLabelText("Evidence JSON"), {
      target: { value: observationEvidenceDocument },
    });

    selectVerifiedExecution();
    fireEvent.click(screen.getByRole("button", { name: "Inspect evidence" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The verified-execution evidence is invalid.",
    );

    selectVerifiedExecutionSequence();
    fireEvent.click(screen.getByRole("button", { name: "Inspect evidence" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The verified-execution-sequence evidence is invalid.",
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/inspect/verified-execution",
      expect.objectContaining({ body: observationEvidenceDocument }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/inspect/verified-execution-sequence",
      expect.objectContaining({ body: observationEvidenceDocument }),
    );
  });

  it("preserves existing observation inspection", async () => {
    const evidence = '{\n  "key": "value",\n  "key": "value"\n}';
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => observation,
    });

    submitEvidence(evidence);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/inspect/observation", {
        method: "POST",
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
        },
        body: evidence,
      });
    });
    expect(
      await screen.findByRole("heading", {
        name: "Observation details",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("SET_OPERATING_MODE")).toBeInTheDocument();
    expect(screen.getByText("NOMINAL")).toBeInTheDocument();
    expect(screen.getAllByText("SAFE")).toHaveLength(3);
    expect(screen.getByText("Accepted")).toBeInTheDocument();
    const result = within(screen.getByRole("region", { name: "Observation details" }));
    expect(result.getByText("Valid observation evidence")).toBeVisible();
    expect(result.getByText("These are reported values. No scenario verification has been performed.")).toBeVisible();
    expect(result.queryByText("PASS")).not.toBeInTheDocument();
    expect(result.queryByText("FAIL")).not.toBeInTheDocument();
    expect(screen.queryByText(/ScenarioId/)).not.toBeInTheDocument();
  });

  it("rejects a malformed successful observation inspection", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ...observation,
        acknowledgement: { accepted: "true" },
      }),
    });

    submitEvidence("malformed observation");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The inspection request could not be completed. Try again.",
    );
    expect(
      screen.queryByRole("heading", { name: "Observation details" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("SET_OPERATING_MODE")).not.toBeInTheDocument();
  });

  it("sends verified-execution text unchanged to the dedicated endpoint", async () => {
    const evidence = '{\n  "outcome": "PASS",\n  "outcome": "PASS"\n}';
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => verifiedExecution,
    });

    submitEvidence(evidence, "verified-execution");

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/inspect/verified-execution",
        {
          method: "POST",
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
          },
          body: evidence,
        },
      );
    });
  });

  it("renders verified-execution metadata, observation, and ordered invariants", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => verifiedExecution,
    });

    submitEvidence("valid evidence", "verified-execution");

    expect(
      await screen.findByRole("heading", { name: "Verified execution" }),
    ).toBeInTheDocument();
    expect(screen.getByText("exec-web-001")).toBeInTheDocument();
    expect(screen.getByText("2026-08-17T10:15:30Z")).toBeInTheDocument();
    expect(screen.getAllByText("Scenario")).toHaveLength(1);
    expect(screen.getByText("nominal_to_safe_mode")).toBeInTheDocument();
    expect(screen.getByText("SET_OPERATING_MODE")).toBeInTheDocument();

    const result = within(screen.getByRole("region", { name: "Verified execution" }));
    const invariantItems = result.getAllByRole("listitem");
    expect(invariantItems).toHaveLength(2);
    expect(
      within(invariantItems[0]).getByRole("heading", {
        name: "Pre-state matches expected",
      }),
    ).toBeInTheDocument();
    expect(
      within(invariantItems[0]).getByText("pre_state_matches_expected"),
    ).toBeInTheDocument();
    expect(within(invariantItems[0]).getByText("Expected")).toBeInTheDocument();
    expect(within(invariantItems[0]).getByText("Actual")).toBeInTheDocument();
    expect(within(invariantItems[0]).getByText("Result")).toBeInTheDocument();
    expect(within(invariantItems[0]).getAllByText("NOMINAL")).toHaveLength(2);
    expect(within(invariantItems[0]).getByText("PASS")).toBeInTheDocument();
    expect(
      within(invariantItems[0]).getByLabelText("Verification check: PASS"),
    ).toBeInTheDocument();
    expect(
      within(invariantItems[1]).getByRole("heading", {
        name: "Acknowledgement is accepted",
      }),
    ).toBeInTheDocument();
    expect(
      within(invariantItems[1]).getByText("acknowledgement_is_accepted"),
    ).toBeInTheDocument();
    expect(within(invariantItems[1]).getAllByText("true")).toHaveLength(2);
    expect(within(invariantItems[1]).getByText("PASS")).toBeInTheDocument();
    expect(
      within(invariantItems[1]).getByLabelText("Verification check: PASS"),
    ).toBeInTheDocument();
    expect(result.getAllByText("PASS")).toHaveLength(3);
  });

  it("renders a FAIL response as valid inspected evidence", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ...verifiedExecution,
        invariant_results: [
          {
            invariant_id: "telemetry_matches_post_state",
            expected: "SAFE",
            actual: "NOMINAL",
            passed: false,
          },
        ],
        outcome: "FAIL",
      }),
    });

    submitEvidence("canonical fail evidence", "verified-execution");

    expect(
      await screen.findByRole("heading", { name: "Verified execution" }),
    ).toBeInTheDocument();
    const result = within(screen.getByRole("region", { name: "Verified execution" }));
    expect(result.getAllByText("FAIL")).toHaveLength(2);
    expect(result.getByText("Valid saved evidence")).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("rejects a malformed successful verified-execution inspection", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ...verifiedExecution,
        invariant_results: [
          {
            ...verifiedExecution.invariant_results[0],
            expected: 42,
          },
        ],
      }),
    });

    submitEvidence("malformed verified execution", "verified-execution");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The inspection request could not be completed. Try again.",
    );
    expect(
      screen.queryByRole("heading", { name: "Verified execution" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("exec-web-001")).not.toBeInTheDocument();
  });

  it("rejects a verified-execution inspection with an unsupported outcome", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ...verifiedExecution,
        outcome: "UNKNOWN",
      }),
    });

    submitEvidence("unsupported verified outcome", "verified-execution");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The inspection request could not be completed. Try again.",
    );
    expect(
      screen.queryByRole("heading", { name: "Verified execution" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("UNKNOWN")).not.toBeInTheDocument();
  });

  it("sends sequence text unchanged to the dedicated endpoint", async () => {
    const evidence = '{\n  "records": [],\n  "records": []\n}';
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => verifiedExecutionSequence,
    });

    submitEvidence(evidence, "verified-execution-sequence");

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/inspect/verified-execution-sequence",
        {
          method: "POST",
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
          },
          body: evidence,
        },
      );
    });
  });

  it("renders ordered sequence members and continuity checks", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => verifiedExecutionSequence,
    });

    submitEvidence("valid sequence", "verified-execution-sequence");

    const sequence = await screen.findByRole("region", {
      name: "Verified execution sequence",
    });
    expect(
      within(sequence).getByLabelText("Sequence outcome: PASS"),
    ).toBeInTheDocument();

    const sequenceFlow = within(sequence).getByRole("list", {
      name: "Sequence member records and continuity checks",
    });
    const sequenceItems = Array.from(
      sequenceFlow.children,
    ) as HTMLElement[];
    expect(sequenceItems).toHaveLength(5);
    expect(
      within(sequenceItems[0]).getByRole("article", { name: "Member 1" }),
    ).toBeInTheDocument();
    expect(
      within(sequenceItems[1]).getByRole("article", {
        name: "Continuity check 1",
      }),
    ).toBeInTheDocument();
    expect(
      within(sequenceItems[2]).getByRole("article", { name: "Member 2" }),
    ).toBeInTheDocument();
    expect(
      within(sequenceItems[3]).getByRole("article", {
        name: "Continuity check 2",
      }),
    ).toBeInTheDocument();
    expect(
      within(sequenceItems[4]).getByRole("article", { name: "Member 3" }),
    ).toBeInTheDocument();

    const members = within(sequence).getAllByRole("article", {
      name: /Member/,
    });
    expect(members).toHaveLength(3);
    expect(within(members[0]).getByText("exec-b")).toBeInTheDocument();
    expect(within(members[1]).getByText("exec-a")).toBeInTheDocument();
    expect(within(members[2]).getByText("exec-c")).toBeInTheDocument();
    expect(within(members[0]).getByText("SET_OPERATING_MODE")).toBeInTheDocument();
    expect(
      within(members[0]).getByText("pre_state_matches_expected"),
    ).toBeInTheDocument();
    expect(
      within(members[0]).getByRole("heading", {
        name: "Pre-state matches expected",
      }),
    ).toBeInTheDocument();
    expect(
      within(members[0]).getByLabelText("Verification outcome: PASS"),
    ).toBeInTheDocument();

    const boundaries = within(sequence).getAllByRole("article", {
      name: /Continuity check/,
    });
    expect(boundaries).toHaveLength(2);
    expect(boundaries[0]).toHaveTextContent("Previous execution ID: exec-b");
    expect(boundaries[0]).toHaveTextContent("Next execution ID: exec-a");
    expect(within(boundaries[0]).getAllByText("SAFE")).toHaveLength(2);
    expect(
      within(boundaries[0]).getByLabelText("Continuity outcome: PASS"),
    ).toBeInTheDocument();
    expect(boundaries[1]).toHaveTextContent("Previous execution ID: exec-a");
    expect(boundaries[1]).toHaveTextContent("Next execution ID: exec-c");
    expect(within(boundaries[1]).getAllByText("NOMINAL")).toHaveLength(2);
    expect(
      within(boundaries[1]).getByLabelText("Continuity outcome: PASS"),
    ).toBeInTheDocument();
  });

  it("renders a continuity FAIL sequence as valid evidence", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        records: verifiedExecutionSequence.records.slice(0, 2),
        continuity_results: [
          {
            previous_execution_id: "exec-b",
            next_execution_id: "exec-a",
            expected_operating_mode: "SAFE",
            observed_operating_mode: "NOMINAL",
            passed: false,
          },
        ],
        outcome: "FAIL",
      }),
    });

    submitEvidence("canonical fail sequence", "verified-execution-sequence");

    const sequence = await screen.findByRole("region", {
      name: "Verified execution sequence",
    });
    expect(
      within(sequence).getByLabelText("Sequence outcome: FAIL"),
    ).toBeInTheDocument();
    expect(within(sequence).getByText("Valid saved evidence")).toBeVisible();
    expect(within(sequence).getByText("One or more execution or continuity checks did not pass. Records are shown in the supplied order.")).toBeVisible();

    const boundary = within(sequence).getByRole("article", {
      name: "Continuity check 1",
    });
    expect(
      within(boundary).getByLabelText("Continuity outcome: FAIL"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("rejects a malformed successful sequence inspection", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ...verifiedExecutionSequence,
        continuity_results: [
          {
            ...verifiedExecutionSequence.continuity_results[0],
            passed: "true",
          },
        ],
      }),
    });

    submitEvidence("malformed sequence", "verified-execution-sequence");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The inspection request could not be completed. Try again.",
    );
    expect(
      screen.queryByRole("region", { name: "Verified execution sequence" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("exec-b")).not.toBeInTheDocument();
  });

  it("rejects a sequence inspection with an unsupported outcome", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ...verifiedExecutionSequence,
        outcome: "BANANA",
      }),
    });

    submitEvidence(
      "unsupported sequence outcome",
      "verified-execution-sequence",
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The inspection request could not be completed. Try again.",
    );
    expect(
      screen.queryByRole("region", { name: "Verified execution sequence" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("BANANA")).not.toBeInTheDocument();
  });

  it("shows invalid sequence evidence distinctly", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 422 });

    submitEvidence("invalid evidence", "verified-execution-sequence");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The verified-execution-sequence evidence is invalid.",
    );
  });

  it("clears a sequence when the evidence changes", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => verifiedExecutionSequence,
    });

    submitEvidence("first sequence", "verified-execution-sequence");

    expect(
      await screen.findByRole("heading", {
        name: "Verified execution sequence",
      }),
    ).toBeInTheDocument();

    fireEvent.change(
      screen.getByLabelText("Evidence JSON"),
      { target: { value: "changed sequence" } },
    );

    expect(
      screen.queryByRole("heading", {
        name: "Verified execution sequence",
      }),
    ).not.toBeInTheDocument();
  });

  it("clears a sequence when the evidence type changes", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => verifiedExecutionSequence,
    });

    submitEvidence("sequence evidence", "verified-execution-sequence");

    expect(
      await screen.findByRole("heading", {
        name: "Verified execution sequence",
      }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "Observation" }));

    expect(
      screen.queryByRole("heading", {
        name: "Verified execution sequence",
      }),
    ).not.toBeInTheDocument();
  });

  it("shows invalid verified-execution evidence distinctly", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 422 });

    submitEvidence("invalid evidence", "verified-execution");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The verified-execution evidence is invalid.",
    );
  });

  it("preserves invalid observation-evidence handling", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 422 });

    submitEvidence("invalid evidence");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The observation evidence is invalid.",
    );
  });

  it.each([
    ["observation", "Observation"],
    ["verified-execution", "Verified execution"],
    ["verified-execution-sequence", "Verified execution sequence"],
  ] as const)("reports HTTP 413 and preserves %s inspection inputs and selection", async (type, label) => {
    const evidence = ' \n{"recorded": "é", "recorded": "unchanged"}\n ';
    const json = vi.fn().mockRejectedValue(new SyntaxError("Not JSON"));
    fetchMock.mockResolvedValue({ ok: false, status: 413, json });

    submitEvidence(evidence, type);

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("Request too large")).toBeVisible();
    expect(alert).toHaveTextContent(
      "The complete HTTP request body is limited to 4 MiB. Reduce the submitted data before trying again.",
    );
    expect(json).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Evidence JSON")).toHaveValue(evidence);
    expect(screen.getByRole("radio", { name: label })).toBeChecked();
    expect(screen.getByRole("button", { name: "Show Inspect evidence workflow" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Inspect evidence" })).toBeEnabled();
    expect(screen.queryByRole("region", { name: /^(Observation details|Verified execution|Verified execution sequence)$/ })).not.toBeInTheDocument();
    await expectFeedbackScroll();

    fireEvent.change(screen.getByLabelText("Evidence JSON"), {
      target: { value: "reduced evidence" },
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it.each(["network", "server"])("shows an inspection %s failure distinctly", async (failure) => {
    if (failure === "network") {
      fetchMock.mockRejectedValue(new TypeError("network failure"));
    } else {
      fetchMock.mockResolvedValue({ ok: false, status: 500 });
    }

    submitEvidence("evidence", "verified-execution");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The inspection request could not be completed. Try again.",
    );
    await expectFeedbackScroll();
  });

  it("clears a verified execution when the evidence changes", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => verifiedExecution,
    });

    submitEvidence("first evidence", "verified-execution");

    expect(
      await screen.findByRole("heading", { name: "Verified execution" }),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Evidence JSON"), {
      target: { value: "changed evidence" },
    });

    expect(
      screen.queryByRole("heading", { name: "Verified execution" }),
    ).not.toBeInTheDocument();
  });

  it("clears stale results when the evidence type changes", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => verifiedExecution,
    });

    submitEvidence("verified evidence", "verified-execution");

    expect(
      await screen.findByRole("heading", { name: "Verified execution" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "Observation" }));

    expect(
      screen.queryByRole("heading", { name: "Verified execution" }),
    ).not.toBeInTheDocument();
  });

  it("shows loading while inspection is pending", () => {
    fetchMock.mockReturnValue(new Promise(() => {}));

    submitEvidence("evidence", "verified-execution");

    expect(screen.getByRole("status")).toHaveTextContent(
      "Inspecting evidence…",
    );
    expect(
      screen.getByRole("button", { name: "Inspect evidence" }),
    ).toBeDisabled();
    expect(screen.getByLabelText("Evidence JSON")).toBeDisabled();
    expect(
      screen.getByRole("radio", { name: "Observation" }),
    ).toBeDisabled();
    expect(scrollIntoViewMock).not.toHaveBeenCalled();
  });
});
