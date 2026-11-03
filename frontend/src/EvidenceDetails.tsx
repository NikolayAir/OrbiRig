import { type Dispatch, type SetStateAction, useId, useLayoutEffect, useMemo, useRef } from "react";

import { SUPPORTED_SCENARIOS } from "./workflowContent";

import type {
  ObservationPresentation,
  PresentationOutcome,
  VerifiedExecutionPresentation,
  VerifiedExecutionSequencePresentation,
} from "./apiResponses";

const INVARIANT_TITLES: Record<string, string> = {
  pre_state_matches_expected: "Pre-state matches expected",
  acknowledgement_is_accepted: "Acknowledgement is accepted",
  acknowledgement_is_rejected: "Acknowledgement is rejected",
  post_state_matches_requested_mode: "Post-state matches requested mode",
  post_state_matches_pre_state: "Post-state matches pre-state",
  telemetry_matches_post_state: "Telemetry matches post-state",
};

function ObservationFields({
  observation,
}: {
  observation: ObservationPresentation;
}) {
  return (
    <dl className="observation-fields">
      <dt>Command type</dt>
      <dd>{observation.command.command_type}</dd>
      <dt>Target mode</dt>
      <dd>{observation.command.target_mode}</dd>
      <dt>Pre-state operating mode</dt>
      <dd>{observation.pre_state.operating_mode}</dd>
      <dt>Acknowledgement</dt>
      <dd>{observation.acknowledgement.accepted ? "Accepted" : "Rejected"}</dd>
      <dt>Post-state operating mode</dt>
      <dd>{observation.post_state.operating_mode}</dd>
      <dt>Telemetry operating mode</dt>
      <dd>{observation.telemetry.operating_mode}</dd>
    </dl>
  );
}

export function ObservationDetails({
  observation,
}: {
  observation: ObservationPresentation;
}) {
  return (
    <section className="observation-details" aria-labelledby="reconstructed-observation">
      <div className="result-heading">
        <div>
          <p className="result-context">Valid observation evidence</p>
          <h2 id="reconstructed-observation" tabIndex={-1}>Observation details</h2>
        </div>
      </div>
      <p className="result-description">
        These are reported values. No scenario verification has been performed.
      </p>
      <ObservationFields observation={observation} />
    </section>
  );
}

