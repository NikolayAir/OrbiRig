import { useEffect, useRef, useState } from "react";

type Props = {
  headingId: string;
  helpId: string;
  title: string;
  description: string;
  onHelpOpen?: () => void;
};

export function WorkflowTitle({ headingId, helpId, title, description, onHelpOpen }: Props) {
  const helpRef = useRef<HTMLSpanElement>(null);
  const pointerClickPending = useRef(false);
  const [open, setOpen] = useState(false);
  // Keep revealed help in place until dismissal so the form does not move on pointer leave.
  const [dismissed, setDismissed] = useState(true);
  const [above, setAbove] = useState(false);

  useEffect(() => {
    function trackPointer(event: PointerEvent) {
      pointerClickPending.current = event.type === "pointerdown";
    }

    function dismissOutside(event: MouseEvent) {
      pointerClickPending.current = false;
      if (!dismissed && event.target instanceof Node && !helpRef.current?.contains(event.target)) {
        setOpen(false);
        setDismissed(true);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      pointerClickPending.current = false;
      if (event.key === "Escape") {
        setOpen(false);
        setDismissed(true);
      }
    }

    // Let the outside control receive its click before the help row collapses.
    document.addEventListener("pointerdown", trackPointer, true);
    document.addEventListener("pointercancel", trackPointer, true);
    document.addEventListener("click", dismissOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", trackPointer, true);
      document.removeEventListener("pointercancel", trackPointer, true);
      document.removeEventListener("click", dismissOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [dismissed]);

  function revealHelp() {
    const heading = helpRef.current?.parentElement?.querySelector("h2");
    const button = helpRef.current?.querySelector("button");
    const tooltip = helpRef.current?.querySelector<HTMLElement>('[role="tooltip"]');
    if (heading && button && tooltip) {
      // Measure the title row, excluding the space occupied by open help below it.
      const headingBounds = heading.getBoundingClientRect();
      const buttonBounds = button.getBoundingClientRect();
      const top = Math.min(headingBounds.top, buttonBounds.top);
      const bottom = Math.max(headingBounds.bottom, buttonBounds.bottom);
      // Match the tooltip's 0.4rem gap in styles.css when choosing above or below.
      const gap = 0.4 * (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16);
      const requiredSpace = tooltip.getBoundingClientRect().height + gap;
      setAbove(bottom + requiredSpace > window.innerHeight && top >= requiredSpace);
    }
    setDismissed(false);
  }

  return (
    <div className="workflow-title">
      <h2 id={headingId}>{title}</h2>
      <span
        ref={helpRef}
        className="field-help"
        data-open={open}
        data-dismissed={dismissed}
        data-above={above}
        onPointerEnter={revealHelp}
        onFocus={revealHelp}
        onBlur={() => {
          // Pointer focus moves before click; keep its target in place until then.
          if (pointerClickPending.current) return;
          setOpen(false);
          setDismissed(true);
        }}
      >
        <button
          type="button"
          className="field-help-button"
          aria-label={`About ${title}`}
          aria-controls={helpId}
          aria-describedby={helpId}
          onClick={() => {
            revealHelp();
            if (!open) onHelpOpen?.();
            setDismissed(open);
            setOpen(!open);
          }}
        >
          <span aria-hidden="true">i</span>
        </button>
        <span id={helpId} role="tooltip">{description}</span>
      </span>
    </div>
  );
}
