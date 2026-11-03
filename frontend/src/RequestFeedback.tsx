import type { ReactNode } from "react";

export function RequestError({ title, guidance, children }: { title: string; guidance?: string; children: ReactNode }) {
  return (
    <p role="alert" tabIndex={-1}>
      <strong className="feedback-label">{title}</strong>
      <span>{children}</span>
      {guidance && <small className="feedback-guidance">{guidance}</small>}
    </p>
  );
}

export function EvidenceRequestSizeError() {
  return (
    <RequestError title="Request too large">
      The complete HTTP request body is limited to 4 MiB. Reduce the submitted data
      before trying again.
    </RequestError>
  );
}
