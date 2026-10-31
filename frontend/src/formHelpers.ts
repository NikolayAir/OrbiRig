import type { KeyboardEvent as ReactKeyboardEvent } from "react";

export function preventRepeatedRequestAction(event: ReactKeyboardEvent<HTMLFormElement>) {
  // Held Enter must not activate Cancel or Submit just because focus moved to that button.
  if (event.key === "Enter" && event.repeat && event.target instanceof HTMLButtonElement) {
    event.preventDefault();
  }
}

export function wouldReplaceEditedValue(current: string, baseline: string, next: string): boolean {
  // Clearing a loaded example is still an edit; initial whitespace alone is not.
  return current !== baseline && current !== next && (baseline !== "" || current.trim() !== "");
}

export function describedBy(...ids: Array<string | undefined>): string | undefined {
  const descriptionIds = ids.filter(
    (id): id is string => id !== undefined,
  );
  return descriptionIds.length > 0 ? descriptionIds.join(" ") : undefined;
}
