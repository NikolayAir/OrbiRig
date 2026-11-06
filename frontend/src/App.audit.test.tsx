import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { App } from "./App";
import { VerifiedExecutionDetails } from "./EvidenceDetails";
import { verifiedExecution } from "./test/appFixtures";
import { fetchMock, setupAppTests, submitEvidence, submitVerification } from "./test/appTestSupport";

setupAppTests();

describe("pre-release regressions", () => {
  it.each([
    ["acknowledgement_is_accepted", true, true, true, "Accepted", "Accepted"],
    ["acknowledgement_is_accepted", true, false, false, "Accepted", "Rejected"],
    ["acknowledgement_is_rejected", false, false, true, "Rejected", "Rejected"],
    ["acknowledgement_is_rejected", false, true, false, "Rejected", "Accepted"],
  ] as const)("presents %s expected %s actual %s with result %s", (id, expected, actual, passed, expectedLabel, actualLabel) => {
    const record = { ...structuredClone(verifiedExecution), outcome: "PASS" as const };
    record.invariant_results[1] = { invariant_id: id, expected, actual, passed };
    render(<VerifiedExecutionDetails record={record} />);
    const check = screen.getByText(id).closest("li")!;
    const definitions = check.querySelectorAll("dd");
    expect(definitions[0]).toHaveTextContent(expectedLabel);
    expect(definitions[1]).toHaveTextContent(actualLabel);
    expect(within(check).getByText(`Verification check: ${passed ? "PASS" : "FAIL"}`)).toBeInTheDocument();
    expect(record.invariant_results[1]).toEqual({ invariant_id: id, expected, actual, passed });
  });

  it("associates visible workflow descriptions with the controls and exposes badge text", () => {
    render(<App />);
    expect(screen.getByRole("button", { name: "Show Verify observation" }))
      .toHaveAccessibleDescription("Compare a recorded result with a scenario.");
    expect(screen.getByRole("button", { name: "Show Inspect evidence" }))
      .toHaveAccessibleDescription("Validate saved records and recheck any verification results they contain.");
    render(<VerifiedExecutionDetails record={{ ...verifiedExecution, outcome: "PASS" }} />);
    const badge = screen.getByText("Verification outcome: PASS").closest(".outcome-badge");
    expect(badge).not.toHaveAttribute("aria-label");
    expect(badge).not.toHaveAttribute("role", "status");
  });

  it.each([
    ["executed_at", "Execution time (UTC)", "timestamp must be a valid UTC date and time"],
    ["execution_id", "Execution ID", "Execution ID must be non-blank text without surrogate code points."],
  ] as const)("identifies the server-rejected %s input and clears the error after editing", async (field, label, message) => {
    fetchMock.mockResolvedValue({ ok: false, status: 422, json: async () => ({
      detail: { code: "invalid_execution_metadata", field, message },
    }) });
    submitVerification();
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    const input = screen.getByLabelText(label);
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription(expect.stringContaining(message));
    expect(screen.getByLabelText(field === "executed_at" ? "Execution ID" : "Execution time (UTC)"))
      .not.toHaveAttribute("aria-invalid");
    fireEvent.change(input, { target: { value: "edited" } });
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows the server's evidence path as text without rendering markup", async () => {
    const message = "verified execution sequence evidence is invalid. records[57].observation.telemetry.operating_mode: must be a string <script>";
    fetchMock.mockResolvedValue({ ok: false, status: 422, json: async () => ({ detail: message }) });
    submitEvidence("invalid evidence", "verified-execution-sequence");
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(document.querySelector("script")).toBeNull();
    expect(screen.queryByRole("region", { name: "Verified execution sequence" })).not.toBeInTheDocument();
  });

  it("uses local guidance for an invalid diagnostic response", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 422, json: async () => ({ detail: ["invalid"] }) });
    submitEvidence("invalid evidence");
    expect(await screen.findByRole("alert")).toHaveTextContent("The observation evidence is invalid.");
  });
});
