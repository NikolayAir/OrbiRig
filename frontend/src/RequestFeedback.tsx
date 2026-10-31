import type { ReactNode } from "react";

export function RequestError({ title, children }: { title: string; children: ReactNode }) {
  return (
    <p role="alert" tabIndex={-1}>
      <strong className="feedback-label">{title}</strong>
      <span>{children}</span>
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
