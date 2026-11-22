import { expect, test } from "@playwright/test";
import { chooseExample } from "./example-support";

for (const { width, height } of [{ width: 320, height: 480 }, { width: 393, height: 820 }]) {
  test(`Tab keeps option outlines visible at ${width}x${height} with doubled text`, async ({ page, browserName }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await page.locator("html").evaluate(element => { element.style.fontSize = "200%"; });
    await page.getByRole("button", { name: "Show Inspect evidence", exact: true }).click();
    await page.getByRole("radio", { name: "Verified execution sequence", exact: true }).check();
    const picker = page.getByRole("button", { name: "Load example", exact: true });
    await picker.evaluate(element => element.scrollIntoView({ block: "center" }));
    await picker.focus();
    await page.keyboard.press("Enter");
    const list = page.locator(".example-options");
    expect(await list.evaluate(element => element.scrollHeight)).toBeGreaterThan(await list.evaluate(element => element.clientHeight));

    const tab = browserName === "webkit" && process.platform === "darwin" ? "Alt+Tab" : "Tab";
    for (const label of ["Standard example", "Long sequence", "Failing example", "Altered example"]) {
      await page.keyboard.press(tab);
      const option = list.getByRole("button", { name: label, exact: true });
      await expect(option).toBeFocused();
      await expect(option).toHaveCSS("outline-style", "solid");
      await expect.poll(() => option.evaluate(button => {
        const list = button.parentElement!;
        const listBounds = list.getBoundingClientRect();
        const listLeft = listBounds.left + list.clientLeft;
        const listTop = listBounds.top + list.clientTop;
        const { left, right, top, bottom, height } = button.getBoundingClientRect();
        const style = getComputedStyle(button);
        const outline = parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset);
        const fitsInline = left - outline >= listLeft && right + outline <= listLeft + list.clientWidth;
        // Require both vertical edges only when the button and outline fit together.
        const outlineCanFit = height + 2 * outline <= list.clientHeight;
        const visibleBlock = top - outline >= listTop && bottom + outline <= listTop + list.clientHeight;
        return fitsInline && (!outlineCanFit || visibleBlock);
      })).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(picker).toBeFocused();
    await expect(list).toBeHidden();
  });
}

test("the inspection picker shows the options for the selected evidence type", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Show Inspect evidence", exact: true }).click();
  const picker = page.getByRole("button", { name: "Load example", exact: true });
  const options = page.locator(".example-options");

  for (const [type, labels] of [
    ["Observation", ["Standard example", "Altered example"]],
    ["Verified execution", ["Standard example", "Failing example", "Altered example"]],
    ["Verified execution sequence", ["Standard example", "Long sequence", "Failing example", "Altered example"]],
  ] as const) {
    await page.getByRole("radio", { name: type, exact: true }).check();
    await expect(picker).toHaveAttribute("aria-expanded", "false");
    await expect(options).toBeHidden();
    await picker.click();
    await expect(options.getByRole("button")).toHaveCount(labels.length);
    for (const label of labels) await expect(options.getByRole("button", { name: label, exact: true })).toBeVisible();
    await page.getByRole("heading", { name: "Inspect evidence", exact: true }).click();
    await expect(options).toBeHidden();
  }
});

