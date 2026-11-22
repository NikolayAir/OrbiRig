import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";
import { observation, observationEvidenceDocument, verifiedExecution } from "./test/appFixtures";
import { chooseStandardExample, fetchMock, selectInspectionWorkflow, selectVerificationWorkflow, setupAppTests, submitVerification } from "./test/appTestSupport";

setupAppTests();
afterEach(() => vi.restoreAllMocks());

function evidenceInput() {
  return screen.getByRole("textbox", { name: "Evidence JSON" });
}

function submitButton() {
  return screen.getByRole("button", { name: "Inspect evidence" });
}

function selectFile(file: File) {
  fireEvent.change(screen.getByLabelText("Evidence file", { selector: "input" }), { target: { files: [file] } });
}

const FILE_OPENED = "File opened in Evidence JSON. Choose Inspect evidence when ready.";

describe("Open JSON file", () => {
  it("opens raw text for the selected type and waits for explicit submission", async () => {
    const text = '\ufeff{\r\n  "execution_id": "run-Δ",\r\n  "execution_id": "another-run"\r\n}\r\n';
    fetchMock.mockResolvedValue({ ok: false, status: 422 });
    render(<App />);
    selectInspectionWorkflow();
    const type = screen.getByRole("radio", { name: "Verified execution" });
    fireEvent.click(type);

    fireEvent.click(submitButton());
    expect(evidenceInput()).toHaveAttribute("aria-invalid", "true");
    selectFile(new File([text], "verified-execution.json"));

    await screen.findByText(FILE_OPENED);
    // A textarea displays newlines as LF, while the request uses the stored text.
    expect(evidenceInput()).toHaveValue(text.replaceAll("\r\n", "\n"));
    expect(evidenceInput()).not.toHaveAttribute("aria-invalid");
    expect(type).toBeChecked();
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(submitButton());
    expect(fetchMock).toHaveBeenCalledWith("/api/inspect/verified-execution", expect.objectContaining({ body: text }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid evidence");
  });

  it("accepts a file at the 4 MiB limit", async () => {
    render(<App />);
    selectInspectionWorkflow();
    const bytes = new Uint8Array(4 * 1024 * 1024);
    bytes.fill(0x20);
    bytes.set(new TextEncoder().encode(observationEvidenceDocument));
    selectFile(new File([bytes], "boundary.json"));

    await screen.findByText(FILE_OPENED);
    expect((evidenceInput() as HTMLTextAreaElement).value.length).toBe(bytes.length);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("leaves the current result and text in place when a file is too large", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => observation });
    render(<App />);
    selectInspectionWorkflow();
    fireEvent.change(evidenceInput(), { target: { value: observationEvidenceDocument } });
    fireEvent.click(submitButton());
    const result = await screen.findByRole("region", { name: "Observation details" });
    const reader = vi.spyOn(FileReader.prototype, "readAsArrayBuffer");

    selectFile(new File([new Uint8Array(4 * 1024 * 1024 + 1)], "oversized.json"));

    expect(screen.getByRole("alert")).toHaveTextContent("The JSON file exceeds 4 MiB");
    expect(screen.getByRole("button", { name: "Open JSON file" })).toHaveAccessibleDescription(/exceeds 4 MiB/);
    expect(reader).not.toHaveBeenCalled();
    expect(evidenceInput()).toHaveValue(observationEvidenceDocument);
    expect(result).toBeInTheDocument();
    expect(submitButton()).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports invalid UTF-8 before confirming a replacement", async () => {
    render(<App />);
    selectInspectionWorkflow();
    fireEvent.change(evidenceInput(), { target: { value: "edited draft" } });
    selectFile(new File([new Uint8Array([0xc3, 0x28])], "bad-encoding.json"));

    expect(await screen.findByRole("alert")).toHaveTextContent("The file is not valid UTF-8");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(evidenceInput()).toHaveValue("edited draft");
    expect(submitButton()).toBeEnabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("allows another file after a read error", async () => {
    const reader = vi.spyOn(FileReader.prototype, "readAsArrayBuffer").mockImplementationOnce(
      function (this: FileReader) { this.dispatchEvent(new Event("error")); },
    );
    render(<App />);
    selectInspectionWorkflow();
    selectFile(new File(["unreadable"], "unreadable.json"));

    expect(screen.getByRole("alert")).toHaveTextContent("The file could not be read");
    expect(evidenceInput()).toHaveValue("");
    selectFile(new File([observationEvidenceDocument], "observation.json"));

    await screen.findByText(FILE_OPENED);
    expect(reader).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps edited evidence when the selected file contains only whitespace", async () => {
    render(<App />);
    selectInspectionWorkflow();
    fireEvent.change(evidenceInput(), { target: { value: "edited draft" } });
    selectFile(new File([" \n\t"], "empty.json"));

    expect(await screen.findByRole("alert")).toHaveTextContent("The file contains no JSON text");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(evidenceInput()).toHaveValue("edited draft");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("abandons a file read when switching away from inspection", () => {
    let finishRead: (() => void) | undefined;
    vi.spyOn(FileReader.prototype, "readAsArrayBuffer").mockImplementationOnce(function (this: FileReader) {
      finishRead = () => {
        Object.defineProperty(this, "result", { value: new TextEncoder().encode("late file").buffer });
        this.dispatchEvent(new Event("load"));
      };
    });
    render(<App />);
    selectInspectionWorkflow();
    fireEvent.change(evidenceInput(), { target: { value: "kept draft" } });

    selectFile(new File(["late file"], "pending.json"));
    expect(submitButton()).toBeDisabled();
    expect(evidenceInput()).toBeDisabled();
    expect(screen.getByRole("button", { name: "Load example" })).toBeDisabled();
    selectVerificationWorkflow();
    selectInspectionWorkflow();
    act(() => finishRead!());

    expect(evidenceInput()).toHaveValue("kept draft");
    expect(submitButton()).toBeEnabled();
    expect(screen.queryByText(FILE_OPENED)).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the opened file as the baseline for later edits", async () => {
    render(<App />);
    selectInspectionWorkflow();
    selectFile(new File(["an opened document"], "observation.json"));
    await screen.findByText(FILE_OPENED);

    fireEvent.change(evidenceInput(), { target: { value: "an edited document" } });
    chooseStandardExample();
    const dialog = screen.getByRole("dialog", { name: "Replace current inputs?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(evidenceInput()).toHaveValue("an edited document");

    fireEvent.change(evidenceInput(), { target: { value: "an opened document" } });
    chooseStandardExample();
    expect(screen.queryByRole("dialog", { name: "Replace current inputs?" })).not.toBeInTheDocument();
    expect(evidenceInput()).toHaveValue(observationEvidenceDocument);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("Open JSON file for verification", () => {
  const opened = "File opened in Observation evidence JSON. Choose Verify observation when ready.";
  const observationInput = () => screen.getByRole("textbox", { name: "Observation evidence JSON" });
  const verify = () => screen.getByRole("button", { name: "Verify observation" });

  it("fills the observation while leaving missing execution details empty", async () => {
    const text = '{"execution_id":"from-file","executed_at":"2026-08-17T08:00:00Z","scenario_id":"safe_to_nominal_mode"}';
    render(<App />);
    fireEvent.click(verify());
    expect(observationInput()).toHaveAttribute("aria-invalid", "true");
    selectFile(new File([text], "observation.json"));

    await screen.findByText(opened);
    expect(observationInput()).toHaveValue(text);
    expect(observationInput()).not.toHaveAttribute("aria-invalid");
    expect(screen.getByLabelText("Execution ID")).toHaveValue("");
    expect(screen.getByLabelText("Execution time (UTC)")).toHaveValue("");
    expect(screen.getByLabelText("Scenario")).toHaveValue("");
    expect(screen.getByLabelText("Execution ID")).toHaveAttribute("aria-invalid", "true");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["cancel", "read error", "size limit"] as const)("preserves the checked input and result after %s", async action => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => verifiedExecution });
    submitVerification({ evidence: observationEvidenceDocument });
    const result = await screen.findByRole("region", { name: "Verified execution" });
    const button = screen.getByRole("button", { name: "Open JSON file" });

    if (action === "cancel") {
      fireEvent.change(screen.getByLabelText("Evidence file", { selector: "input" }), { target: { files: [] } });
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    } else if (action === "read error") {
      vi.spyOn(FileReader.prototype, "readAsArrayBuffer").mockImplementationOnce(
        function (this: FileReader) { this.dispatchEvent(new Event("error")); },
      );
      selectFile(new File(["unreadable"], "observation.json"));
      expect(button).toHaveAccessibleDescription(/could not be read/);
    } else {
      selectFile(new File([new Uint8Array(4 * 1024 * 1024 + 1)], "oversized.json"));
      expect(button).toHaveAccessibleDescription(/exceeds 4 MiB/);
    }

    expect(observationInput()).toHaveValue(observationEvidenceDocument);
    expect(screen.getByLabelText("Execution ID")).toHaveValue("exec-web-verify-001");
    expect(screen.getByLabelText("Execution time (UTC)")).toHaveValue("2026-08-25T18:30:00Z");
    expect(screen.getByLabelText("Scenario")).toHaveValue("nominal_to_safe_mode");
    expect(result).toBeInTheDocument();
    expect(within(result).getByRole("button", { name: "Download result JSON" })).toBeEnabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("clears the result only when a file changes the observation", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => verifiedExecution });
    submitVerification({ evidence: observationEvidenceDocument });
    const result = await screen.findByRole("region", { name: "Verified execution" });
    selectFile(new File([observationEvidenceDocument], "same-observation.json"));
    await screen.findByText(opened);
    expect(result).toBeInTheDocument();

    // The identical file establishes the baseline for the next replacement.
    const changed = JSON.stringify({ evidence_format_version: 1, ...observation, telemetry: { operating_mode: "NOMINAL" } });
    selectFile(new File([changed], "different-observation.json"));
    await screen.findByText("Inputs changed. Verify to check the current values.");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(observationInput()).toHaveValue(changed);
    expect(result).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Download result JSON" })).not.toBeInTheDocument();
    expect(verify()).toBeEnabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
