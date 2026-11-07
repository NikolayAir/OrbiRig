import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

type HelpField = "executionId" | "scenario" | "observationEvidence" | "inspectionEvidence";
type HelpPointer = Pick<PointerEvent, "clientX" | "clientY">;
const allDismissed = { executionId: true, scenario: true, observationEvidence: true, inspectionEvidence: true };

function containsPoint(bounds: Pick<DOMRect, "left" | "right" | "top" | "bottom">, point: HelpPointer) {
  return point.clientX >= bounds.left && point.clientX <= bounds.right &&
    point.clientY >= bounds.top && point.clientY <= bounds.bottom;
}

export type FieldHelpControl = {
  containerRef: RefObject<HTMLSpanElement | null>;
  open: boolean;
  dismissed: boolean;
  reveal: (pointer?: HelpPointer) => void;
  toggle: () => void;
};

export function useVerificationFieldHelp() {
  const executionIdRef = useRef<HTMLSpanElement>(null);
  const scenarioRef = useRef<HTMLSpanElement>(null);
  const observationEvidenceRef = useRef<HTMLSpanElement>(null);
  const inspectionEvidenceRef = useRef<HTMLSpanElement>(null);
  const [openField, setOpenField] = useState<HelpField | null>(null);
  const [dismissed, setDismissed] = useState(allDismissed);
  const refs = { executionId: executionIdRef, scenario: scenarioRef, observationEvidence: observationEvidenceRef, inspectionEvidence: inspectionEvidenceRef };
  const fields = Object.keys(refs) as HelpField[];

  useEffect(() => {
    function dismissOutside(event: PointerEvent) {
      if (!(event.target instanceof Node) || fields.some(field => refs[field].current?.contains(event.target as Node))) return;
      const container = openField === null ? null : refs[openField].current;
      setOpenField(null);
      setDismissed(allDismissed);
      if (document.activeElement instanceof HTMLElement && container?.contains(document.activeElement)) {
        document.activeElement.blur();
      }
    }
    function dismissOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpenField(null);
      setDismissed(allDismissed);
    }
    function dismissAfterPointerLeave(event: PointerEvent) {
      if (event.pointerType === "touch") return;
      for (const field of fields) {
        const container = refs[field].current;
        if (!container || container.dataset.dismissed === "true" || openField === field || container.contains(document.activeElement)) continue;
        const button = container.querySelector("button")!.getBoundingClientRect();
        const description = container.querySelector('[role="tooltip"]')!.getBoundingClientRect();
        // Keep transparent help readable over the text and the gap from its button.
        const gap = { left: Math.min(button.left, description.left), right: Math.max(button.right, description.right), top: button.bottom, bottom: description.top };
        if (!containsPoint(button, event) && !containsPoint(description, event) && !containsPoint(gap, event)) {
          setDismissed(current => current[field] ? current : { ...current, [field]: true });
        }
      }
    }
    function dismissAfterBlur(event: FocusEvent) {
      for (const field of fields) {
        const container = refs[field].current;
        if (openField === field || !container?.contains(event.target as Node) || container.matches(":hover")) continue;
        if (!(event.relatedTarget instanceof Node) || !container.contains(event.relatedTarget)) {
          setDismissed(current => current[field] ? current : { ...current, [field]: true });
        }
      }
    }
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("pointermove", dismissAfterPointerLeave);
    document.addEventListener("focusout", dismissAfterBlur);
    document.addEventListener("keydown", dismissOnEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("pointermove", dismissAfterPointerLeave);
      document.removeEventListener("focusout", dismissAfterBlur);
      document.removeEventListener("keydown", dismissOnEscape);
    };
  }, [openField]);

  function control(field: HelpField): FieldHelpControl {
    return {
      containerRef: refs[field],
      open: openField === field,
      dismissed: dismissed[field],
      reveal: pointer => {
        // Reading transparent help must not open another help button underneath it.
        if (pointer && fields.some(other => {
          const container = refs[other].current;
          return other !== field && container?.dataset.dismissed === "false" &&
            containsPoint(container.querySelector('[role="tooltip"]')!.getBoundingClientRect(), pointer);
        })) return;
        setOpenField(current => current === field ? current : null);
        setDismissed({ ...allDismissed, [field]: false });
      },
      toggle: () => {
        const closing = openField === field;
        setOpenField(closing ? null : field);
        setDismissed({ ...allDismissed, [field]: closing });
      },
    };
  }
  return { executionId: control("executionId"), scenario: control("scenario"), observationEvidence: control("observationEvidence"), inspectionEvidence: control("inspectionEvidence"), closePinned: () => { setOpenField(null); setDismissed(allDismissed); } };
}
