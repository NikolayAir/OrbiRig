export const VERIFIED_EXECUTION_FILE_NAME = "orbirig-verified-execution.json";

// Save Python's evidence text exactly as received. A Blob encodes a string as
// UTF-8 without a byte-order mark. The fixed name avoids execution IDs, which
// can contain characters that file systems do not accept.
export function downloadVerifiedExecutionEvidence(evidenceJson: string) {
  const url = URL.createObjectURL(new Blob([evidenceJson], { type: "application/json" }));
  // A link that is never added to the page still starts the download when clicked.
  // The download attribute saves the file instead of opening it in the tab.
  const link = document.createElement("a");
  link.href = url;
  link.download = VERIFIED_EXECUTION_FILE_NAME;
  link.click();
  // Give the browser time to start reading before revoking the URL.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
