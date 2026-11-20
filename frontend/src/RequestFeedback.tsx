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
      The HTTP request body (the data sent for checking) has a 4 MiB limit.
      Use a smaller evidence document and try again.
    </RequestError>
  );
}
