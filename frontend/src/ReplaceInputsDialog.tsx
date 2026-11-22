import { useId, useLayoutEffect, useRef } from "react";

type Props = {
  title: string;
  description: string;
  actionLabel: string;
  onConfirm: () => void;
  onClose: () => void;
};

export function ReplaceInputsDialog({ title, description, actionLabel, onConfirm, onClose }: Props) {
  const id = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  function close() {
    dialogRef.current?.close();
    onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      className="workflow-help-dialog replace-inputs-dialog"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-message`}
      onCancel={event => {
        event.preventDefault();
        close();
      }}
    >
      <h2 id={`${id}-title`}>{title}</h2>
      <p id={`${id}-message`}>{description}</p>
      <div className="form-actions confirmation-actions">
        <button type="button" className="secondary-action" autoFocus onClick={close}>
          Cancel
        </button>
        <button type="button" className="primary-action" onClick={() => {
          onConfirm();
          close();
        }}>
          {actionLabel}
        </button>
      </div>
    </dialog>
  );
}
