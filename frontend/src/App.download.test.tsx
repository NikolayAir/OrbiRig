import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { VERIFIED_EXECUTION_FILE_NAME, downloadVerifiedExecutionEvidence } from "./downloadEvidence";
import { failedTelemetryExecution, verifiedExecution } from "./test/appFixtures";
import {
  deferred,
  fetchMock,
  setupAppTests,
  submitEvidence,
  submitVerification,
} from "./test/appTestSupport";

setupAppTests();

const DOWNLOAD = "Download result JSON";

const createObjectURL = vi.fn<(blob: Blob) => string>();
const revokeObjectURL = vi.fn<(url: string) => void>();
const savedFiles: Array<{ fileName: string; href: string }> = [];

beforeEach(() => {
  savedFiles.length = 0;
  createObjectURL.mockReset().mockReturnValue("blob:orbirig-result");
  revokeObjectURL.mockReset();
  // jsdom has neither object URLs nor downloads. Record what the page asks the
  // browser to save; Playwright checks the real file.
  Object.defineProperties(URL, {
    createObjectURL: { configurable: true, value: createObjectURL },
    revokeObjectURL: { configurable: true, value: revokeObjectURL },
  });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    savedFiles.push({ fileName: this.download, href: this.href });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  // jsdom does not define these functions. Remove the replacements so that
  // other tests in the same worker see the environment they expect.
  Reflect.deleteProperty(URL, "createObjectURL");
  Reflect.deleteProperty(URL, "revokeObjectURL");
});

function respond(payload: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload };
}

async function completedResult() {
  return screen.findByRole("region", { name: "Verified execution" });
}

// jsdom's Blob cannot be read directly; a FileReader gives the stored bytes.
function readBlob<Result extends string | ArrayBuffer>(start: (reader: FileReader) => void) {
  return new Promise<Result>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as Result);
    reader.onerror = () => reject(reader.error);
    start(reader);
  });
}

async function savedText() {
  expect(createObjectURL).toHaveBeenCalledTimes(1);
  const blob = createObjectURL.mock.calls[0][0];
  return readBlob<string>(reader => reader.readAsText(blob));
}

