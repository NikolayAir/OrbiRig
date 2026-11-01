import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { App } from "./App";
import { VerifiedExecutionSequenceDetails, type SequenceView } from "./EvidenceDetails";
import type { VerifiedExecutionSequencePresentation } from "./apiResponses";
import {
  fetchMock, scrollIntoViewMock, setupAppTests, selectInspectionWorkflow, selectVerificationWorkflow,
  selectVerifiedExecutionSequence,
} from "./test/appTestSupport";

setupAppTests();

function sequenceOf(count: number, failedTelemetry = false): VerifiedExecutionSequencePresentation {
  // Independent, complete rejection records: repeated IDs and timestamps are valid.
  // Each command leaves NOMINAL unchanged, so every continuity check passes.
  return {
    outcome: failedTelemetry ? "FAIL" : "PASS",
    records: Array.from({ length: count }, () => ({
      execution: {
        execution_id: "repeated-id",
        executed_at: "2026-08-17T10:00:00Z",
        scenario_id: "nominal_to_nominal_rejection",
      },
      observation: {
        command: { command_type: "SET_OPERATING_MODE", target_mode: "NOMINAL" },
        pre_state: { operating_mode: "NOMINAL" },
        acknowledgement: { accepted: false },
        post_state: { operating_mode: "NOMINAL" },
        telemetry: { operating_mode: failedTelemetry ? "SAFE" : "NOMINAL" },
      },
      invariant_results: [
        { invariant_id: "pre_state_matches_expected", expected: "NOMINAL", actual: "NOMINAL", passed: true },
        { invariant_id: "acknowledgement_is_rejected", expected: false, actual: false, passed: true },
        { invariant_id: "post_state_matches_pre_state", expected: "NOMINAL", actual: "NOMINAL", passed: true },
        { invariant_id: "telemetry_matches_post_state", expected: "NOMINAL", actual: failedTelemetry ? "SAFE" : "NOMINAL", passed: !failedTelemetry },
      ],
      outcome: failedTelemetry ? "FAIL" : "PASS",
    })),
    continuity_results: Array.from({ length: count - 1 }, () => ({
      previous_execution_id: "repeated-id", next_execution_id: "repeated-id",
      expected_operating_mode: "NOMINAL", observed_operating_mode: "NOMINAL", passed: true,
    })),
  };
}

function SequenceViewer({ sequence }: { sequence: VerifiedExecutionSequencePresentation }) {
  const [view, setView] = useState<SequenceView>({ page: 0, failuresOnly: false });
  return <VerifiedExecutionSequenceDetails sequence={sequence} view={view} onViewChange={setView} />;
}

function result() {
  return screen.getByRole("region", { name: "Verified execution sequence" });
}

function pageControl() {
  return within(screen.getAllByRole("navigation", { name: "Sequence pages" })[0]);
}

