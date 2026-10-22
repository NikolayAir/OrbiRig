import { useEffect, useId, useRef, useState } from "react";

type Props = {
  description: string;
  disabled: boolean;
  requiresConfirmation: boolean;
  onLoad: () => void;
};

export function LoadExampleButton({ description, disabled, requiresConfirmation, onLoad }: Props) {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [confirming, setConfirming] = useState(false);
  const [tooltipDismissed, setTooltipDismissed] = useState(false);

  useEffect(() => {
    if (confirming && dialogRef.current && !dialogRef.current.open) {
      dialogRef.current.showModal();
    }
  }, [confirming]);

  return (
    <div
      className="example-action field-help"
      data-dismissed={tooltipDismissed || confirming}
      onPointerEnter={() => setTooltipDismissed(false)}
      onFocus={() => setTooltipDismissed(false)}
      onKeyDown={(event) => {
        if (event.key === "Escape") setTooltipDismissed(true);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className="secondary-action"
        aria-describedby={`${id}-hint`}
        aria-haspopup={requiresConfirmation ? "dialog" : undefined}
        disabled={disabled}
        onClick={() => {
          setTooltipDismissed(true);
          if (requiresConfirmation) setConfirming(true);
          else onLoad();
        }}
      >
        Load example
      </button>
      <span id={`${id}-hint`} role="tooltip">{description}</span>
      {confirming && (
        <dialog
          ref={dialogRef}
          className="workflow-help-dialog example-confirmation"
          aria-labelledby={`${id}-title`}
          aria-describedby={`${id}-message`}
          onCancel={(event) => {
            event.preventDefault();
            dialogRef.current?.close();
          }}
          onClose={() => {
            setConfirming(false);
            triggerRef.current?.focus({ preventScroll: true });
          }}
        >
          <h2 id={`${id}-title`}>Replace current inputs?</h2>
          <p id={`${id}-message`}>
            Loading the example will replace your current form inputs, including any unsaved changes.
          </p>
          <div className="form-actions confirmation-actions">
            <button type="button" className="secondary-action" autoFocus onClick={() => dialogRef.current?.close()}>
              Cancel
            </button>
            <button type="button" className="primary-action" onClick={() => {
              onLoad();
              dialogRef.current?.close();
            }}>
              Load example
            </button>
          </div>
        </dialog>
      )}
    </div>
  );
}