function VerifiedExecutionFields({
  record,
  nested = false,
}: {
  record: VerifiedExecutionPresentation;
  nested?: boolean;
}) {
  const Subheading = nested ? "h5" : "h3";
  const InvariantHeading = nested ? "h6" : "h4";

  return (
    <div className="verified-execution-fields">
      <div className="verified-execution-summary">
        <section className="execution-summary">
          <Subheading>Execution summary</Subheading>
          <dl className="execution-summary-fields">
            <dt>Execution ID</dt>
            <dd>{record.execution.execution_id}</dd>
            <dt>Execution time (UTC)</dt>
            <dd>{record.execution.executed_at}</dd>
            <dt>Scenario</dt>
            <dd>{record.execution.scenario_id}</dd>
          </dl>
        </section>

        <section className="result-observation">
          <Subheading>Observation details</Subheading>
          <ObservationFields observation={record.observation} />
        </section>
      </div>

      <Subheading className="invariant-results-heading">
        Verification checks
      </Subheading>
      <div className="invariant-results-wrapper">
        <ol className="invariant-results">
          {record.invariant_results.map((result, index) => (
            <li
              key={`${result.invariant_id}-${index}`}
              data-outcome={result.passed ? "PASS" : "FAIL"}
            >
              <div className="invariant-summary">
                <InvariantHeading className="invariant-title">
                  {Object.hasOwn(INVARIANT_TITLES, result.invariant_id)
                    ? INVARIANT_TITLES[result.invariant_id]
                    : "Verification check"}
                </InvariantHeading>
                <p className="invariant-id">
                  <code>{result.invariant_id}</code>
                </p>
              </div>
              <dl className="invariant-values">
                <div>
                  <dt>Expected</dt>
                  <dd>{formatInvariantValue(result.expected)}</dd>
                </div>
                <div>
                  <dt>Actual</dt>
                  <dd>{formatInvariantValue(result.actual)}</dd>
                </div>
                <div>
                  <dt>Result</dt>
                  <dd>
                    <OutcomeBadge
                      outcome={result.passed ? "PASS" : "FAIL"}
                      label="Verification check"
                    />
                  </dd>
                </div>
              </dl>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function OutcomeBadge({
  outcome,
  label = "Verification outcome",
}: {
  outcome: PresentationOutcome;
  label?: string;
}) {
  return (
    <span
      className="outcome-badge"
      data-outcome={outcome}
      aria-label={`${label}: ${outcome}`}
    >
      {outcome}
    </span>
  );
}

export function VerifiedExecutionDetails({
  record,
  headingId = "verified-execution",
  inspected = false,
}: {
  record: VerifiedExecutionPresentation;
  headingId?: string;
  inspected?: boolean;
}) {
  return (
    <section aria-labelledby={headingId}>
      <div className="result-heading">
        <div>
          <p className="result-context">
            {inspected ? "Valid saved evidence" : "Verification result"}
          </p>
          <h2 id={headingId} tabIndex={-1}>Verified execution</h2>
        </div>
        <OutcomeBadge outcome={record.outcome} />
      </div>
      <p className="result-description">
        {record.outcome === "PASS"
          ? "The recorded behaviour matches this execution's scenario."
          : "The recorded behaviour does not meet the scenario's expectations. Review the failed checks below."}
      </p>
      <VerifiedExecutionFields record={record} />
    </section>
  );
}

export type SequenceView = {
  page: number;
  failuresOnly: boolean;
  expandedMembers: number[];
  expandedContinuity: number[];
};

export function VerifiedExecutionSequenceDetails({
  sequence, view, onViewChange,
}: {
  sequence: VerifiedExecutionSequencePresentation;
  view: SequenceView;
  onViewChange: Dispatch<SetStateAction<SequenceView>>;
}) {
  const pageHeading = useRef<HTMLHeadingElement>(null);
  const focusRequested = useRef(false);

  const summary = useMemo(() => {
    const allMembers = sequence.records.map((_, index) => index);
    return {
      allMembers,
      failedMembers: sequence.records.filter(record => record.outcome === "FAIL").length,
      failedContinuity: sequence.continuity_results.filter(result => !result.passed).length,
      // Include both endpoints of a failed link, using positions rather than IDs.
      // IDs can repeat, and filtering must never create new continuity links.
      relevantMembers: allMembers.filter(index =>
        sequence.records[index].outcome === "FAIL" ||
        sequence.continuity_results[index]?.passed === false ||
        sequence.continuity_results[index - 1]?.passed === false),
    };
  }, [sequence]);
  const members = view.failuresOnly ? summary.relevantMembers : summary.allMembers;
  const pageCount = Math.max(1, Math.ceil(members.length / SEQUENCE_PAGE_SIZE));
  const page = Math.min(view.page, pageCount - 1);
  const start = page * SEQUENCE_PAGE_SIZE;
  const visibleMembers = members.slice(start, start + SEQUENCE_PAGE_SIZE);

  useLayoutEffect(() => {
    if (!focusRequested.current) return;
    focusRequested.current = false;
    const heading = pageHeading.current;
    heading?.focus({ preventScroll: true });
    // Let the browser finish the submit event and lay out the replacement page.
    // Scrolling sooner can leave the focused heading above the viewport.
    const frame = requestAnimationFrame(() => {
      if (document.activeElement === heading && document.hasFocus()) {
        heading?.scrollIntoView({ block: "start", behavior: "instant" });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [view]);

  function changePage(nextPage: number) {
    focusRequested.current = true;
    onViewChange(current => ({ ...current, page: nextPage, expandedMembers: [], expandedContinuity: [] }));
  }

  function toggleDetails(kind: "expandedMembers" | "expandedContinuity", index: number) {
    // Use positions in the original sequence: IDs may repeat, and filtering
    // changes which records are visible without changing their identities.
    onViewChange(current => ({
      ...current,
      [kind]: current[kind].includes(index)
        ? current[kind].filter(position => position !== index)
        : [...current[kind], index],
    }));
  }

  return (
    <section aria-labelledby="verified-execution-sequence">
      <div className="result-heading">
        <div>
          <p className="result-context">Valid saved evidence</p>
          <h2 id="verified-execution-sequence" tabIndex={-1}>Verified execution sequence</h2>
        </div>
        <OutcomeBadge outcome={sequence.outcome} label="Sequence outcome" />
      </div>
      <p className="result-description">
        {sequence.outcome === "PASS"
          ? "All execution and continuity checks passed."
          : "1 or more execution or continuity checks did not pass."}{" "}
        Records stay in their original order.
      </p>

      <h3 className="sequence-flow-heading" tabIndex={-1} ref={pageHeading}>
        Member records and continuity
      </h3>
      <p>
        Sequence totals: {sequence.records.length.toLocaleString("en-GB")} members. Failed members:{" "}
        {summary.failedMembers.toLocaleString("en-GB")}. Failed continuity checks:{" "}
        {summary.failedContinuity.toLocaleString("en-GB")}.
      </p>
      <label className="sequence-failure-filter">
        <input
          type="checkbox"
          checked={view.failuresOnly}
          onChange={event => {
            // Filtering updates the list without taking focus from the checkbox.
            focusRequested.current = false;
            onViewChange({ page: 0, failuresOnly: event.currentTarget.checked, expandedMembers: [], expandedContinuity: [] });
          }}
        />
        Show failures and related records
      </label>
      <p className="sequence-page-description">
        The filter includes members marked FAIL and both members of each continuity check marked FAIL.
        Original numbers and links are kept.
      </p>
      <p aria-live="polite" aria-atomic="true" className="sequence-page-status">
        {members.length === 0
          ? "No failed members or continuity checks."
          : `Showing ${view.failuresOnly ? "matching members" : "members"} ${start + 1}–${start + visibleMembers.length} of ${members.length.toLocaleString("en-GB")}.`}
      </p>
      {pageCount > 1 && <SequencePagination page={page} pageCount={pageCount} onChange={changePage} />}
      <ol
        className="sequence-flow"
        aria-label="Sequence member records and continuity checks"
        role="list"
      >
        {visibleMembers.map(index => {
          const record = sequence.records[index];
          const headingId = `sequence-member-${index}`;
          const continuityResult = sequence.continuity_results[index];
          const expanded = view.expandedMembers.includes(index);
          const detailsId = `sequence-member-details-${index}`;
          const scenarioLabel = SUPPORTED_SCENARIOS.find(
            scenario => scenario.value === record.execution.scenario_id,
          )?.label ?? record.execution.scenario_id;

          return (
            <li key={index}>
              <article
                className={`sequence-member${continuityResult ? " sequence-member-with-continuity" : ""}`}
                aria-labelledby={headingId}
                data-outcome={record.outcome}
              >
                <div className="sequence-member-heading">
                  <h4 id={headingId}>Member {index + 1}</h4>
                  <div className="sequence-summary-actions">
                    <OutcomeBadge outcome={record.outcome} />
                    <button type="button" className="secondary-action sequence-details-toggle"
                      aria-expanded={expanded} aria-controls={detailsId}
                      aria-label={`${expanded ? "Hide" : "Show"} details for member ${index + 1}`}
                      onClick={() => toggleDetails("expandedMembers", index)}>
                      {expanded ? "Hide" : "Show"} details
                    </button>
                  </div>
                </div>
                {!expanded && (
                  <dl className="sequence-member-identity">
                    <div><dt>Execution ID</dt><dd>{record.execution.execution_id}</dd></div>
                    <div><dt>Scenario</dt><dd>{scenarioLabel}</dd></div>
                  </dl>
                )}
                {/* Keep the container so aria-controls still identifies it while closed.
                    Create full details only when open, rather than hiding a large detail tree. */}
                <div id={detailsId} hidden={!expanded} className="sequence-member-details">
                  {expanded && <VerifiedExecutionFields record={record} nested />}
                </div>
              </article>
              {continuityResult !== undefined && (
                <ContinuityBoundaryDetails
                  result={continuityResult}
                  ordinal={index + 1}
                  expanded={view.expandedContinuity.includes(index)}
                  onToggle={() => toggleDetails("expandedContinuity", index)}
                />
              )}
            </li>
          );
        })}
      </ol>
      {pageCount > 1 && <SequencePagination page={page} pageCount={pageCount} onChange={changePage} />}
    </section>
  );
}

const SEQUENCE_PAGE_SIZE = 25;

function SequencePagination({ page, pageCount, onChange }: {
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
}) {
  const pageId = useId();
  return (
    <nav className="sequence-pagination" aria-label="Sequence pages">
      <button type="button" className="secondary-action" disabled={page === 0} onClick={() => onChange(page - 1)}>
        Previous page
      </button>
      <form key={`${page}-${pageCount}`} onSubmit={event => {
        event.preventDefault();
        const nextPage = Number(new FormData(event.currentTarget).get("page")) - 1;
        if (Number.isInteger(nextPage) && nextPage >= 0 && nextPage < pageCount) onChange(nextPage);
      }}>
        <label htmlFor={pageId}>Page</label>
        <input id={pageId} name="page" type="number" min={1} max={pageCount} required defaultValue={page + 1} />
        <span>of {pageCount}</span>
        <button type="submit" className="secondary-action">Go to page</button>
      </form>
      <button type="button" className="secondary-action" disabled={page === pageCount - 1} onClick={() => onChange(page + 1)}>
        Next page
      </button>
    </nav>
  );
}

function ContinuityBoundaryDetails({
  result,
  ordinal,
  expanded,
  onToggle,
}: {
  result: VerifiedExecutionSequencePresentation["continuity_results"][number];
  ordinal: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const headingId = `continuity-boundary-${ordinal - 1}`;
  const detailsId = `continuity-details-${ordinal - 1}`;

  return (
    <article
      className="continuity-boundary"
      aria-labelledby={headingId}
      data-outcome={result.passed ? "PASS" : "FAIL"}
    >
      <div className="continuity-boundary-heading">
        <div>
          <h4 id={headingId}>Continuity check {ordinal}</h4>
          <p>Members {ordinal} → {ordinal + 1}</p>
        </div>
        <div className="sequence-summary-actions">
          <OutcomeBadge outcome={result.passed ? "PASS" : "FAIL"} label="Continuity outcome" />
          <button type="button" className="secondary-action sequence-details-toggle"
            aria-expanded={expanded} aria-controls={detailsId}
            aria-label={`${expanded ? "Hide" : "Show"} details for continuity check ${ordinal}, members ${ordinal} to ${ordinal + 1}`}
            onClick={onToggle}>
            {expanded ? "Hide" : "Show"} details
          </button>
        </div>
      </div>
      <div id={detailsId} hidden={!expanded}>
        {expanded && (
          <dl className="continuity-boundary-fields">
            <div>
              <dt>Connected executions</dt>
              <dd>
                <span className="visually-hidden">Previous execution ID: </span>
                {result.previous_execution_id}
                <span aria-hidden="true"> → </span>
                <span className="visually-hidden">Next execution ID: </span>
                {result.next_execution_id}
              </dd>
            </div>
            <div>
              <dt>Expected operating mode</dt>
              <dd>{result.expected_operating_mode}</dd>
            </div>
            <div>
              <dt>Observed operating mode</dt>
              <dd>{result.observed_operating_mode}</dd>
            </div>
          </dl>
        )}
      </div>
    </article>
  );
}

function formatInvariantValue(value: boolean | string): string {
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return value;
}
