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

for (const width of [1440, 390, 320]) {
  test(`information controls have separate 44px targets at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    for (const [label, id] of [
      ["Execution ID", "execution-id-help-description"],
      ["Execution time (UTC)", "execution-time-help-description"],
      ["Scenario", "scenario-help-description"],
      ["Observation evidence JSON", "verification-observation-hint"],
    ]) {
      const button = page.getByRole("button", { name: `About ${label}`, exact: true });
      await button.scrollIntoViewIfNeeded();
      const geometry = await button.evaluate(element => {
        const rect = element.getBoundingClientRect();
        const input = element.closest(".form-field")!.querySelector("input, select, textarea")!.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.left + 1, rect.top + rect.height / 2);
        return { width: rect.width, height: rect.height, bottom: rect.bottom, inputTop: input.top, hit: hit !== null && element.contains(hit) };
      });
      expect(geometry.width).toBeGreaterThanOrEqual(44);
      expect(geometry.height).toBeGreaterThanOrEqual(44);
      expect(geometry.bottom).toBeLessThanOrEqual(geometry.inputTop);
      expect(geometry.hit).toBe(true);
      await button.hover();
      const tooltip = page.locator(`#${id}`);
      await expect(tooltip).toBeVisible();
      const bounds = (await tooltip.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
      expect(await tooltip.evaluate(element => {
        const help = element.getBoundingClientRect();
        return [...document.querySelectorAll("input, select, textarea")].every(input => {
          const field = input.getBoundingClientRect();
          return help.right <= field.left || help.left >= field.right || help.bottom <= field.top || help.top >= field.bottom;
        });
      })).toBe(true);
      await page.keyboard.press("Escape");
    }
    const information = page.getByRole("button", { name: "About Verify observation", exact: true });
    const size = await information.evaluate(element => ({ width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height }));
    expect(size.width).toBeGreaterThanOrEqual(44);
    expect(size.height).toBeGreaterThanOrEqual(44);
    await page.mouse.move(0, 0);
    await page.screenshot({ path: `/tmp/orbirig-audit-${width}.png`, fullPage: true });
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
    const help = page.getByRole("button", { name: "About Execution time (UTC)", exact: true });
    await help.scrollIntoViewIfNeeded();
    await help.tap({ position: { x: 1, y: 22 } });
    await expect(page.locator("#execution-time-help-description")).toBeVisible();
    await help.tap();
    await expect(page.locator("#execution-time-help-description")).toBeHidden();
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