for (const workflow of ["Verify observation", "Inspect evidence"] as const) {
  const inspection = workflow === "Inspect evidence";
  for (const { width, scale } of [
    { width: 1440, scale: 100 },
    { width: 2560, scale: 200 },
    { width: 768, scale: 100 },
    { width: 768, scale: 200 },
    { width: 390, scale: 100 },
    { width: 320, scale: 200 },
  ]) {
    test(`${workflow} keeps its form and picker in place at ${width}px with ${scale}% text`, async ({ page }) => {
      const height = 500;
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto("/");
      if (scale === 200) await page.addStyleTag({ content: ":root { font-size: 200%; }" });
      if (inspection) {
        await page.getByRole("button", { name: "Show Inspect evidence", exact: true }).click();
        await page.getByRole("radio", { name: "Verified execution sequence", exact: true }).check();
      }
      const panel = page.getByRole("region", { name: workflow, exact: true });
      const picker = panel.getByRole("button", { name: "Load example", exact: true });
      const options = panel.locator(".example-options");
      await expect(picker).toHaveCount(1);
      await expect(options).toBeHidden();
      await chooseExample(page);
      await panel.getByRole("button", { name: workflow, exact: true }).click();
      await expect(panel.getByRole("region", { name: inspection ? "Verified execution sequence" : "Verified execution", exact: true })).toBeVisible();

      const layout = () => panel.evaluate(element => {
        const box = (selector: string) => {
          const { left, top, right, bottom } = element.querySelector(selector)!.getBoundingClientRect();
          return { left, right, top: top + scrollY, bottom: bottom + scrollY };
        };
        return {
          heading: box(".workflow-heading"),
          title: box(".workflow-heading > h2"),
          trigger: box(".example-picker-trigger"),
          fields: box("fieldset"),
          editor: box("textarea"),
          result: box(".workflow-feedback"),
        };
      });
      // Open at the viewport edge, where the list needs room above the button.
      await picker.evaluate(element => element.scrollIntoView({ block: "end" }));
      const before = await layout();
      if (width >= 1440) expect(before.editor.left).toBeGreaterThan(before.fields.right);
      if (width === 390 && scale === 100) expect(before.trigger.top).toBeLessThan(before.title.bottom);

      await picker.click();
      await expect(picker).toHaveAttribute("aria-expanded", "true");
      await expect(options.getByRole("button")).toHaveCount(inspection ? 4 : 2);
      const popup = (await options.boundingBox())!;
      expect(popup.x).toBeGreaterThanOrEqual(0);
      expect(popup.x + popup.width).toBeLessThanOrEqual(width);
      expect(popup.y).toBeGreaterThanOrEqual(0);
      expect(popup.y + popup.height).toBeLessThanOrEqual(height + 0.5);
      await options.getByRole("button").last().scrollIntoViewIfNeeded();
      await expect(options.getByRole("button").last()).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      const after = await layout();
      for (const part of Object.keys(before) as (keyof typeof before)[]) {
        for (const edge of ["left", "right", "top", "bottom"] as const) {
          expect(after[part][edge], `${part} ${edge}`).toBeCloseTo(before[part][edge], 2);
        }
      }
    });
  }

  test(`${workflow} restores focus after dismissing or replacing an example`, async ({ page, browserName }) => {
    const tab = browserName === "webkit" && process.platform === "darwin" ? "Alt+Tab" : "Tab";
    const variant = inspection ? "Altered example" : "Failing example";
    await page.setViewportSize({ width: 390, height: 850 });
    await page.goto("/");
    if (inspection) await page.getByRole("button", { name: "Show Inspect evidence", exact: true }).click();
    const picker = page.getByRole("button", { name: "Load example", exact: true });
    const option = page.getByRole("button", { name: variant, exact: true });
    const editor = page.getByLabel(inspection ? "Evidence JSON" : "Observation evidence JSON", { exact: true });
    await editor.fill("Unsaved evidence");
    await picker.focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press(tab);
    await expect(page.getByRole("button", { name: "Standard example", exact: true })).toBeFocused();
    await page.keyboard.press(tab);
    await expect(option).toBeFocused();
    await expect(option).toHaveAccessibleDescription(inspection ? /repeated field name/ : /recorded ending mode/);
    await expect(option).toHaveCSS("outline-style", "solid");
    await page.keyboard.press("Escape");
    await expect(picker).toBeFocused();
    await expect(option).toBeHidden();

    await chooseExample(page, variant);
    const dialog = page.getByRole("dialog", { name: "Replace current inputs?" });
    await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.locator(".example-confirmation")).toHaveCount(0);
    await expect(picker).toBeFocused();
    await expect(editor).toHaveValue("Unsaved evidence");

    await chooseExample(page, variant);
    await dialog.getByRole("button", { name: `Load ${variant.toLowerCase()}`, exact: true }).click();
    await expect(picker).toBeFocused();
    await expect(picker).toHaveAttribute("aria-expanded", "false");
    await expect(editor).toHaveValue(/"command"/);
  });
}
