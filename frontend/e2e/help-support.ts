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

// Where an open section lies in the area that scrolls: the whole dialog when it scrolls
// as one (`data-scroll-whole`), otherwise the content panel. `above` and `below` are the
// free space around the section in pixels, so a negative value means it is cut off.
export async function sectionPosition(details: Locator) {
  return details.evaluate(node => {
    const dialog = node.closest("dialog")!;
    const scroller = dialog.dataset.scrollWhole === "true"
      ? dialog
      : node.closest<HTMLElement>(".workflow-help-content")!;
    const top = scroller.getBoundingClientRect().top + scroller.clientTop;
    const section = node.getBoundingClientRect();
    return {
      above: section.top - top,
      below: top + scroller.clientHeight - section.bottom,
      height: section.height,
      areaHeight: scroller.clientHeight,
      // Room kept around the heading for its focus outline.
      margin: parseFloat(getComputedStyle(node.querySelector("summary")!).scrollMarginTop),
      scrollTop: scroller.scrollTop,
      maxScrollTop: scroller.scrollHeight - scroller.clientHeight,
    };
  });
}
