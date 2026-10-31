import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

type HelpField = "executionId" | "scenario";

export type FieldHelpControl = {
  containerRef: RefObject<HTMLSpanElement | null>;
  open: boolean;
  dismissed: boolean;
  reveal: () => void;
  toggle: () => void;
};

export function useVerificationFieldHelp() {
  const executionIdRef = useRef<HTMLSpanElement>(null);
  const scenarioRef = useRef<HTMLSpanElement>(null);
  const [openField, setOpenField] = useState<HelpField | null>(null);
  const [dismissed, setDismissed] = useState({ executionId: false, scenario: false });

  useEffect(() => {
    function dismissOutside(event: PointerEvent) {
      if (!(event.target instanceof Node) || openField === null) return;
      const container = (openField === "executionId" ? executionIdRef : scenarioRef).current;
      if (container?.contains(event.target)) return;
      setOpenField(null);
      if (document.activeElement instanceof HTMLElement && container?.contains(document.activeElement)) {
        document.activeElement.blur();
      }
    }
    function dismissOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpenField(null);
      // Escape must override CSS hover/focus until the user reopens the help.
      setDismissed({ executionId: true, scenario: true });
    }
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("keydown", dismissOnEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("keydown", dismissOnEscape);
    };
  }, [openField]);

  function control(field: HelpField): FieldHelpControl {
    return {
      containerRef: field === "executionId" ? executionIdRef : scenarioRef,
      open: openField === field,
      dismissed: dismissed[field],
      reveal: () => setDismissed(current => current[field] ? { ...current, [field]: false } : current),
      toggle: () => {
        const closing = openField === field;
        setOpenField(closing ? null : field);
        setDismissed(current => ({ ...current, [field]: closing }));
      },
    };
  }
  return { executionId: control("executionId"), scenario: control("scenario"), closePinned: () => setOpenField(null) };
}
