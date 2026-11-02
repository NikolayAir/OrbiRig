import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";
import { observation, verifiedExecution, failedTelemetryExecution } from "./test/appFixtures";
import { setupAppTests, submitVerification, submitEvidence, fetchMock, deferred, selectInspectionWorkflow } from "./test/appTestSupport";

setupAppTests();

const respond = (payload: unknown) => ({ ok: true, status: 200, json: async () => payload });

describe("request and edited-input states", () => {
  it.each([verifiedExecution, failedTelemetryExecution])("completes verification with $outcome and allows a fresh request", async (record) => {
    fetchMock.mockResolvedValue(respond(record));
    submitVerification();
    await screen.findByRole("region", { name: "Verified execution" });
    expect(screen.getByText("Verification completed.", { exact: true })).toBeVisible();
    expect(screen.getByLabelText(`Verification outcome: ${record.outcome}`)).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    const retry = deferred<unknown>();
    fetchMock.mockReturnValueOnce(retry.promise);
    fireEvent.click(screen.getByRole("button", { name: "Verify again" }));
    expect(screen.getByRole("button", { name: "Verifying…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel request" })).toBeEnabled();
    expect(screen.queryByText("Verification completed.", { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Verified execution" })).not.toBeInTheDocument();
    // A form submission while pending must not send a second request.
    fireEvent.submit(screen.getByRole("button", { name: "Verifying…" }).closest("form")!);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => retry.resolve(respond(record)));
    expect(screen.getByRole("button", { name: "Verify again" })).toBeEnabled();
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
    fireEvent.click(screen.getByRole("button", { name: "Inspect again" }));
    expect(screen.getByRole("button", { name: "Inspecting…" })).toBeDisabled();
    expect(screen.queryByText("Inspection completed. Evidence is valid.", { exact: true })).not.toBeInTheDocument();
    fireEvent.submit(screen.getByRole("button", { name: "Inspecting…" }).closest("form")!);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => retry.resolve(respond(payload)));
    expect(screen.getByRole("button", { name: "Inspect again" })).toBeEnabled();
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
