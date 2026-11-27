import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { downloadEvidence } from "./downloadEvidence";
import {
  expectedVerifiedExecutionSequenceInspectionExample,
  failedTelemetryExecution,
  observation,
  observationEvidenceDocument,
  verifiedExecution,
} from "./test/appFixtures";
import {
  deferred,
  fetchMock,
  selectVerifiedExecution,
  setupAppTests,
  submitEvidence,
  submitVerification,
} from "./test/appTestSupport";

setupAppTests();

const DOWNLOAD = "Download result JSON";
const INSPECTION_DOWNLOAD = "Download evidence JSON";

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
});

describe("Download evidence JSON", () => {
  it.each([
    ["observation", observation, observationEvidenceDocument],
    ["verified-execution", failedTelemetryExecution, failedTelemetryExecution.verified_execution_evidence],
    ["verified-execution-sequence", expectedVerifiedExecutionSequenceInspectionExample, JSON.stringify(expectedVerifiedExecutionSequenceInspectionExample)],
  ] as const)("saves the submitted text for a successful %s inspection", async (type, payload, source) => {
    const text = ` \t\n${source.trimEnd()}\n\n `;
    fetchMock.mockResolvedValue(respond(payload));
    submitEvidence(text, type);

    fireEvent.click(await screen.findByRole("button", { name: INSPECTION_DOWNLOAD }));
    expect(await savedText()).toBe(text);
    expect(createObjectURL.mock.calls[0][0].type).toBe("application/json");
    expect(savedFiles).toEqual([{ fileName: `orbirig-${type}.json`, href: "blob:orbirig-result" }]);
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      `/api/inspect/${type}`,
      expect.objectContaining({ body: text }),
    );
    expect(screen.queryByRole("button", { name: DOWNLOAD })).not.toBeInTheDocument();
  });

  it.each(["text", "evidence type"])("clears the inspection download when the %s changes", async (field) => {
    fetchMock.mockResolvedValue(respond(observation));
    submitEvidence(observationEvidenceDocument);
    expect(await screen.findByRole("button", { name: INSPECTION_DOWNLOAD })).toBeEnabled();

    if (field === "text") {
      fireEvent.change(screen.getByLabelText("Evidence JSON"), { target: { value: "{}" } });
    } else {
      selectVerifiedExecution();
    }
    expect(screen.queryByRole("button", { name: INSPECTION_DOWNLOAD })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Observation details" })).not.toBeInTheDocument();
  });

  it("keeps the newer inspection's download when a cancelled response finishes parsing", async () => {
    const pending = deferred<unknown>();
    const json = vi.fn(() => pending.promise);
    fetchMock.mockResolvedValueOnce({ ...respond({}), json }).mockResolvedValueOnce(respond(observation));
    submitEvidence(verifiedExecution.verified_execution_evidence, "verified-execution");
    await waitFor(() => expect(json).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: INSPECTION_DOWNLOAD })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel request" }));
    expect(screen.queryByRole("button", { name: INSPECTION_DOWNLOAD })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Observation" }));
    fireEvent.change(screen.getByLabelText("Evidence JSON"), { target: { value: observationEvidenceDocument } });
    fireEvent.click(screen.getByRole("button", { name: "Inspect evidence" }));
    const result = await screen.findByRole("region", { name: "Observation details" });

    await act(async () => pending.resolve(verifiedExecution));
    fireEvent.click(within(result).getByRole("button", { name: INSPECTION_DOWNLOAD }));
    expect(await savedText()).toBe(observationEvidenceDocument);
    expect(savedFiles).toEqual([{ fileName: "orbirig-observation.json", href: "blob:orbirig-result" }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["invalid evidence", respond({}, 422)],
    ["an incomplete presentation", respond({ ...verifiedExecution, invariant_results: [] })],
    ["a failed server response", respond({}, 500)],
  ])("offers no download for %s", async (_description, response) => {
    fetchMock.mockResolvedValue(response);
    submitEvidence(verifiedExecution.verified_execution_evidence, "verified-execution");

    expect(await screen.findByRole("alert")).toBeVisible();
    expect(screen.queryByRole("button", { name: INSPECTION_DOWNLOAD })).not.toBeInTheDocument();
  });

  it("offers no download when the inspection cannot reach the server", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    submitEvidence(observationEvidenceDocument);

    expect(await screen.findByRole("alert")).toHaveTextContent("Inspection unavailable");
    expect(screen.queryByRole("button", { name: INSPECTION_DOWNLOAD })).not.toBeInTheDocument();
  });
});

describe("downloadEvidence", () => {
  it("saves non-ASCII text and the final newline as UTF-8 without a byte-order mark", async () => {
    const text = '{\n  "note": "é🚀"\n}\n';

    downloadEvidence(text, "verified-execution");

    const blob = createObjectURL.mock.calls[0][0];
    const bytes = new Uint8Array(await readBlob<ArrayBuffer>(reader => reader.readAsArrayBuffer(blob)));
    expect(Array.from(bytes)).toEqual(Array.from(new TextEncoder().encode(text)));
    expect(bytes.slice(0, 3)).not.toEqual(new Uint8Array([0xef, 0xbb, 0xbf]));
    expect(savedFiles).toEqual([{ fileName: "orbirig-verified-execution.json", href: "blob:orbirig-result" }]);
  });

  it("releases the object URL after the browser has had time to start the download", () => {
    vi.useFakeTimers();

    downloadEvidence("{}\n", "verified-execution");

    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(10_000);
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:orbirig-result");
  });
});
