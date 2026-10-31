import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";
import {
  observationEvidenceDocument,
  expectedNominalToSafeObservationExample,
  expectedNominalToNominalRejectionObservationExample,
  expectedSafeToNominalObservationExample,
  expectedVerifiedExecutionInspectionExample,
  expectedVerifiedExecutionSequenceInspectionExample,
  verifiedExecution,
} from "./test/appFixtures";
import {
  setupAppTests,
  selectInspectionWorkflow,
  selectVerificationWorkflow,
  selectVerifiedExecutionSequence,
  expectFeedbackScroll,
  submitVerification,
  fetchMock,
  scrollIntoViewMock,
} from "./test/appTestSupport";

setupAppTests();

describe("App examples", () => {
  it.each([
    ["Execution ID", "manual-execution", "example-execution-001"],
    ["Execution time (UTC)", "2026-10-22T12:00:00Z", "2026-08-26T08:30:00Z"],
    ["Observation evidence JSON", "manual evidence", observationEvidenceDocument],
  ])("protects edited %s until replacement is confirmed", (label, value, example) => {
    render(<App />);
    const input = screen.getByLabelText(label);
    const trigger = screen.getByRole("button", { name: "Load example" });
    fireEvent.change(input, { target: { value } });
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Replace current inputs?" });
    expect(dialog).toHaveAccessibleDescription(
      "Loading the example will replace your current form inputs, including any unsaved changes.",
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(input).toHaveValue(value);
    expect(trigger).toHaveFocus();
    expect(screen.getByLabelText("Scenario")).toHaveValue("");

    fireEvent.click(trigger);
    fireEvent.click(within(screen.getByRole("dialog", { name: "Replace current inputs?" })).getByRole("button", { name: "Load example" }));
    expect(input).toHaveValue(example);
    expect(screen.queryByRole("dialog", { name: "Replace current inputs?" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["verification", "inspection"])("does not prompt for unchanged or reverted %s examples", (workflow) => {
    render(<App />);
    if (workflow === "inspection") selectInspectionWorkflow();
    const input = screen.getByLabelText(workflow === "inspection" ? "Evidence JSON" : "Execution ID") as HTMLInputElement;
    const trigger = screen.getByRole("button", { name: "Load example" });
    fireEvent.change(input, { target: { value: " \n " } });
    fireEvent.click(trigger);
    expect(screen.queryByRole("dialog", { name: "Replace current inputs?" })).not.toBeInTheDocument();
    const example = input.value;
    fireEvent.click(trigger);
    expect(input).toHaveValue(example);
    fireEvent.change(input, { target: { value: "manual value" } });
    fireEvent.change(input, { target: { value: example } });
    fireEvent.click(trigger);
    expect(screen.queryByRole("dialog", { name: "Replace current inputs?" })).not.toBeInTheDocument();

    if (workflow === "verification") {
      fireEvent.change(screen.getByLabelText("Scenario"), { target: { value: "safe_to_nominal_mode" } });
      fireEvent.click(trigger);
      expect(screen.queryByRole("dialog", { name: "Replace current inputs?" })).not.toBeInTheDocument();
      expect(input).toHaveValue("example-execution-003");
    }

    // Clearing a populated example is also a manual change.
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.click(trigger);
    fireEvent(screen.getByRole("dialog", { name: "Replace current inputs?" }), new Event("cancel", { cancelable: true }));
    expect(input).toHaveValue("");
    expect(trigger).toHaveFocus();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not prompt when a manually entered value already matches the next example", () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText("Execution ID"), { target: { value: "example-execution-001" } });
    fireEvent.click(screen.getByRole("button", { name: "Load example" }));
    expect(screen.queryByRole("dialog", { name: "Replace current inputs?" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Scenario")).toHaveValue("nominal_to_safe_mode");
  });

  it("preserves validation feedback and manual values when example replacement is cancelled", () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText("Execution ID"), { target: { value: "manual-id" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify observation" }));
    const errors = screen.getAllByRole("alert").map(element => element.textContent);
    fireEvent.click(screen.getByRole("button", { name: "Load example" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Replace current inputs?" })).getByRole("button", { name: "Cancel" }));
    expect(screen.getAllByRole("alert").map(element => element.textContent)).toEqual(errors);
    expect(screen.getByLabelText("Execution ID")).toHaveValue("manual-id");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps manual-change protection separate across workflow switches", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Load example" }));
    fireEvent.change(screen.getByLabelText("Execution ID"), { target: { value: "keep-verification" } });
    selectInspectionWorkflow();
    fireEvent.click(screen.getByRole("button", { name: "Load example" }));
    fireEvent.change(screen.getByLabelText("Evidence JSON"), { target: { value: "keep-inspection" } });
    selectVerifiedExecutionSequence();
    selectVerificationWorkflow();
    fireEvent.click(screen.getByRole("button", { name: "Load example" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Replace current inputs?" })).getByRole("button", { name: "Cancel" }));
    expect(screen.getByLabelText("Execution ID")).toHaveValue("keep-verification");
    selectInspectionWorkflow();
    fireEvent.click(screen.getByRole("button", { name: "Load example" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Replace current inputs?" })).getByRole("button", { name: "Cancel" }));
    expect(screen.getByLabelText("Evidence JSON")).toHaveValue("keep-inspection");
    expect(screen.getByRole("radio", { name: "Verified execution sequence" })).toBeChecked();
  });

  it("loads an editable verification example without submitting it", () => {
    render(<App />);

    expect(screen.getByRole("button", { name: "Load example" })).toHaveAccessibleDescription(
      "Replaces current inputs",
    );
    expect(screen.getByLabelText("Observation evidence JSON")).toHaveAccessibleDescription(
      "Include the command, acknowledgement, states and telemetry from the recorded execution.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Load example" }));

    expect(screen.getByLabelText("Execution ID")).toHaveValue(
      "example-execution-001",
    );
    expect(screen.getByLabelText("Execution time (UTC)")).toHaveValue(
      "2026-08-26T08:30:00Z",
    );
    expect(screen.getByLabelText("Scenario")).toHaveValue(
      "nominal_to_safe_mode",
    );
    expect(
      JSON.parse(
        (screen.getByLabelText(
          "Observation evidence JSON",
        ) as HTMLTextAreaElement).value,
      ),
    ).toEqual(expectedNominalToSafeObservationExample);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(scrollIntoViewMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Execution ID"), {
      target: { value: "edited-example-execution" },
    });
    expect(screen.getByLabelText("Execution ID")).toHaveValue(
      "edited-example-execution",
    );
  });

  it.each([
    [
      "nominal_to_nominal_rejection",
      "example-execution-002",
      "2026-08-26T08:35:00Z",
      expectedNominalToNominalRejectionObservationExample,
    ],
    [
      "safe_to_nominal_mode",
      "example-execution-003",
      "2026-08-26T08:40:00Z",
      expectedSafeToNominalObservationExample,
    ],
  ])(
    "loads the selected %s verification example",
    (scenario, executionId, executedAt, expectedEvidence) => {
      render(<App />);

      fireEvent.change(screen.getByLabelText("Scenario"), {
        target: { value: scenario },
      });
      fireEvent.click(screen.getByRole("button", { name: "Load example" }));

      expect(screen.getByLabelText("Execution ID")).toHaveValue(executionId);
      expect(screen.getByLabelText("Execution time (UTC)")).toHaveValue(
        executedAt,
      );
      expect(screen.getByLabelText("Scenario")).toHaveValue(scenario);
      expect(
        JSON.parse(
          (screen.getByLabelText(
            "Observation evidence JSON",
          ) as HTMLTextAreaElement).value,
        ),
      ).toEqual(expectedEvidence);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("does not replace observation evidence when only the scenario changes", () => {
    render(<App />);

    const evidence = screen.getByLabelText("Observation evidence JSON");

    fireEvent.change(evidence, {
      target: { value: "edited observation evidence" },
    });
    fireEvent.change(screen.getByLabelText("Scenario"), {
      target: { value: "safe_to_nominal_mode" },
    });

    expect(evidence).toHaveValue("edited observation evidence");
  });

  it("clears a completed verification when loading a new example", async () => {
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

    fireEvent.click(screen.getByRole("button", { name: "Load example" }));
    const confirmation = screen.getByRole("dialog", { name: "Replace current inputs?" });
    fireEvent.click(within(confirmation).getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("region", { name: "Verified execution" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Load example" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Replace current inputs?" })).getByRole("button", { name: "Load example" }));

    expect(
      screen.queryByRole("region", { name: "Verified execution" }),
    ).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);
  });

  it("loads examples for the explicitly selected inspection evidence type", () => {
    render(<App />);
    selectInspectionWorkflow();

    const evidenceInput = screen.getByLabelText("Evidence JSON");

    fireEvent.click(screen.getByRole("button", { name: "Load example" }));
    expect(JSON.parse((evidenceInput as HTMLTextAreaElement).value)).toEqual(
      expectedNominalToSafeObservationExample,
    );

    fireEvent.change(evidenceInput, { target: { value: "user evidence" } });
    fireEvent.click(screen.getByRole("radio", { name: "Verified execution" }));

    expect(evidenceInput).toHaveValue("user evidence");

    fireEvent.click(screen.getByRole("button", { name: "Load example" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Replace current inputs?" })).getByRole("button", { name: "Load example" }));
    expect(JSON.parse((evidenceInput as HTMLTextAreaElement).value)).toEqual(
      expectedVerifiedExecutionInspectionExample,
    );

    fireEvent.click(
      screen.getByRole("radio", { name: "Verified execution sequence" }),
    );

    expect(JSON.parse((evidenceInput as HTMLTextAreaElement).value)).toEqual(
      expectedVerifiedExecutionInspectionExample,
    );

    fireEvent.click(screen.getByRole("button", { name: "Load example" }));
    expect(JSON.parse((evidenceInput as HTMLTextAreaElement).value)).toEqual(
      expectedVerifiedExecutionSequenceInspectionExample,
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(scrollIntoViewMock).not.toHaveBeenCalled();
  });

  it("clears stale inspection feedback when loading an example", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 422 });

    render(<App />);
    selectInspectionWorkflow();
    fireEvent.change(screen.getByLabelText("Evidence JSON"), {
      target: { value: "invalid evidence" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Inspect evidence" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The observation evidence is invalid.",
    );
    await expectFeedbackScroll();

    fireEvent.click(screen.getByRole("button", { name: "Load example" }));
    const confirmation = screen.getByRole("dialog", { name: "Replace current inputs?" });
    fireEvent.click(within(confirmation).getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("alert")).toHaveTextContent("The observation evidence is invalid.");
    expect(screen.getByLabelText("Evidence JSON")).toHaveValue("invalid evidence");
    fireEvent.click(screen.getByRole("button", { name: "Load example" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Replace current inputs?" })).getByRole("button", { name: "Load example" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Evidence JSON")).toHaveValue(
      observationEvidenceDocument,
    );
    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);
  });
});
