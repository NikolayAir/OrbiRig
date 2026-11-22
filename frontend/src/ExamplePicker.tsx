import { useId, useLayoutEffect, useRef, useState } from "react";

export type ExampleOption<Variant extends string> = {
  variant: Variant;
  label: string;
  description?: string;
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
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<ExampleOption<Variant> | null>(null);

  function focusTrigger() {
    triggerRef.current?.focus({ preventScroll: true });
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
      focusTrigger();
    }

    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position);
    document.addEventListener("pointerdown", dismissFromOutside);
    document.addEventListener("keydown", dismissWithEscape);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position);
      document.removeEventListener("pointerdown", dismissFromOutside);
      document.removeEventListener("keydown", dismissWithEscape);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (pending && dialogRef.current && !dialogRef.current.open) dialogRef.current.showModal();
  }, [pending]);

  function choose(option: ExampleOption<Variant>) {
    setOpen(false);
    if (requiresConfirmation(option.variant)) {
      setPending(option);
      return;
    }
    onLoad(option.variant);
    focusTrigger();
  }

  function closeConfirmation() {
    dialogRef.current?.close();
    setPending(null);
    focusTrigger();
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
        onClick={() => {
          focusTrigger();
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
              aria-describedby={option.description ? descriptionId : undefined}
              disabled={disabled}
              onClick={() => choose(option)}
            >
              {option.label}
              {option.description && <small id={descriptionId}>{option.description}</small>}
            </button>
          );
        })}
      </div>
      {pending && (
        <dialog
          ref={dialogRef}
          className="workflow-help-dialog example-confirmation"
          aria-labelledby={`${id}-title`}
          aria-describedby={`${id}-message`}
          onCancel={event => {
            event.preventDefault();
            closeConfirmation();
          }}
        >
          <h2 id={`${id}-title`}>Replace current inputs?</h2>
          <p id={`${id}-message`}>
            Loading the example will replace your current form inputs, including any unsaved changes.
          </p>
          <div className="form-actions confirmation-actions">
            <button type="button" className="secondary-action" autoFocus onClick={closeConfirmation}>
              Cancel
            </button>
            <button type="button" className="primary-action" onClick={() => {
              onLoad(pending.variant);
              closeConfirmation();
            }}>
              Load {pending.label.toLowerCase()}
            </button>
          </div>
        </dialog>
      )}
    </div>
  );
}
