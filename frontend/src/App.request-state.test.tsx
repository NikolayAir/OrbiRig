import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";
import { observation, verifiedExecution, failedTelemetryExecution } from "./test/appFixtures";
import {
  setupAppTests, submitVerification, submitEvidence, fetchMock, deferred,
  selectInspectionWorkflow, selectVerificationWorkflow, scrollIntoViewMock,
} from "./test/appTestSupport";

setupAppTests();

const verificationChanged = "Inputs changed. Verify to check the current values.";
const inspectionChanged = "Inputs changed. Inspect to check the current evidence.";
const respond = (payload: unknown) => ({ ok: true, status: 200, json: async () => payload });

describe("page footer", () => {
  it("states the example domain and links to the source and documentation", () => {
    render(<App />);
    expect(screen.getByRole("contentinfo")).toHaveTextContent("does not connect to or control real systems");
    const footer = within(screen.getByRole("contentinfo"));
    expect(footer.getByRole("link", { name: /^Source code/ })).toHaveAttribute("href", "https://github.com/NikolayAir/OrbiRig");
    expect(footer.getByRole("link", { name: /^Documentation/ })).toHaveAttribute("href", "https://github.com/NikolayAir/OrbiRig#documentation");
  });
});

describe("request and edited-input states", () => {
  it.each(["verification", "inspection"] as const)("keeps a completed %s result when reloading identical example inputs, but never restores a result after editing", async (workflow) => {
    const inspection = workflow === "inspection";
    fetchMock.mockResolvedValue(respond(inspection ? observation : verifiedExecution));
    render(<App />);
    if (inspection) selectInspectionWorkflow();
    const load = screen.getByRole("button", { name: "Load example" });
    fireEvent.click(load);
    fireEvent.click(screen.getByRole("button", { name: inspection ? "Inspect evidence" : "Verify observation" }));
    const resultName = inspection ? "Observation details" : "Verified execution";
    await screen.findByRole("region", { name: resultName });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("completed."));
    act(() => load.focus());
    scrollIntoViewMock.mockClear();
    fireEvent.click(load);
    expect(screen.getByRole("region", { name: resultName })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: inspection ? "Inspect evidence" : "Verify observation" })).toHaveAccessibleDescription(
      inspection ? "Inspection completed. Evidence is valid." : "Verification completed.",
    );
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(load).toHaveFocus();
    expect(scrollIntoViewMock).not.toHaveBeenCalled();

    const field = screen.getByLabelText(inspection ? "Evidence JSON" : "Execution ID");
    const original = (field as HTMLInputElement).value;
    fireEvent.change(field, { target: { value: `${original} ` } });
    fireEvent.change(field, { target: { value: original } });
    fireEvent.click(load);
    expect(screen.queryByRole("region", { name: resultName })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: inspection ? "Inspect evidence" : "Verify observation" })).toHaveAccessibleDescription(
      inspection ? inspectionChanged : verificationChanged,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([verifiedExecution, failedTelemetryExecution])("completes verification with $outcome and allows a fresh request", async (record) => {
    fetchMock.mockResolvedValue(respond(record));
    submitVerification();
    await screen.findByRole("region", { name: "Verified execution" });
    expect(screen.getByText("Verification completed.", { exact: true })).toBeVisible();
    expect(screen.getByLabelText(`Verification outcome: ${record.outcome}`)).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    const retry = deferred<unknown>();
    fetchMock.mockReturnValueOnce(retry.promise);
    const action = screen.getByRole("button", { name: "Verify observation" });
    expect(action).toBeDisabled();
    fireEvent.submit(action.closest("form")!);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText("Execution ID"), { target: { value: "edited-id" } });
    expect(action).toBeEnabled();
    fireEvent.click(action);
    expect(screen.getByRole("button", { name: "Verifying…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel request" })).toBeEnabled();
    expect(screen.queryByText("Verification completed.", { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Verified execution" })).not.toBeInTheDocument();
    // A form submission while pending must not send a second request.
    fireEvent.submit(screen.getByRole("button", { name: "Verifying…" }).closest("form")!);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => retry.resolve(respond(record)));
    expect(screen.getByRole("button", { name: "Verify observation" })).toBeDisabled();
  });

  it.each([
    { type: "observation" as const, payload: observation, heading: "Observation details", outcome: null },
    { type: "verified-execution" as const, payload: failedTelemetryExecution, heading: "Verified execution", outcome: "FAIL" },
  ])("completes $type inspection without confusing validity with verification", async ({ type, payload, heading, outcome }) => {
    fetchMock.mockResolvedValue(respond(payload));
    submitEvidence("original evidence", type);
    await screen.findByRole("region", { name: heading });
    expect(screen.getByText("Inspection completed. Evidence is valid.", { exact: true })).toBeVisible();
    if (outcome) expect(screen.getByLabelText("Verification outcome: FAIL")).toBeVisible();
    else {
      expect(screen.queryByLabelText(/Verification outcome:/)).not.toBeInTheDocument();
      await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("No scenario verification was performed."));
    }
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    const retry = deferred<unknown>();
    fetchMock.mockReturnValueOnce(retry.promise);
    const action = screen.getByRole("button", { name: "Inspect evidence" });
    expect(action).toBeDisabled();
    fireEvent.submit(action.closest("form")!);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText("Evidence JSON"), { target: { value: "edited evidence" } });
    expect(action).toBeEnabled();
    fireEvent.click(action);
    expect(screen.getByRole("button", { name: "Inspecting…" })).toBeDisabled();
    expect(screen.queryByText("Inspection completed. Evidence is valid.", { exact: true })).not.toBeInTheDocument();
    fireEvent.submit(screen.getByRole("button", { name: "Inspecting…" }).closest("form")!);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => retry.resolve(respond(payload)));
    expect(screen.getByRole("button", { name: "Inspect evidence" })).toBeDisabled();
  });

  it.each([
    ["Execution ID", "edited-id"],
    ["Execution time (UTC)", "2026-10-30T10:00:00Z"],
    ["Scenario", "safe_to_nominal_mode"],
    ["Observation evidence JSON", "edited JSON"],
  ])("requires verification again after editing %s, even when restored", async (label, value) => {
    fetchMock.mockResolvedValue(respond(verifiedExecution));
    submitVerification();
    await screen.findByRole("region", { name: "Verified execution" });
    const field = screen.getByLabelText(label, { exact: true });
    const original = (field as HTMLInputElement).value;
    act(() => field.focus());
    scrollIntoViewMock.mockClear();
    fireEvent.change(field, { target: { value } });
    expect(screen.queryByRole("region", { name: "Verified execution" })).not.toBeInTheDocument();
    expect(screen.queryByText("Verification completed.", { exact: true })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Verify observation" })).toHaveAccessibleDescription(verificationChanged);
    expect(screen.getByRole("status")).toHaveTextContent(verificationChanged);
    fireEvent.change(field, { target: { value: original } });
    expect(screen.getByText(verificationChanged, { selector: ".action-status" })).toBeVisible();
    expect(field).toHaveFocus();
    expect(scrollIntoViewMock).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(["JSON", "type"])("requires inspection again after changing its %s", async (field) => {
    fetchMock.mockResolvedValue(respond(observation));
    submitEvidence("original evidence");
    await screen.findByRole("region", { name: "Observation details" });
    if (field === "JSON") {
      fireEvent.change(screen.getByLabelText("Evidence JSON"), { target: { value: "edited" } });
      fireEvent.change(screen.getByLabelText("Evidence JSON"), { target: { value: "original evidence" } });
    } else {
      fireEvent.click(screen.getByRole("radio", { name: "Verified execution" }));
      expect(screen.getByRole("status")).toHaveTextContent(inspectionChanged);
      fireEvent.click(screen.getByRole("radio", { name: "Observation" }));
    }
    expect(screen.queryByRole("region", { name: "Observation details" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Inspect evidence" })).toHaveAccessibleDescription(inspectionChanged);
    expect(screen.getByText(inspectionChanged, { selector: ".action-status" })).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  describe.each(["verification", "inspection"] as const)("%s retries without a new result", (workflow) => {
    const inspection = workflow === "inspection";
    const resultName = inspection ? "Observation details" : "Verified execution";
    const fieldLabel = inspection ? "Evidence JSON" : "Execution ID";
    const changed = inspection ? inspectionChanged : verificationChanged;
    const action = inspection ? "Inspect evidence" : "Verify observation";
    const payload = inspection ? observation : verifiedExecution;

    async function completeExample() {
      fetchMock.mockResolvedValueOnce(respond(payload));
      render(<App />);
      if (inspection) selectInspectionWorkflow();
      fireEvent.click(screen.getByRole("button", { name: "Load example" }));
      fireEvent.click(screen.getByRole("button", { name: action }));
      await screen.findByRole("region", { name: resultName });
    }

    async function cancelRetry(button: string) {
      fetchMock.mockReturnValueOnce(new Promise(() => { }));
      fireEvent.click(screen.getByRole("button", { name: button }));
      fireEvent.click(screen.getByRole("button", { name: "Cancel request" }));
      await screen.findByText(/request cancelled/, { selector: ".feedback-progress" });
    }

    async function failRetry(button: string) {
      fetchMock.mockRejectedValueOnce(new TypeError("Network unavailable"));
      fireEvent.click(screen.getByRole("button", { name: button }));
      await screen.findByRole("alert");
    }

    it.each([["cancelled", cancelRetry], ["failed", failRetry]] as const)("keeps prompting after a %s retry of edited inputs", async (_, endRetry) => {
      await completeExample();
      const field = screen.getByLabelText(fieldLabel) as HTMLInputElement;
      const original = field.value;
      fireEvent.change(field, { target: { value: `${original} ` } });
      await endRetry(action);
      // No result belongs to these inputs, so the reminder waits for the next edit.
      expect(document.querySelector(".action-status")).toBeNull();
      expect(screen.getByRole("button", { name: action })).toBeEnabled();

      fireEvent.change(field, { target: { value: original } });
      expect(screen.getByRole("button", { name: action })).toHaveAccessibleDescription(changed);
      expect(screen.getByRole("status")).toHaveTextContent(changed);
    });

    it("clears the reminder once a new result completes", async () => {
      await completeExample();
      const field = screen.getByLabelText(fieldLabel) as HTMLInputElement;
      fireEvent.change(field, { target: { value: `${field.value} ` } });
      await cancelRetry(action);
      fetchMock.mockResolvedValueOnce(respond(payload));
      fireEvent.click(screen.getByRole("button", { name: action }));
      await screen.findByRole("region", { name: resultName });
      expect(screen.getByRole("button", { name: action })).toHaveAccessibleDescription(
        inspection ? "Inspection completed. Evidence is valid." : "Verification completed.",
      );
    });

    it("does not claim inputs changed when reloading the same example after a cancelled retry", async () => {
      await completeExample();
      const field = screen.getByLabelText(fieldLabel) as HTMLInputElement;
      const original = field.value;
      fireEvent.change(field, { target: { value: `${original} ` } });
      fireEvent.change(field, { target: { value: original } });
      await cancelRetry(action);
      fireEvent.click(screen.getByRole("button", { name: "Load example" }));
      expect(screen.queryByText(changed)).not.toBeInTheDocument();
      expect(screen.queryByRole("region", { name: resultName })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: action })).toBeEnabled();
    });

    it("does not prompt after a first request that never completed", async () => {
      render(<App />);
      if (inspection) selectInspectionWorkflow();
      fireEvent.click(screen.getByRole("button", { name: "Load example" }));
      await cancelRetry(action);
      const field = screen.getByLabelText(fieldLabel) as HTMLInputElement;
      fireEvent.change(field, { target: { value: `${field.value} ` } });
      expect(document.querySelector(".action-status")).toBeNull();
      expect(screen.getByRole("button", { name: action })).toBeEnabled();
    });
  });

  it.each(["verification", "inspection"] as const)("announces changed %s inputs once without moving focus", async (workflow) => {
    fetchMock.mockResolvedValue(respond(workflow === "verification" ? verifiedExecution : observation));
    if (workflow === "verification") submitVerification();
    else submitEvidence("original evidence");
    await screen.findByRole("region", { name: workflow === "verification" ? "Verified execution" : "Observation details" });
    const field = screen.getByLabelText(workflow === "verification" ? "Observation evidence JSON" : "Evidence JSON");
    act(() => field.focus());
    scrollIntoViewMock.mockClear();
    const changes: string[] = [];
    const status = screen.getByRole("status");
    const observer = new MutationObserver(() => changes.push(status.textContent!));
    observer.observe(status, { subtree: true, childList: true, characterData: true });
    try {
      for (const value of ["a", "ab", "abc"]) {
        await act(async () => { fireEvent.change(field, { target: { value } }); });
      }
      expect(changes).toEqual([workflow === "verification" ? verificationChanged : inspectionChanged]);
      expect(field).toHaveFocus();
      expect(scrollIntoViewMock).not.toHaveBeenCalled();
    } finally { observer.disconnect(); }
  });

  it("keeps changed verification and completed inspection independent across task switches", async () => {
    fetchMock.mockResolvedValueOnce(respond(verifiedExecution)).mockResolvedValueOnce(respond(observation));
    submitVerification();
    await screen.findByRole("region", { name: "Verified execution" });
    fireEvent.change(screen.getByLabelText("Execution ID"), { target: { value: "edited-id" } });
    selectInspectionWorkflow();
    fireEvent.change(screen.getByLabelText("Evidence JSON"), { target: { value: "inspection evidence" } });
    fireEvent.click(screen.getByRole("button", { name: "Inspect evidence" }));
    await screen.findByRole("region", { name: "Observation details" });
    selectVerificationWorkflow();
    expect(screen.getByRole("button", { name: "Verify observation" })).toHaveAccessibleDescription(verificationChanged);
    expect(screen.getByLabelText("Execution ID")).toHaveValue("edited-id");
    selectInspectionWorkflow();
    expect(screen.getByRole("button", { name: "Inspect evidence" })).toHaveAccessibleDescription("Inspection completed. Evidence is valid.");
    fireEvent.change(screen.getByLabelText("Evidence JSON"), { target: { value: "edited inspection" } });
    selectVerificationWorkflow();
    expect(screen.queryByText(inspectionChanged, { selector: ".action-status" })).not.toBeInTheDocument();
    selectInspectionWorkflow();
    expect(screen.getByText(inspectionChanged, { selector: ".action-status" })).toBeVisible();
    expect(screen.queryByRole("region", { name: "Observation details" })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["observation", false],
    ["verified-execution", true],
    ["verified-execution-sequence", true],
  ] as const)("explains what to check after invalid %s evidence", async (type, savedResults) => {
    fetchMock.mockResolvedValue({ ok: false, status: 422 });
    submitEvidence("invalid evidence", type);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Check that the selected evidence type matches the document");
    if (savedResults) expect(alert).toHaveTextContent("Saved results must also match the checks OrbiRig recomputes.");
    else expect(alert).not.toHaveTextContent("Saved results");
  });

  it.each(["", " \n\t "])("rejects empty inspection JSON locally (%j) and sends non-empty text unchanged", async (empty) => {
    render(<App />);
    selectInspectionWorkflow();
    const field = screen.getByLabelText("Evidence JSON");
    fireEvent.change(field, { target: { value: empty } });
    fireEvent.click(screen.getByRole("button", { name: "Inspect evidence" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Evidence JSON is required.");
    expect(field).toHaveFocus();
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAccessibleDescription(/Evidence JSON is required\./);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByText("Inspection completed. Evidence is valid.", { exact: true })).not.toBeInTheDocument();
    const raw = ' \n{"duplicate": 1, "duplicate": 2}\t ';
    fireEvent.change(field, { target: { value: raw } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fetchMock.mockResolvedValue({ ok: false, status: 422 });
    fireEvent.click(screen.getByRole("button", { name: "Inspect evidence" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][1].body).toBe(raw);
    await screen.findByText("Invalid evidence");
    expect(screen.queryByText("Inspection completed. Evidence is valid.", { exact: true })).not.toBeInTheDocument();
  });
});
