import type { EvidenceType } from "./workflowTypes";

// A Blob encodes the original JSON text as UTF-8 without a byte-order mark.
// The evidence type supplies a fixed filename even when execution IDs contain
// characters that file systems do not accept.
export function downloadEvidence(evidenceJson: string, evidenceType: EvidenceType) {
  const url = URL.createObjectURL(new Blob([evidenceJson], { type: "application/json" }));
  // A link that is never added to the page still starts the download when clicked.
  // The download attribute saves the file instead of opening it in the tab.
  const link = document.createElement("a");
  link.href = url;
  link.download = `orbirig-${evidenceType}.json`;
  link.click();
  // Give the browser time to start reading before revoking the URL.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
