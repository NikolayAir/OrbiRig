import { expect, type Locator } from "@playwright/test";

// A focused control and its outline must fit within the dialog and any containing panel.
export async function expectFocusedControlFullyVisible(control: Locator) {
  await expect(control).toBeFocused();
  await expect(control).toHaveCSS("outline-style", "solid");
  await expect(control).toBeInViewport({ ratio: 1 });
  const { outlineBounds, containerBounds } = await control.evaluate(node => {
    const { left, right, top, bottom } = node.getBoundingClientRect();
    const { outlineWidth, outlineOffset } = getComputedStyle(node);
    const outline = Math.max(0, parseFloat(outlineWidth) + parseFloat(outlineOffset));
    const dialog = node.closest("dialog")!;
    const panel = node.closest<HTMLElement>(".workflow-help-content");
    const containers = panel ? [dialog, panel] : [dialog];
    return {
      outlineBounds: { left: left - outline, right: right + outline, top: top - outline, bottom: bottom + outline },
      containerBounds: containers.map(container => {
        const rect = container.getBoundingClientRect();
        const left = rect.left + container.clientLeft;
        const top = rect.top + container.clientTop;
        return { left, right: left + container.clientWidth, top, bottom: top + container.clientHeight };
      }),
    };
  });
  for (const bounds of containerBounds) {
    expect(outlineBounds.left).toBeGreaterThanOrEqual(bounds.left);
    expect(outlineBounds.right).toBeLessThanOrEqual(bounds.right);
    expect(outlineBounds.top).toBeGreaterThanOrEqual(bounds.top);
    expect(outlineBounds.bottom).toBeLessThanOrEqual(bounds.bottom);
  }
}

// Measure the heading and content in the scrolling area. Negative space above the
// heading or below the content means that part of the section is cut off.
export async function sectionPosition(details: Locator) {
  return details.evaluate(node => {
    const dialog = node.closest("dialog")!;
    const scroller = dialog.dataset.scrollWhole === "true"
      ? dialog
      : node.closest<HTMLElement>(".workflow-help-content")!;
    const top = scroller.getBoundingClientRect().top + scroller.clientTop;
    const heading = node.querySelector("summary")!;
    const headingTop = heading.getBoundingClientRect().top;
    const sectionBottom = node.getBoundingClientRect().bottom;
    return {
      above: headingTop - top,
      below: top + scroller.clientHeight - sectionBottom,
      height: sectionBottom - headingTop,
      areaHeight: scroller.clientHeight,
      // Room kept around the heading for its focus outline.
      margin: parseFloat(getComputedStyle(heading).scrollMarginTop),
      scrollTop: scroller.scrollTop,
      maxScrollTop: scroller.scrollHeight - scroller.clientHeight,
    };
  });
}