describe("sequence inspection pages", () => {
  it.each([false, true])("bounds HTML for 3,900 records, including when every record fails (%s)", failed => {
    const html = renderToStaticMarkup(<SequenceViewer sequence={sequenceOf(3900, failed)} />);
    // The original component produced 452,391 elements. Count all elements,
    // not only visible records: hidden full-result trees must fail too.
    expect((html.match(/<[a-z][^>]*>/g) ?? []).length).toBeLessThan(5000);
    expect((html.match(/class="sequence-member"/g) ?? []).length).toBe(25);
    expect(html).toContain(`Sequence outcome: ${failed ? "FAIL" : "PASS"}`);
    expect(html).toContain(`Failed members: ${failed ? "3,900" : "0"}`);
  });

  it.each([25, 26, 50, 51])("keeps every member and link at page boundaries for %i records", count => {
    render(<SequenceViewer sequence={sequenceOf(count)} />);
    const seenMembers: string[] = [];
    const seenLinks: string[] = [];
    const pageCount = Math.ceil(count / 25);
    for (let page = 0; page < pageCount; page++) {
      const flow = within(result()).getByRole("list", { name: "Sequence member records and continuity checks" });
      const titles = within(flow).getAllByRole("heading", { level: 4 }).map(heading => heading.textContent!);
      const memberTitles = titles.filter(title => title.startsWith("Member "));
      expect(memberTitles).toHaveLength(Math.min(25, count - page * 25));
      expect(memberTitles[0]).toBe(`Member ${page * 25 + 1}`);
      seenMembers.push(...memberTitles);
      seenLinks.push(...titles.filter(title => title.startsWith("Continuity check ")));
      if (pageCount > 1) {
        expect(pageControl().getByRole("button", { name: "Previous page" })).toHaveProperty("disabled", page === 0);
        expect(pageControl().getByRole("button", { name: "Next page" })).toHaveProperty("disabled", page === pageCount - 1);
        if (page < pageCount - 1) {
          // The outgoing link belongs to this page even though its next member is on the next page.
          expect(titles.at(-1)).toBe(`Continuity check ${(page + 1) * 25}`);
          fireEvent.click(pageControl().getByRole("button", { name: "Next page" }));
          expect(screen.getByRole("heading", { name: "Member records and continuity" })).toHaveFocus();
        }
      }
    }
    expect(seenMembers).toEqual(Array.from({ length: count }, (_, index) => `Member ${index + 1}`));
    expect(seenLinks).toEqual(Array.from({ length: count - 1 }, (_, index) => `Continuity check ${index + 1}`));
    if (pageCount === 1) expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("finds off-page member and continuity failures without relinking filtered records", () => {
    const sequence = sequenceOf(3900);
    // A valid accepted transition at member 25 breaks continuity with member 26.
    const member = sequence.records[24];
    member.execution.scenario_id = "nominal_to_safe_mode";
    member.observation.command.target_mode = "SAFE";
    member.observation.acknowledgement.accepted = true;
    member.observation.post_state.operating_mode = "SAFE";
    member.observation.telemetry.operating_mode = "SAFE";
    member.invariant_results[1] = { invariant_id: "acknowledgement_is_accepted", expected: true, actual: true, passed: true };
    member.invariant_results[2] = { invariant_id: "post_state_matches_requested_mode", expected: "SAFE", actual: "SAFE", passed: true };
    member.invariant_results[3] = { invariant_id: "telemetry_matches_post_state", expected: "SAFE", actual: "SAFE", passed: true };
    sequence.continuity_results[24] = { ...sequence.continuity_results[24], expected_operating_mode: "SAFE", passed: false };
    sequence.records[3899] = sequenceOf(2, true).records[0];
    sequence.outcome = "FAIL";
    const original = structuredClone(sequence);
    render(<SequenceViewer sequence={sequence} />);

    expect(result()).toHaveTextContent("Failed members: 1. Failed continuity checks: 1.");
    expect(screen.queryByRole("article", { name: "Member 3900" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Show failures and connected records only" }));
    const flow = within(result()).getByRole("list", { name: "Sequence member records and continuity checks" });
    expect(within(flow).getAllByRole("heading", { level: 4 }).map(h => h.textContent)).toEqual([
      "Member 25", "Continuity check 25", "Member 26", "Continuity check 26", "Member 3900",
    ]);
    expect(within(flow).getByRole("article", { name: "Continuity check 26" })).toHaveTextContent("Members 26 → 27");
    expect(within(within(flow).getByRole("article", { name: "Continuity check 25" })).getByLabelText("Continuity outcome: FAIL")).toBeInTheDocument();
    expect(within(within(flow).getByRole("article", { name: "Member 3900" })).getByLabelText("Verification outcome: FAIL")).toBeInTheDocument();
    expect(within(result()).getByLabelText("Sequence outcome: FAIL")).toBeInTheDocument();
    expect(sequence).toEqual(original);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("article", { name: "Member 1" })).toBeInTheDocument();
  });

  it("keeps continuity-only FAIL evidence distinct from failing member records", () => {
    const sequence = sequenceOf(51);
    // Ending SAFE is correct for this execution, but disagrees with the next pre-state.
    const accepted = sequenceOf(2).records[0];
    accepted.execution.scenario_id = "nominal_to_safe_mode";
    accepted.observation.command.target_mode = "SAFE";
    accepted.observation.acknowledgement.accepted = true;
    accepted.observation.post_state.operating_mode = "SAFE";
    accepted.observation.telemetry.operating_mode = "SAFE";
    accepted.invariant_results[1] = { invariant_id: "acknowledgement_is_accepted", expected: true, actual: true, passed: true };
    accepted.invariant_results[2] = { invariant_id: "post_state_matches_requested_mode", expected: "SAFE", actual: "SAFE", passed: true };
    accepted.invariant_results[3] = { invariant_id: "telemetry_matches_post_state", expected: "SAFE", actual: "SAFE", passed: true };
    sequence.records[49] = accepted;
    sequence.continuity_results[49] = { ...sequence.continuity_results[49], expected_operating_mode: "SAFE", passed: false };
    sequence.outcome = "FAIL";
    render(<SequenceViewer sequence={sequence} />);
    expect(result()).toHaveTextContent("Failed members: 0. Failed continuity checks: 1.");
    fireEvent.click(screen.getByRole("checkbox"));
    expect(within(result()).getAllByLabelText("Verification outcome: PASS")).toHaveLength(2);
    expect(screen.getByRole("article", { name: "Member 50" })).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Member 51" })).toBeInTheDocument();
    expect(within(result()).getByLabelText("Continuity outcome: FAIL")).toBeInTheDocument();
    expect(within(result()).getByLabelText("Sequence outcome: FAIL")).toBeInTheDocument();
  });

  it("bounds the failure view too and supports direct page jumps in both navigators", () => {
    const { container } = render(<SequenceViewer sequence={sequenceOf(3900, true)} />);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(container.querySelectorAll("*").length).toBeLessThan(5000);
    fireEvent.change(pageControl().getByRole("spinbutton", { name: "Page" }), { target: { value: "156" } });
    fireEvent.click(pageControl().getByRole("button", { name: "Go to page" }));
    expect(screen.getByRole("article", { name: "Member 3900" })).toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "Member 1" })).not.toBeInTheDocument();
    const bottom = within(screen.getAllByRole("navigation", { name: "Sequence pages" })[1]);
    expect(bottom.getByRole("spinbutton", { name: "Page" })).toHaveValue(156);
    fireEvent.click(bottom.getByRole("button", { name: "Previous page" }));
    expect(screen.getByRole("article", { name: "Member 3851" })).toBeInTheDocument();
    expect(pageControl().getByRole("spinbutton", { name: "Page" })).toHaveValue(155);
  });

  it("handles an empty failure view without changing the sequence outcome", () => {
    render(<SequenceViewer sequence={sequenceOf(2)} />);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(within(result()).getByText("No failed members or continuity checks.")).toHaveAttribute("aria-live", "polite");
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    expect(within(result()).getByLabelText("Sequence outcome: PASS")).toBeInTheDocument();
  });

  it.each(["0", "4", "1.5", ""])("ignores an invalid page submission (%s)", value => {
    render(<SequenceViewer sequence={sequenceOf(51)} />);
    const input = pageControl().getByRole("spinbutton", { name: "Page" });
    fireEvent.change(input, { target: { value } });
    // Exercise the handler as well as native validation: invalid values must
    // not create an empty result even if form submission is dispatched in code.
    fireEvent.submit(input.closest("form")!);
    expect(screen.getByRole("article", { name: "Member 1" })).toBeInTheDocument();
    expect(within(result()).getAllByRole("article")).toHaveLength(50);
  });

  it("does not scroll after the user moves focus and cancels a pending scroll on unmount", () => {
    let frame: FrameRequestCallback | undefined;
    const cancel = vi.fn();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frame = callback; return 42; });
    vi.stubGlobal("cancelAnimationFrame", cancel);
    const { unmount } = render(<><button type="button">Another control</button><SequenceViewer sequence={sequenceOf(26)} /></>);
    fireEvent.click(pageControl().getByRole("button", { name: "Next page" }));
    expect(screen.getByRole("heading", { name: "Member records and continuity" })).toHaveFocus();
    expect(scrollIntoViewMock).not.toHaveBeenCalled();
    screen.getByRole("button", { name: "Another control" }).focus();
    act(() => frame!(0));
    expect(scrollIntoViewMock).not.toHaveBeenCalled();
    unmount();
    expect(cancel).toHaveBeenCalledWith(42);
  });

  it("resets an unsubmitted page number when filtering changes the page range", () => {
    const sequence = sequenceOf(51);
    const failed = sequenceOf(26, true);
    sequence.records.splice(0, 26, ...failed.records);
    sequence.outcome = "FAIL";
    render(<SequenceViewer sequence={sequence} />);
    fireEvent.change(pageControl().getByRole("spinbutton", { name: "Page" }), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("checkbox"));
    expect(pageControl().getByRole("spinbutton", { name: "Page" })).toHaveValue(1);
    expect(pageControl().getByRole("spinbutton", { name: "Page" })).toHaveAttribute("max", "2");
    expect(screen.getByRole("article", { name: "Member 1" })).toBeInTheDocument();
  });

  it("retains the page across workflow switches and resets it after a new inspection", async () => {
    const sequence = sequenceOf(26);
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => sequence });
    render(<App />);
    selectInspectionWorkflow();
    selectVerifiedExecutionSequence();
    fireEvent.change(screen.getByLabelText("Evidence JSON"), { target: { value: "retained submitted input" } });
    fireEvent.click(screen.getByRole("button", { name: "Inspect evidence" }));
    await screen.findByRole("region", { name: "Verified execution sequence" });
    fireEvent.click(pageControl().getByRole("button", { name: "Next page" }));
    selectVerificationWorkflow();
    selectInspectionWorkflow();
    expect(screen.getByRole("article", { name: "Member 26" })).toBeInTheDocument();
    expect(screen.getByLabelText("Evidence JSON")).toHaveValue("retained submitted input");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Inspect evidence" }));
    await screen.findByRole("article", { name: "Member 1" });
    expect(pageControl().getByRole("spinbutton", { name: "Page" })).toHaveValue(1);
  });
});
