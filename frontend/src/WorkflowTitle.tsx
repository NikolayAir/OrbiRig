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
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [above, setAbove] = useState(false);

  useEffect(() => {
    function dismissOutside(event: PointerEvent) {
      if (open && event.target instanceof Node && !helpRef.current?.contains(event.target)) {
        setOpen(false);
        setDismissed(true);
      }
    }

    function dismissOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        setDismissed(true);
      }
    }

    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("keydown", dismissOnEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("keydown", dismissOnEscape);
    };
  }, [open]);

  function revealHelp() {
    const heading = helpRef.current?.parentElement;
    const tooltip = helpRef.current?.querySelector<HTMLElement>('[role="tooltip"]');
    if (heading && tooltip) {
      const bounds = heading.getBoundingClientRect();
      const gap = 0.4 * (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16);
      const requiredSpace = tooltip.getBoundingClientRect().height + gap;
      setAbove(bounds.bottom + requiredSpace > window.innerHeight && bounds.top >= requiredSpace);
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
