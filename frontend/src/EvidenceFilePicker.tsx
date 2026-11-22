import { type ReactNode, useId, useLayoutEffect, useRef, useState } from "react";
import { ReplaceInputsDialog } from "./ReplaceInputsDialog";
import { restoreButtonFocus } from "./formHelpers";

// Bound the local read by the same byte limit as the HTTP request.
const MAX_EVIDENCE_FILE_BYTES = 4 * 1024 * 1024;
const FILE_READ_ERROR = "The file could not be read. Choose another JSON file.";

type FileOpenState =
  | { kind: "idle" | "reading" | "opened" }
  | { kind: "error"; message: string }
  | { kind: "confirm"; text: string };

export function useEvidenceFilePicker(requiresConfirmation: (text: string) => boolean, onOpen: (text: string) => void) {
  const readerRef = useRef<FileReader | null>(null);
  const [state, setState] = useState<FileOpenState>({ kind: "idle" });

  useLayoutEffect(() => () => {
    const reader = readerRef.current;
    readerRef.current = null;
    reader?.abort();
  }, []);

  function applyFile(text: string) {
    onOpen(text);
    setState({ kind: "opened" });
  }

  function readFile(file: File) {
    if (readerRef.current) return;
    if (file.size > MAX_EVIDENCE_FILE_BYTES) {
      setState({ kind: "error", message: "The JSON file exceeds 4 MiB. Choose a smaller evidence document." });
      return;
    }

    const reader = new FileReader();
    readerRef.current = reader;
    setState({ kind: "reading" });

    function reportReadError(message: string) {
      if (readerRef.current !== reader) return;
      readerRef.current = null;
      setState({ kind: "error", message });
    }

    reader.onerror = () => reportReadError(FILE_READ_ERROR);
    reader.onload = () => {
      // Switching workflows unmounts the panel and abandons this read.
      if (readerRef.current !== reader) return;
      const bytes = reader.result;
      if (bytes === null || typeof bytes === "string") {
        reportReadError(FILE_READ_ERROR);
        return;
      }

      let text: string;
      try {
        // Preserve the source text, including a BOM, for Python's JSON reader.
        text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
      } catch {
        reportReadError("The file is not valid UTF-8. Save it as UTF-8 and try again.");
        return;
      }
      if (!text.trim()) {
        reportReadError("The file contains no JSON text. Choose an evidence document.");
        return;
      }

      readerRef.current = null;
      if (requiresConfirmation(text)) {
        setState({ kind: "confirm", text });
      } else {
        applyFile(text);
      }
    };

    try {
      reader.readAsArrayBuffer(file);
    } catch {
      reportReadError(FILE_READ_ERROR);
    }
  }

  function clearFeedback() {
    if (readerRef.current) return false;
    setState({ kind: "idle" });
    return true;
  }

  function closeConfirmation() {
    setState(current => current.kind === "confirm" ? { kind: "idle" } : current);
  }

  return { state, readFile, applyFile, clearFeedback, closeConfirmation };
}

type Props = {
  picker: ReturnType<typeof useEvidenceFilePicker>;
  fieldLabel: string;
  submitLabel: string;
  disabled: boolean;
  children: ReactNode;
};

export function EvidenceFilePicker({ picker, fieldLabel, submitLabel, disabled, children }: Props) {
  const { state } = picker;
  const errorId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const openFileButtonRef = useRef<HTMLButtonElement>(null);
  const reading = state.kind === "reading";
  const actionLabel = reading ? "Opening file…" : "Open JSON file";

  return (
    <>
      <div className="evidence-editor-heading">
        {children}
        <button
          type="button"
          className="secondary-action"
          ref={openFileButtonRef}
          disabled={disabled}
          aria-label={actionLabel}
          aria-disabled={reading || undefined}
          aria-describedby={state.kind === "error" ? errorId : undefined}
          onClick={event => {
            if (reading) return;
            event.currentTarget.focus({ preventScroll: true });
            fileInputRef.current?.click();
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
            <path d="M3 18V6a2 2 0 0 1 2-2h4l3 3h6a2 2 0 0 1 2 2v2" />
            <path d="m3 18 3-7h15a1 1 0 0 1 .94 1.35l-2.3 6.35A2 2 0 0 1 17.76 20H5a2 2 0 0 1-2-2Z" />
          </svg>
          <span className="evidence-file-action-label">{actionLabel}</span>
        </button>
        <input
          type="file"
          aria-label="Evidence file"
          accept=".json,application/json"
          ref={fileInputRef}
          onChange={event => {
            const input = event.currentTarget;
            const file = input.files?.[0];
            // Choosing the same file again must dispatch a new change event.
            input.value = "";
            if (file && !disabled) picker.readFile(file);
          }}
          disabled={disabled || reading}
          hidden
        />
      </div>
      <p
        aria-live="polite"
        aria-atomic="true"
        className={state.kind === "opened" ? "field-hint" : "visually-hidden"}
      >
        {state.kind === "opened" ? `File opened in ${fieldLabel}. Choose ${submitLabel} when ready.` : ""}
      </p>
      {state.kind === "error" && (
        <p id={errorId} className="field-error" role="alert">{state.message}</p>
      )}
      {state.kind === "confirm" && (
        <ReplaceInputsDialog
          title={`Replace ${fieldLabel}?`}
          description={`Opening this file will replace your edited ${fieldLabel}.`}
          actionLabel={`Replace ${fieldLabel}`}
          onConfirm={() => picker.applyFile(state.text)}
          onClose={() => {
            picker.closeConfirmation();
            restoreButtonFocus(openFileButtonRef.current);
          }}
        />
      )}
    </>
  );
}
