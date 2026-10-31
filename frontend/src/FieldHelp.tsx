import type { ReactNode } from "react";
import type { FieldHelpControl } from "./useVerificationFieldHelp";

export function FieldHelp({ control, label, helpId, children }: {
  control: FieldHelpControl;
  label: string;
  helpId: string;
  children: ReactNode;
}) {
  return (
    <span
      ref={control.containerRef}
      className="field-help"
      data-open={control.open}
      data-dismissed={control.dismissed}
      onPointerEnter={control.reveal}
      onFocus={control.reveal}
    >
      <button
        type="button"
        className="field-help-button"
        aria-label={`About ${label}`}
        aria-controls={helpId}
        aria-describedby={helpId}
        onClick={control.toggle}
      >
        ?
      </button>
      <span id={helpId} role="tooltip">{children}</span>
    </span>
  );
}
