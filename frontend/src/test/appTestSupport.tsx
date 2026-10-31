import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, vi } from "vitest";
import { App } from "../App";

export const fetchMock = vi.fn();
export const matchMediaMock = vi.fn();
export const scrollIntoViewMock = vi.fn();

// Each file registers fresh setup and teardown. The test groups still render
// the real App so navigation, focus and independent requests are checked together.
export function setupAppTests() {
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
        value: function(this: HTMLDialogElement) { this.open = true; },
      },
      close: {
        configurable: true,
        value: function(this: HTMLDialogElement) {
          this.open = false;
          this.dispatchEvent(new Event("close"));
        },
      },
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("matchMedia", matchMediaMock);
    // Rendered sizing and resize behaviour are checked in Playwright.
    vi.stubGlobal("ResizeObserver", class {
      observe() { }
      disconnect() { }
    });
  });

  afterEach(() => {
    cleanup();
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });
}

export function selectVerifiedExecution() {
  fireEvent.click(screen.getByRole("radio", { name: "Verified execution" }));
}

export function selectInspectionWorkflow() {
  fireEvent.click(
    screen.getByRole("button", { name: "Show Inspect evidence" }),
  );
}

export function selectVerificationWorkflow() {
  fireEvent.click(
    screen.getByRole("button", { name: "Show Verify observation" }),
  );
}

export function selectVerifiedExecutionSequence() {
  fireEvent.click(
    screen.getByRole("radio", { name: "Verified execution sequence" }),
  );
}

export async function expectFeedbackScroll(behavior: ScrollBehavior = "smooth") {
  await waitFor(() => {
    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);
    expect(scrollIntoViewMock).toHaveBeenCalledWith({
      behavior,
      block: "start",
    });
  });
}

export function submitEvidence(
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

export function submitVerification({
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

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
