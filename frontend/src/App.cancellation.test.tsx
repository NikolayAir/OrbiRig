import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { observation, verifiedExecution, verifiedExecutionSequence } from "./test/appFixtures";
import {
  setupAppTests,
  selectInspectionWorkflow,
  selectVerificationWorkflow,
  expectFeedbackScroll,
  submitEvidence,
  submitVerification,
  deferred,
  fetchMock,
  scrollIntoViewMock,
} from "./test/appTestSupport";

setupAppTests();

describe("App cancellation", () => {
  for (const workflow of ["verification", "inspection"] as const) {
    const actionName = workflow === "verification" ? "Verify observation" : "Inspect evidence";
    const cancelled = `${workflow === "verification" ? "Verification" : "Inspection"} request cancelled. Your inputs are kept.`;
    const payload = workflow === "verification" ? verifiedExecution : observation;
    const start = () => workflow === "verification" ? submitVerification() : submitEvidence("pending observation");

    it(`cancels ${workflow}, keeps its inputs and restores keyboard focus`, async () => {
      const pending = deferred<unknown>();
      fetchMock.mockReturnValue(pending.promise);
      start();
      const signal: AbortSignal = fetchMock.mock.calls[0][1].signal;
      const action = screen.getByRole("button", { name: actionName });
      const labels = workflow === "verification"
        ? ["Execution ID", "Execution time (UTC)", "Scenario", "Observation evidence JSON"]
        : ["Evidence JSON"];
      const values = labels.map((label) => (screen.getByLabelText(label, { exact: true }) as HTMLInputElement).value);
      const cancel = screen.getByRole("button", { name: "Cancel request" });
      expect(cancel).toBeEnabled();
      act(() => cancel.focus());
      fireEvent.click(cancel);

      expect(signal.aborted).toBe(true);
      expect(action).toBeEnabled();
      expect(action).toHaveFocus();
      labels.forEach((label, index) => {
        expect(screen.getByLabelText(label, { exact: true })).toBeEnabled();
        expect(screen.getByLabelText(label, { exact: true })).toHaveValue(values[index]);
      });
      expect(screen.getByRole("status")).toHaveTextContent(cancelled);
      expect(screen.getByRole("button", { name: "Load example" })).toBeEnabled();
      expect(screen.queryByRole("button", { name: "Cancel request" })).not.toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(scrollIntoViewMock).not.toHaveBeenCalled();

      await act(async () => pending.reject(new DOMException("Aborted", "AbortError")));
      expect(action).toHaveFocus();
      expect(screen.getByRole("status")).toHaveTextContent(cancelled);
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it.each([200, 413, 422, 500, "network"])(`ignores cancelled ${workflow} replies while a retry is pending (%s)`, async (status) => {
      const oldRequest = deferred<unknown>();
      const retry = deferred<unknown>();
      fetchMock.mockReturnValueOnce(oldRequest.promise).mockReturnValueOnce(retry.promise);
      start();
      const oldSignal: AbortSignal = fetchMock.mock.calls[0][1].signal;
      fireEvent.click(screen.getByRole("button", { name: "Cancel request" }));
      fireEvent.click(screen.getByRole("button", { name: actionName }));
      const currentSignal: AbortSignal = fetchMock.mock.calls[1][1].signal;
      const json = vi.fn().mockResolvedValue(payload);

      await act(async () => {
        if (status === "network") oldRequest.reject(new TypeError("Late network failure"));
        else oldRequest.resolve({ ok: status === 200, status, json });
      });
      expect(oldSignal.aborted).toBe(true);
      expect(currentSignal.aborted).toBe(false);
      expect(json).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: actionName })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Cancel request" })).toBeEnabled();
      expect(screen.getByRole("status")).toHaveTextContent(workflow === "verification" ? "Verifying observation…" : "Inspecting evidence…");
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(scrollIntoViewMock).not.toHaveBeenCalled();

      await act(async () => retry.resolve({ ok: true, status: 200, json: async () => payload }));
      expect(screen.getByRole("status")).toHaveTextContent("completed.");
      expect(screen.queryByRole("button", { name: "Cancel request" })).not.toBeInTheDocument();
    });

    it.each(["resolve", "reject"])(`keeps the new ${workflow} result when cancelled JSON parsing later finishes (%s)`, async (completion) => {
      const oldBody = deferred<unknown>();
      const json = vi.fn(() => oldBody.promise);
      fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json });
      start();
      await waitFor(() => expect(json).toHaveBeenCalled());
      fireEvent.click(screen.getByRole("button", { name: "Cancel request" }));
      fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => payload });
      fireEvent.click(screen.getByRole("button", { name: actionName }));
      const result = await screen.findByRole("region", { name: workflow === "verification" ? "Verified execution" : "Observation details" });
      await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("completed."));
      const contents = result.textContent;
      const focused = document.activeElement;
      const announcement = screen.getByRole("status").textContent;

      await act(async () => {
        if (completion === "reject") oldBody.reject(new Error("Late body failure"));
        else oldBody.resolve(workflow === "verification"
          ? { ...verifiedExecution, execution: { ...verifiedExecution.execution, execution_id: "cancelled-execution" } }
          : { ...observation, telemetry: { operating_mode: "NOMINAL" } });
      });
      expect(result.textContent).toBe(contents);
      expect(document.activeElement).toBe(focused);
      expect(screen.getByRole("status")).toHaveTextContent(announcement!);
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);
    });

    it(`retains completion feedback when the ${workflow} cancellation button has focus`, async () => {
      const pending = deferred<unknown>();
      fetchMock.mockReturnValue(pending.promise);
      start();
      act(() => screen.getByRole("button", { name: "Cancel request" }).focus());
      await act(async () => pending.resolve({ ok: true, status: 200, json: async () => payload }));
      const heading = screen.getByRole("heading", { name: workflow === "verification" ? "Verified execution" : "Observation details" });
      expect(heading).toHaveFocus();
      expect(screen.getByRole("status")).toHaveTextContent("completed.");
      await expectFeedbackScroll();
    });
  }

  it("does not show a cancelled verification's delayed validation error over a newer result", async () => {
    const body = deferred<unknown>();
    const json = vi.fn(() => body.promise);
    fetchMock.mockResolvedValueOnce({ ok: false, status: 422, json });
    submitVerification();
    await waitFor(() => expect(json).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Cancel request" }));
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => verifiedExecution });
    fireEvent.click(screen.getByRole("button", { name: "Verify observation" }));
    await screen.findByRole("region", { name: "Verified execution" });
    await act(async () => body.resolve({ detail: { code: "invalid_observation_evidence" } }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Verification completed. Outcome: PASS.");
  });

  it.each(["verified-execution", "verified-execution-sequence"] as const)("retains the inspection type on cancellation and allows a new observation after %s", async (type) => {
    const body = deferred<unknown>();
    const json = vi.fn(() => body.promise);
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json });
    submitEvidence("original saved evidence", type);
    await waitFor(() => expect(json).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Cancel request" }));
    const radioName = type === "verified-execution" ? "Verified execution" : "Verified execution sequence";
    expect(screen.getByRole("radio", { name: radioName })).toBeChecked();
    expect(screen.getByRole("radio", { name: radioName })).toBeEnabled();
    expect(screen.getByLabelText("Evidence JSON")).toHaveValue("original saved evidence");
    fireEvent.click(screen.getByRole("radio", { name: "Observation" }));
    fireEvent.change(screen.getByLabelText("Evidence JSON"), { target: { value: "new observation" } });
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => observation });
    fireEvent.click(screen.getByRole("button", { name: "Inspect evidence" }));
    await screen.findByRole("region", { name: "Observation details" });
    await act(async () => body.resolve(type === "verified-execution" ? verifiedExecution : verifiedExecutionSequence));
    expect(screen.getByRole("region", { name: "Observation details" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: radioName })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Evidence JSON")).toHaveValue("new observation");
  });

  it("cancels inspection without aborting a verification running in the other workflow", async () => {
    const verification = deferred<unknown>();
    const inspection = deferred<unknown>();
    fetchMock.mockReturnValueOnce(verification.promise).mockReturnValueOnce(inspection.promise);
    submitVerification();
    const verificationSignal: AbortSignal = fetchMock.mock.calls[0][1].signal;
    selectInspectionWorkflow();
    fireEvent.change(screen.getByLabelText("Evidence JSON"), { target: { value: "pending inspection" } });
    fireEvent.click(screen.getByRole("button", { name: "Inspect evidence" }));
    const inspectionSignal: AbortSignal = fetchMock.mock.calls[1][1].signal;
    fireEvent.click(screen.getByRole("button", { name: "Cancel request" }));
    expect(inspectionSignal.aborted).toBe(true);
    expect(verificationSignal.aborted).toBe(false);
    await act(async () => verification.resolve({ ok: true, status: 200, json: async () => verifiedExecution }));
    expect(screen.getByRole("status")).toHaveTextContent("Inspection request cancelled.");
    selectVerificationWorkflow();
    expect(screen.getByRole("region", { name: "Verified execution" })).toBeInTheDocument();
    expect(scrollIntoViewMock).not.toHaveBeenCalled();
  });

  it("aborts both pending workflow requests when the application unmounts", () => {
    fetchMock.mockReturnValue(new Promise(() => { }));
    submitVerification();
    selectInspectionWorkflow();
    fireEvent.click(screen.getByRole("button", { name: "Inspect evidence" }));
    const signals = fetchMock.mock.calls.map(([, request]) => request.signal as AbortSignal);
    expect(signals).toHaveLength(2);
    cleanup();
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });

  it.each(["verification", "inspection"])("keeps the example action disabled while %s is pending", (workflow) => {
    fetchMock.mockReturnValue(new Promise(() => { }));
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
});