describe("Download result JSON", () => {
  it.each([
    ["PASS", verifiedExecution],
    ["FAIL", failedTelemetryExecution],
  ])("saves a completed %s result as the text the server returned", async (outcome, payload) => {
    fetchMock.mockResolvedValue(respond(payload));
    submitVerification();

    const result = await completedResult();
    expect(within(result).getByText(`Verification outcome: ${outcome}`)).toBeInTheDocument();
    const button = within(result).getByRole("button", { name: DOWNLOAD });
    expect(button).toHaveAttribute("type", "button");
    expect(button).toBeEnabled();
    fireEvent.click(button);

    expect(await savedText()).toBe(payload.verified_execution_evidence);
    expect(createObjectURL.mock.calls[0][0].type).toBe("application/json");
    expect(savedFiles).toEqual([{ fileName: "orbirig-verified-execution.json", href: "blob:orbirig-result" }]);
    // Saving is not another verification.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("offers the record that is currently on screen after a new verification", async () => {
    fetchMock.mockResolvedValueOnce(respond(verifiedExecution)).mockResolvedValueOnce(respond(failedTelemetryExecution));
    submitVerification();
    await completedResult();

    // Editing an input removes the first result and its download. The second
    // verification must offer its own text, never the earlier PASS text.
    fireEvent.change(screen.getByLabelText("Execution ID"), { target: { value: "exec-web-verify-002" } });
    expect(screen.queryByRole("button", { name: DOWNLOAD })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Verify observation" }));
    const result = await screen.findByText("Verification outcome: FAIL");
    expect(result).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: DOWNLOAD }));

    expect(await savedText()).toBe(failedTelemetryExecution.verified_execution_evidence);
  });

  // App keeps the completed result while Inspect evidence is selected.
  it("keeps the download available after visiting Inspect evidence and returning", async () => {
    fetchMock.mockResolvedValue(respond(verifiedExecution));
    submitVerification();
    await completedResult();

    fireEvent.click(screen.getByRole("button", { name: "Show Inspect evidence" }));
    fireEvent.click(screen.getByRole("button", { name: "Show Verify observation" }));
    fireEvent.click(within(await completedResult()).getByRole("button", { name: DOWNLOAD }));

    expect(await savedText()).toBe(verifiedExecution.verified_execution_evidence);
  });

  it("offers no download before a result exists", () => {
    render(<App />);

    expect(screen.queryByRole("button", { name: DOWNLOAD })).not.toBeInTheDocument();
  });

  it("offers no download while verification is pending or after it is cancelled", async () => {
    const pending = deferred<unknown>();
    fetchMock.mockReturnValue(pending.promise);
    submitVerification();

    expect(screen.getByRole("button", { name: "Verifying…" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: DOWNLOAD })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel request" }));
    await act(async () => pending.reject(new DOMException("Aborted", "AbortError")));

    expect(screen.queryByRole("button", { name: DOWNLOAD })).not.toBeInTheDocument();
  });

  it.each([
    ["an input error", respond({ detail: { code: "scenario_command_mismatch", message: "Mismatch." } }, 422)],
    ["a request that is too large", respond({}, 413)],
    ["a server error", respond({}, 500)],
  ])("offers no download after %s", async (_description, response) => {
    fetchMock.mockResolvedValue(response);
    submitVerification();

    expect(await screen.findByRole("alert")).toBeVisible();
    expect(screen.queryByRole("region", { name: "Verified execution" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: DOWNLOAD })).not.toBeInTheDocument();
  });

  it("asks for a shorter execution ID when the result would exceed the inspection limit", async () => {
    const message = "The saved evidence would exceed the web interface's 4 MiB inspection limit. "
      + "Shorten the Execution ID and try again.";
    fetchMock.mockResolvedValue(respond({ detail: {
      code: "invalid_execution_metadata", field: "execution_id", message,
    } }, 422));
    submitVerification();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(message);
    expect(alert).not.toHaveTextContent("Use a non-blank ID and a UTC time");
    const executionId = screen.getByRole("textbox", { name: "Execution ID" });
    expect(executionId).toHaveAttribute("aria-invalid", "true");
    expect(executionId).toHaveAccessibleDescription(expect.stringContaining(message));
    expect(screen.queryByRole("region", { name: "Verified execution" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: DOWNLOAD })).not.toBeInTheDocument();
  });

  it("offers no download when the request cannot reach the server", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    submitVerification();

    expect(await screen.findByRole("alert")).toBeVisible();
    expect(screen.queryByRole("button", { name: DOWNLOAD })).not.toBeInTheDocument();
  });

  it.each([
    ["is missing", undefined],
    ["is empty", ""],
    ["is not text", { schema_version: 1 }],
  ])("treats a verification response whose evidence text %s as a server failure", async (_description, evidence) => {
    // Start from a complete response, then remove or replace only the saved text.
    const { verified_execution_evidence: _saved, ...display } = verifiedExecution;
    fetchMock.mockResolvedValue(respond(
      evidence === undefined ? display : { ...display, verified_execution_evidence: evidence },
    ));
    submitVerification();

    expect(await screen.findByRole("alert")).toHaveTextContent("The server could not complete verification. Try again.");
    expect(screen.queryByRole("region", { name: "Verified execution" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: DOWNLOAD })).not.toBeInTheDocument();
  });

  // The mocked inspection response still contains the saved-text field, as the
  // shared fixture does. Only a new verification may offer the download.
  it("offers no download for a verified execution opened in Inspect evidence", async () => {
    fetchMock.mockResolvedValue(respond(verifiedExecution));
    submitEvidence("saved evidence", "verified-execution");

    const result = await completedResult();
    expect(within(result).getByText("Valid saved evidence")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: DOWNLOAD })).not.toBeInTheDocument();
  });
});

describe("downloadVerifiedExecutionEvidence", () => {
  it("saves non-ASCII text and the final newline as UTF-8 without a byte-order mark", async () => {
    const text = '{\n  "note": "é🚀"\n}\n';

    downloadVerifiedExecutionEvidence(text);

    const blob = createObjectURL.mock.calls[0][0];
    const bytes = new Uint8Array(await readBlob<ArrayBuffer>(reader => reader.readAsArrayBuffer(blob)));
    expect(Array.from(bytes)).toEqual(Array.from(new TextEncoder().encode(text)));
    expect(bytes.slice(0, 3)).not.toEqual(new Uint8Array([0xef, 0xbb, 0xbf]));
    expect(savedFiles).toEqual([{ fileName: VERIFIED_EXECUTION_FILE_NAME, href: "blob:orbirig-result" }]);
  });

  it("releases the object URL after the browser has had time to start the download", () => {
    vi.useFakeTimers();

    downloadVerifiedExecutionEvidence("{}\n");

    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(10_000);
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:orbirig-result");
  });
});
