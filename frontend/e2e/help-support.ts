import { expect, type Locator } from "@playwright/test";

// Touching the viewport is not enough: the whole control and its focus outline must lie
// inside the dialog and its scrolling panel.
export async function expectFocusedControlFullyVisible(control: Locator) {
  await expect(control).toBeInViewport({ ratio: 1 });
  const visible = await control.evaluate(node => {
    const rect = node.getBoundingClientRect();
    const dialog = node.closest("dialog")!.getBoundingClientRect();
    const panel = node.closest(".workflow-help-content")!.getBoundingClientRect();
    const style = getComputedStyle(node);
    const outline = parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset);
    return rect.left - outline >= dialog.left && rect.right + outline <= dialog.right &&
      rect.top - outline >= Math.max(dialog.top, panel.top) &&
      rect.bottom + outline <= Math.min(dialog.bottom, panel.bottom);
  });
  expect(visible).toBe(true);
}
