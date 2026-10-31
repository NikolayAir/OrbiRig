import { Fragment } from "react";

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
          : "The recorded behaviour does not meet this execution's scenario expectations. Review the failed checks below."}
      </p>
      <VerifiedExecutionFields record={record} />
    </section>
  );
}

export function VerifiedExecutionSequenceDetails({
  sequence,
}: {
  sequence: VerifiedExecutionSequencePresentation;
}) {
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
        Records are shown in the supplied order.
      </p>

      <h3 className="sequence-flow-heading">Member records and continuity</h3>
      <ol
        className="sequence-flow"
        aria-label="Sequence member records and continuity checks"
        role="list"
      >
        {sequence.records.map((record, index) => {
          const headingId = `sequence-member-${index}`;
          const continuityResult = sequence.continuity_results[index];

          return (
            <Fragment key={`${record.execution.execution_id}-${index}`}>
              <li>
                <article
                  className="sequence-member"
                  aria-labelledby={headingId}
                >
                  <div className="sequence-member-heading">
                    <h4 id={headingId}>Member {index + 1}</h4>
                    <OutcomeBadge outcome={record.outcome} />
                  </div>
                  <VerifiedExecutionFields record={record} nested />
                </article>
              </li>
              {continuityResult !== undefined && (
                <li>
                  <ContinuityBoundaryDetails
                    result={continuityResult}
                    ordinal={index + 1}
                  />
                </li>
              )}
            </Fragment>
          );
        })}
      </ol>
    </section>
  );
}

function ContinuityBoundaryDetails({
  result,
  ordinal,
}: {
  result: VerifiedExecutionSequencePresentation["continuity_results"][number];
  ordinal: number;
}) {
  const headingId = `continuity-boundary-${ordinal - 1}`;

  return (
    <article
      className="continuity-boundary"
      aria-labelledby={headingId}
      data-outcome={result.passed ? "PASS" : "FAIL"}
    >
      <div className="continuity-boundary-heading">
        <h4 id={headingId}>Continuity check {ordinal}</h4>
        <OutcomeBadge
          outcome={result.passed ? "PASS" : "FAIL"}
          label="Continuity outcome"
        />
      </div>
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
    </article>
  );
}

function formatInvariantValue(value: boolean | string): string {
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return value;
}
