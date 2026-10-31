import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  observation,
  observationEvidenceDocument,
  verifiedExecution,
  verifiedExecutionSequence,
} from "./test/appFixtures";
import {
  setupAppTests,
  selectInspectionWorkflow,
  selectVerificationWorkflow,
  selectVerifiedExecutionSequence,
  expectFeedbackScroll,
  submitEvidence,
  submitVerification,
  fetchMock,
  matchMediaMock,
  scrollIntoViewMock,
} from "./test/appTestSupport";

setupAppTests();

describe("App feedback", () => {
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
    expect(within(activeResult).getByRole("heading", { name: "Verified execution sequence" })).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent("Inspection completed. Valid verified execution sequence evidence. Sequence outcome: PASS.");
    expect(within(activeResult).getByLabelText("Sequence outcome: PASS")).toBeInTheDocument();
    expect(screen.getByLabelText("Evidence JSON")).toHaveValue("independent inspection evidence");
    expect(screen.getByRole("radio", { name: "Verified execution sequence" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Show Inspect evidence" })).toHaveAttribute("aria-pressed", "true");
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
    expect(within(activeResult).getByRole("heading", { name: "Verified execution" })).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent("Verification completed. Outcome: PASS.");
    expect(within(activeResult).getByLabelText("Verification outcome: PASS")).toBeInTheDocument();
    for (const [label, value] of activeInputs) {
      expect(screen.getByLabelText(label)).toHaveValue(value);
    }
    expect(screen.getByRole("button", { name: "Show Verify observation" })).toHaveAttribute("aria-pressed", "true");
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

  it.each(["verification", "inspection"] as const)("does not reclaim focus after the window loses focus during %s", async (workflow) => {
    let resolve!: (response: unknown) => void;
    fetchMock.mockReturnValue(new Promise((done) => { resolve = done; }));
    if (workflow === "verification") submitVerification();
    else submitEvidence("pending observation");
    const status = screen.getByRole("status");
    expect(status).not.toBeEmptyDOMElement();
    fireEvent(window, new Event("blur"));

    await act(async () => resolve({
      ok: true, status: 200,
      json: async () => workflow === "verification" ? verifiedExecution : observation,
    }));

    expect(screen.getByRole("status")).toBe(status);
    expect(status).toBeEmptyDOMElement();
    expect(screen.getByRole("heading", { name: workflow === "verification" ? "Verified execution" : "Observation details" })).not.toHaveFocus();
    expect(scrollIntoViewMock).not.toHaveBeenCalled();
  });

  for (const workflow of ["verification", "inspection"] as const) {
    it.each([422, 413, 500, "network", "malformed"])(`focuses ${workflow} request errors without announcing a completed result (%s)`, async (failure) => {
      if (failure === "network") fetchMock.mockRejectedValue(new TypeError("Network failure"));
      else fetchMock.mockResolvedValue({
        ok: failure === "malformed", status: failure === "malformed" ? 200 : failure,
        json: async () => failure === 422 ? { detail: { code: "invalid_observation_evidence" } } : {},
      });
      if (workflow === "verification") submitVerification();
      else submitEvidence("observation");

      const alert = await screen.findByRole("alert");
      await waitFor(() => expect(alert).toHaveFocus());
      expect(screen.getByRole("status")).toBeEmptyDOMElement();
      await expectFeedbackScroll();
    });
  }
});
