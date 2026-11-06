import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { fetchMock, setupAppTests, submitEvidence, submitVerification } from "./test/appTestSupport";

setupAppTests();

describe("pre-release regressions", () => {
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
