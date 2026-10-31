import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";
import {
  observation,
  observationEvidenceDocument,
  verifiedExecution,
  verifiedExecutionSequence,
} from "./test/appFixtures";
import {
  setupAppTests,
  selectVerifiedExecution,
  selectInspectionWorkflow,
  selectVerificationWorkflow,
  selectVerifiedExecutionSequence,
  expectFeedbackScroll,
  submitEvidence,
  fetchMock,
  scrollIntoViewMock,
} from "./test/appTestSupport";

setupAppTests();

describe("App inspection", () => {
  it("switches to inspection and restores the verification workflow", () => {
    render(<App />);

    selectInspectionWorkflow();

    expect(screen.getByLabelText("Evidence JSON")).toBeInTheDocument();
    expect(screen.queryByLabelText("Execution ID")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Show Inspect evidence",
      }),
    ).toHaveAttribute("aria-pressed", "true");

    selectVerificationWorkflow();

    expect(screen.getByLabelText("Execution ID")).toBeInTheDocument();
    expect(screen.queryByLabelText("Evidence JSON")).not.toBeInTheDocument();
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
    expect(verifiedExecutionOption).toHaveAccessibleDescription("1 execution with its scenario and checks.");
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
        signal: expect.any(AbortSignal),
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
          signal: expect.any(AbortSignal),
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
          signal: expect.any(AbortSignal),
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
    expect(within(sequence).getByText("1 or more execution or continuity checks did not pass. Records are shown in the supplied order.")).toBeVisible();

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
    expect(screen.getByRole("button", { name: "Show Inspect evidence" })).toHaveAttribute("aria-pressed", "true");
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
    fetchMock.mockReturnValue(new Promise(() => { }));

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
