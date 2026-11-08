import { expect, test } from "@playwright/test";

test("field help remains hoverable and dismissible across the gap", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const help = page.getByRole("button", { name: "About Execution ID", exact: true });
  const tooltip = page.locator("#execution-id-help-description");
  await help.hover();
  await expect(tooltip).toBeVisible();
  const trigger = (await help.boundingBox())!;
  const content = (await tooltip.boundingBox())!;
  await page.mouse.move(trigger.x + trigger.width / 2, content.y + 10, { steps: 12 });
  await expect(tooltip).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(tooltip).toBeHidden();
  await page.mouse.move(0, 0);
  await help.focus();
  await expect(tooltip).toBeVisible();
});

test("text selection ending outside help does not dismiss the dialog", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "From the command line", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "How it works" });
  const command = dialog.getByRole("region", { name: "CLI verification command" });
  const code = await command.locator("code").evaluate(element => {
    const range = document.createRange();
    range.setStart(element.firstChild!, 0);
    range.setEnd(element.firstChild!, 10);
    const bounds = range.getBoundingClientRect();
    return { x: bounds.x, y: bounds.y, height: bounds.height };
  });
  const bounds = (await dialog.boundingBox())!;
  await page.mouse.move(code.x + 2, code.y + code.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width + 20, code.y + code.height / 2, { steps: 12 });
  expect(await page.evaluate(() => window.getSelection()?.toString().length)).toBeGreaterThan(0);
  await page.mouse.up();
  expect(await page.evaluate(() => window.getSelection()?.toString().length)).toBeGreaterThan(0);
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.mouse.click(10, 10);
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("native scenario select matches the other input heights", async ({ page }) => {
  await page.goto("/");
  const inputHeight = await page.getByLabel("Execution ID", { exact: true }).evaluate(node => node.getBoundingClientRect().height);
  const selectHeight = await page.getByLabel("Scenario", { exact: true }).evaluate(node => node.getBoundingClientRect().height);
  expect(selectHeight).toBeGreaterThanOrEqual(44);
  expect(Math.abs(selectHeight - inputHeight)).toBeLessThanOrEqual(2);
});

for (const { width, textScale } of [
  { width: 1440, textScale: 100 },
  { width: 390, textScale: 100 },
  { width: 320, textScale: 100 },
  { width: 320, textScale: 200 },
]) {
  test(`information controls have separate 44px targets at ${width}px with ${textScale}% text`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page.locator("html").evaluate((element, scale) => { element.style.fontSize = `${scale}%`; }, textScale);
    for (const [label, id] of [
      ["Execution ID", "execution-id-help-description"],
      ["Scenario", "scenario-help-description"],
      ["Observation evidence JSON", "verification-observation-hint"],
      ["Evidence JSON", "inspection-evidence-hint"],
    ]) {
      if (label === "Evidence JSON") await page.getByRole("button", { name: "Show Inspect evidence", exact: true }).click();
      const button = page.getByRole("button", { name: `About ${label}`, exact: true });
      await button.scrollIntoViewIfNeeded();
      const geometry = await button.evaluate(element => {
        const rect = element.getBoundingClientRect();
        const field = element.closest(".form-field")!;
        const input = field.querySelector("input, select, textarea")!.getBoundingClientRect();
        const label = field.querySelector("label")!.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.left + 1, rect.top + rect.height / 2);
        return {
          width: rect.width, height: rect.height, bottom: rect.bottom, inputTop: input.top,
          hit: hit !== null && element.contains(hit),
          separate: rect.right <= label.left || rect.left >= label.right || rect.bottom <= label.top || rect.top >= label.bottom,
        };
      });
      expect(geometry.width).toBeGreaterThanOrEqual(44);
      expect(geometry.height).toBeGreaterThanOrEqual(44);
      expect(geometry.bottom).toBeLessThanOrEqual(geometry.inputTop);
      expect(geometry.hit).toBe(true);
      expect(geometry.separate).toBe(true);
      if (label.endsWith("JSON")) {
        // The short format name must not break into individual letters beside a larger touch target.
        expect(await page.getByLabel(label, { exact: true }).evaluate(element => {
          const label = document.querySelector(`label[for="${element.id}"]`)!;
          const text = label.firstChild!;
          const start = text.textContent!.lastIndexOf("JSON");
          const range = document.createRange();
          range.setStart(text, start);
          range.setEnd(text, start + 4);
          return range.getClientRects().length;
        })).toBe(1);
      }
      const positions = () => page.locator(".workflow-panel input, .workflow-panel select, .workflow-panel textarea").evaluateAll(elements => elements.map(element => {
        const rect = element.getBoundingClientRect();
        return { x: rect.x + window.scrollX, y: rect.y + window.scrollY, width: rect.width, height: rect.height };
      }));
      const before = await positions();
      await button.hover();
      const tooltip = page.locator(`#${id}`);
      await expect(tooltip).toBeVisible();
      const bounds = (await tooltip.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
      const after = await positions();
      expect(after).toHaveLength(before.length);
      for (const [index, rect] of after.entries()) {
        for (const key of ["x", "y", "width", "height"] as const) expect(rect[key]).toBeCloseTo(before[index][key], 2);
      }
      await page.keyboard.press("Escape");
      await expect(tooltip).toBeHidden();
    }
    for (const name of ["About Verify observation", "About Inspect evidence", "About Execution time (UTC)"]) {
      await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
    }
    await page.mouse.move(0, 0);
    await testInfo.attach("information controls", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
  });
}

test("touch dismisses help only after an intentional backdrop tap", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, hasTouch: true, viewport: { width: 390, height: 844 } });
  try {
    const page = await context.newPage();
    await page.goto("/");
    const trigger = page.getByRole("button", { name: "From the command line", exact: true });
    await trigger.tap();
    const dialog = page.getByRole("dialog", { name: "How it works" });
    await dialog.getByRole("region", { name: "CLI verification command" }).tap();
    await expect(dialog).toBeVisible();
    await page.touchscreen.tap(2, 2);
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    const help = page.getByRole("button", { name: "About Observation evidence JSON", exact: true });
    await help.scrollIntoViewIfNeeded();
    await help.tap({ position: { x: 1, y: 22 } });
    await expect(page.locator("#verification-observation-hint")).toBeVisible();
    await help.tap();
    await expect(page.locator("#verification-observation-hint")).toBeHidden();
  } finally {
    await context.close();
  }
});

test("server time errors identify the field and keep verification outcomes separate", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Load example", exact: true }).click();
  const time = page.getByLabel("Execution time (UTC)", { exact: true });
  await time.fill("2026-02-30T10:00:00Z");
  await page.getByRole("button", { name: "Verify observation", exact: true }).click();
  await expect(time).toHaveAttribute("aria-invalid", "true");
  await expect(time).toHaveAccessibleDescription(/timestamp must be a valid UTC date and time/);
  await expect(page.getByRole("alert")).toContainText("timestamp must be a valid UTC date and time");
  await expect(page.locator(".outcome-badge")).toHaveCount(0);
  await time.fill("2026-11-01T10:00:00Z");
  await expect(time).not.toHaveAttribute("aria-invalid");
});
