import { expect, test } from "@playwright/test";

for (const { width, scale, layout } of [
  { width: 390, scale: 100, layout: "stacked" },
  { width: 1024, scale: 100, layout: "offset" },
  { width: 1280, scale: 100, layout: "centred" },
  { width: 1440, scale: 100, layout: "centred" },
  { width: 1920, scale: 200, layout: "offset" },
  { width: 2560, scale: 200, layout: "centred" },
]) {
  test(`both forms align their columns at ${width}px with ${scale}% text`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    if (scale === 200) await page.locator("html").evaluate(element => { element.style.fontSize = "200%"; });

    for (const workflow of ["Verify observation", "Inspect evidence"] as const) {
      const inspection = workflow === "Inspect evidence";
      if (inspection) await page.getByRole("button", { name: "Show Inspect evidence", exact: true }).click();
      const panel = page.getByRole("region", { name: workflow, exact: true });
      const measure = () => panel.evaluate(element => {
        const box = (selector: string) => element.querySelector(selector)!.getBoundingClientRect().toJSON();
        return {
          divider: document.querySelector('[aria-label="Show Inspect evidence"]')!.getBoundingClientRect().left,
          fields: box("fieldset"),
          editor: box("textarea"),
          label: box(".evidence-input label"),
          form: box("form"),
          action: box("button[type=submit]"),
        };
      });

      const before = await measure();
      expect(before.editor.left >= before.fields.right).toBe(layout !== "stacked");
      expect(before.label.left).toBeCloseTo(before.editor.left, 0);
      if (layout === "centred") {
        expect(Math.abs(before.editor.left - before.divider)).toBeLessThan(1);
        expect(Math.abs(before.editor.width - before.form.width / 2)).toBeLessThan(1);
        expect(before.action.right).toBeCloseTo(before.editor.right, 0);
      }
      if (layout === "offset") {
        expect(before.editor.left).toBeLessThan(before.divider);
        expect(before.editor.width).toBeGreaterThan(before.fields.width);
      }

      if (!inspection) {
        await panel.getByLabel("Execution ID", { exact: true }).fill(`record-${"0123456789".repeat(10)}`);
      }
      await panel.getByRole("button", { name: workflow, exact: true }).click();
      await expect(panel.getByRole("alert").first()).toBeVisible();
      const after = await measure();
      expect(after.editor.left).toBeCloseTo(before.editor.left, 0);
      expect(after.action.top).toBeGreaterThan(after.editor.bottom);
      expect(after.action.left).toBeGreaterThanOrEqual(after.editor.left);
      expect(after.action.right).toBeLessThanOrEqual(after.editor.right + 0.5);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    }
  });
}
