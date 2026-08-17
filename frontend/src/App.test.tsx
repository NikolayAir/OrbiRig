import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";

const observation = {
  command: {
    command_type: "SET_OPERATING_MODE",
    target_mode: "SAFE",
  },
  pre_state: {
    operating_mode: "NOMINAL",
  },
  acknowledgement: {
    accepted: true,
  },
  post_state: {
    operating_mode: "SAFE",
  },
  telemetry: {
    operating_mode: "SAFE",
  },
};

const verifiedExecution = {
  execution: {
    execution_id: "exec-web-001",
    executed_at: "2026-08-17T10:15:30Z",
    scenario_id: "nominal_to_safe_mode",
  },
  observation,
  invariant_results: [
    {
      invariant_id: "pre_state_matches_expected",
      expected: "NOMINAL",
      actual: "NOMINAL",
      passed: true,
    },
    {
      invariant_id: "acknowledgement_is_accepted",
      expected: true,
      actual: true,
      passed: true,
    },
  ],
  outcome: "PASS",
};

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

function selectVerifiedExecution() {
  fireEvent.click(screen.getByRole("radio", { name: "Verified execution" }));
}

function submitEvidence(
  evidence: string,
  evidenceType: "observation" | "verified-execution" = "observation",
) {
  render(<App />);
  if (evidenceType === "verified-execution") {
    selectVerifiedExecution();
  }
  fireEvent.change(
    screen.getByLabelText(
      evidenceType === "observation"
        ? "Observation evidence"
        : "Verified-execution evidence",
    ),
    { target: { value: evidence } },
  );
  fireEvent.click(screen.getByRole("button", { name: "Inspect evidence" }));
}

describe("App", () => {
  it("provides explicit evidence-type selection", () => {
    render(<App />);

    const observationOption = screen.getByRole("radio", {
      name: "Observation",
    });
    const verifiedExecutionOption = screen.getByRole("radio", {
      name: "Verified execution",
    });
    expect(observationOption).toBeChecked();
    expect(verifiedExecutionOption).not.toBeChecked();

    fireEvent.click(verifiedExecutionOption);

    expect(observationOption).not.toBeChecked();
    expect(verifiedExecutionOption).toBeChecked();
    expect(
      screen.getByLabelText("Verified-execution evidence"),
    ).toBeInTheDocument();
  });

  it("preserves existing observation inspection", async () => {
    const evidence = '{\n  "key": "value",\n  "key": "value"\n}';
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => observation,
    });

    submitEvidence(evidence);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/inspect/observation", {
        method: "POST",
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
        },
        body: evidence,
      });
    });
    expect(
      await screen.findByRole("heading", {
        name: "Reconstructed observation",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("SET_OPERATING_MODE")).toBeInTheDocument();
    expect(screen.getByText("NOMINAL")).toBeInTheDocument();
    expect(screen.getAllByText("SAFE")).toHaveLength(3);
    expect(screen.getByText("Accepted")).toBeInTheDocument();
    expect(screen.queryByText("PASS")).not.toBeInTheDocument();
    expect(screen.queryByText("FAIL")).not.toBeInTheDocument();
    expect(screen.queryByText(/ScenarioId/)).not.toBeInTheDocument();
  });

  it("sends verified-execution text unchanged to the dedicated endpoint", async () => {
    const evidence = '{\n  "outcome": "PASS",\n  "outcome": "PASS"\n}';
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => verifiedExecution,
    });

    submitEvidence(evidence, "verified-execution");

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/inspect/verified-execution",
        {
          method: "POST",
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
          },
          body: evidence,
        },
      );
    });
  });

  it("renders verified-execution metadata, observation, and ordered invariants", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => verifiedExecution,
    });

    submitEvidence("valid evidence", "verified-execution");

    expect(
      await screen.findByRole("heading", { name: "Verified execution" }),
    ).toBeInTheDocument();
    expect(screen.getByText("exec-web-001")).toBeInTheDocument();
    expect(screen.getByText("2026-08-17T10:15:30Z")).toBeInTheDocument();
    expect(screen.getByText("nominal_to_safe_mode")).toBeInTheDocument();
    expect(screen.getByText("SET_OPERATING_MODE")).toBeInTheDocument();

    const invariantItems = screen.getAllByRole("listitem");
    expect(invariantItems).toHaveLength(2);
    expect(
      within(invariantItems[0]).getByRole("heading", {
        name: "pre_state_matches_expected",
      }),
    ).toBeInTheDocument();
    expect(within(invariantItems[0]).getAllByText("NOMINAL")).toHaveLength(2);
    expect(within(invariantItems[0]).getByText("PASS")).toBeInTheDocument();
    expect(
      within(invariantItems[1]).getByRole("heading", {
        name: "acknowledgement_is_accepted",
      }),
    ).toBeInTheDocument();
    expect(within(invariantItems[1]).getAllByText("true")).toHaveLength(2);
    expect(within(invariantItems[1]).getByText("PASS")).toBeInTheDocument();
    expect(screen.getAllByText("PASS")).toHaveLength(3);
  });

  it("renders a FAIL response as valid inspected evidence", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ...verifiedExecution,
        invariant_results: [
          {
            invariant_id: "telemetry_matches_post_state",
            expected: "SAFE",
            actual: "NOMINAL",
            passed: false,
          },
        ],
        outcome: "FAIL",
      }),
    });

    submitEvidence("canonical fail evidence", "verified-execution");

    expect(
      await screen.findByRole("heading", { name: "Verified execution" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("FAIL")).toHaveLength(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows invalid verified-execution evidence distinctly", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 422 });

    submitEvidence("invalid evidence", "verified-execution");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The verified-execution evidence is invalid.",
    );
  });

  it("preserves invalid observation-evidence handling", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 422 });

    submitEvidence("invalid evidence");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The observation evidence is invalid.",
    );
  });

  it("shows a transport failure distinctly", async () => {
    fetchMock.mockRejectedValue(new TypeError("network failure"));

    submitEvidence("evidence", "verified-execution");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The inspection request could not be completed. Try again.",
    );
  });

  it("clears a verified execution when the evidence changes", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => verifiedExecution,
    });

    submitEvidence("first evidence", "verified-execution");

    expect(
      await screen.findByRole("heading", { name: "Verified execution" }),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Verified-execution evidence"), {
      target: { value: "changed evidence" },
    });

    expect(
      screen.queryByRole("heading", { name: "Verified execution" }),
    ).not.toBeInTheDocument();
  });

  it("clears stale results when the evidence type changes", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => verifiedExecution,
    });

    submitEvidence("verified evidence", "verified-execution");

    expect(
      await screen.findByRole("heading", { name: "Verified execution" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "Observation" }));

    expect(
      screen.queryByRole("heading", { name: "Verified execution" }),
    ).not.toBeInTheDocument();
  });

  it("shows loading while inspection is pending", () => {
    fetchMock.mockReturnValue(new Promise(() => {}));

    submitEvidence("evidence", "verified-execution");

    expect(screen.getByRole("status")).toHaveTextContent(
      "Inspecting evidence…",
    );
    expect(
      screen.getByRole("button", { name: "Inspect evidence" }),
    ).toBeDisabled();
    expect(screen.getByLabelText("Verified-execution evidence")).toBeDisabled();
    expect(
      screen.getByRole("radio", { name: "Observation" }),
    ).toBeDisabled();
  });
});
