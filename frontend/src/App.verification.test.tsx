import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { failedTelemetryExecution, verifiedExecution } from "./test/appFixtures";
import {
  setupAppTests,
  expectFeedbackScroll,
  submitVerification,
  fetchMock,
  scrollIntoViewMock,
} from "./test/appTestSupport";

setupAppTests();

describe("App verification", () => {
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
      screen.getByRole("group", { name: "Choose what to do" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Check recorded behaviour from simplified spacecraft tests/,
      ),
    ).toHaveTextContent(
      "Check recorded behaviour from simplified spacecraft tests against a selected scenario, or inspect saved evidence.",
    );

    const verificationChoice = screen.getByRole("button", {
      name: "Show Verify observation",
    });
    const inspectionChoice = screen.getByRole("button", {
      name: "Show Inspect evidence",
    });

    expect(verificationChoice).toHaveAttribute("aria-pressed", "true");
    expect(inspectionChoice).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByLabelText("Execution ID")).toBeInTheDocument();
    expect(screen.queryByLabelText("Evidence JSON")).not.toBeInTheDocument();
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
        signal: expect.any(AbortSignal),
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

  it("renders completed FAIL verification without an error state", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => failedTelemetryExecution,
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
    ["invalid_execution_metadata", "The execution ID or UTC execution time is invalid."],
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
    expect(screen.getByRole("button", { name: "Show Verify observation" })).toHaveAttribute("aria-pressed", "true");
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

  it.each([0, 1, 2, 3, 5])("rejects a successful response when the number of checks is %i", async (count) => {
    // HTTP 200 and a PASS label cannot stand in for the complete set of checks.
    const results = Array.from({ length: count }, (_, index) =>
      verifiedExecution.invariant_results[index % 4]);
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ...verifiedExecution, invariant_results: results }),
    });

    submitVerification({ evidence: "keep this observation" });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The server could not complete verification. Try again.",
    );
    expect(screen.queryByRole("region", { name: "Verified execution" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Observation evidence JSON")).toHaveValue("keep this observation");
    expect(screen.getByRole("button", { name: "Verify observation" })).toBeEnabled();
  });

  it.each([
    { description: "1 repeated check", indices: [0, 1, 2, 0] },
    { description: "4 identical checks", indices: [0, 0, 0, 0] },
  ])("rejects a successful verification response with $description", async ({ indices }) => {
    // Keep 4 separate objects, as JSON parsing would, so the guard must compare
    // their IDs rather than only counting entries or comparing the objects themselves.
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ...verifiedExecution,
        invariant_results: indices.map(index => ({ ...verifiedExecution.invariant_results[index] })),
      }),
    });

    submitVerification({ evidence: "keep this observation" });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The server could not complete verification. Try again.",
    );
    expect(screen.queryByRole("region", { name: "Verified execution" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Observation evidence JSON")).toHaveValue("keep this observation");
    expect(screen.getByRole("button", { name: "Verify observation" })).toBeEnabled();
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
          ...verifiedExecution.invariant_results.slice(1),
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
});
