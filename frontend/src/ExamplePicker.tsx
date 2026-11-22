import { useId, useLayoutEffect, useRef, useState } from "react";
import { ReplaceInputsDialog } from "./ReplaceInputsDialog";

export type ExampleOption<Variant extends string> = {
  variant: Variant;
  label: string;
  description: string;
  tone?: "negative";
};

type Props<Variant extends string> = {
  options: readonly ExampleOption<Variant>[];
  disabled: boolean;
  requiresConfirmation: (variant: Variant) => boolean;
  onLoad: (variant: Variant) => void;
};

export function ExamplePicker<Variant extends string>({
  options, disabled, requiresConfirmation, onLoad,
}: Props<Variant>) {
  const id = useId();
  const pickerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<ExampleOption<Variant> | null>(null);

  function restoreTriggerFocus() {
    const trigger = triggerRef.current;
    if (!trigger) return;
    trigger.focus({ preventScroll: true });
    const { top, bottom } = trigger.getBoundingClientRect();
    if (top < 0 || bottom > window.innerHeight) {
      trigger.scrollIntoView({ block: "nearest" });
    }
  }

  useLayoutEffect(() => {
    const trigger = triggerRef.current;
    const list = listRef.current;
    if (!open || !trigger || !list) return;

    const position = () => {
      const { top, bottom } = trigger.getBoundingClientRect();
      const below = window.innerHeight - bottom;
      // CSS leaves half a rem by the trigger and half at the viewport edge.
      const clearance = parseFloat(getComputedStyle(document.documentElement).fontSize);
      const above = below < list.scrollHeight + clearance && top > below;
      list.dataset.side = above ? "above" : "below";
      list.style.setProperty("--example-available-height", `${above ? top : below}px`);
    };

    function dismissFromOutside(event: PointerEvent) {
      if (event.target instanceof Node && !pickerRef.current?.contains(event.target)) setOpen(false);
    }
    function dismissWithEscape(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      setOpen(false);
      restoreTriggerFocus();
    }

    position();
    // Enlarging text can resize the trigger without resizing the window.
    const observer = new ResizeObserver(position);
    observer.observe(trigger);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position);
    document.addEventListener("pointerdown", dismissFromOutside);
    document.addEventListener("keydown", dismissWithEscape);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position);
      document.removeEventListener("pointerdown", dismissFromOutside);
      document.removeEventListener("keydown", dismissWithEscape);
    };
  }, [open]);

  function choose(option: ExampleOption<Variant>) {
    setOpen(false);
    if (requiresConfirmation(option.variant)) {
      setPending(option);
      return;
    }
    onLoad(option.variant);
    restoreTriggerFocus();
  }

  function closeConfirmation() {
    setPending(null);
    restoreTriggerFocus();
  }

  return (
    <div
      className="example-picker"
      ref={pickerRef}
      onBlur={event => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className="secondary-action example-picker-trigger"
        aria-expanded={open}
        aria-controls={`${id}-options`}
        disabled={disabled}
        onClick={(event) => {
          event.currentTarget.focus({ preventScroll: true });
          setOpen(value => !value);
        }}
      >
        <span>Load example</span>
        <span className="example-chevron" aria-hidden="true" />
      </button>
      {/* Firefox can give the scroll container a tab stop before its buttons. */}
      <div id={`${id}-options`} className="example-options" hidden={!open} ref={listRef} tabIndex={-1}>
        {options.map(option => {
          const descriptionId = `${id}-${option.variant}-description`;
          return (
            <button
              key={option.variant}
              type="button"
              className="secondary-action example-option"
              data-tone={option.tone}
              aria-label={option.label}
              aria-describedby={descriptionId}
              disabled={disabled}
              onClick={() => choose(option)}
            >
              {option.label}
              <small id={descriptionId}>{option.description}</small>
            </button>
          );
        })}
      </div>
      {pending && (
        <ReplaceInputsDialog
          title="Replace current inputs?"
          description="Loading the example will replace your current form inputs, including any unsaved changes."
          actionLabel={`Load ${pending.label.toLowerCase()}`}
          onConfirm={() => onLoad(pending.variant)}
          onClose={closeConfirmation}
        />
      )}
    </div>
  );
}
