import { expect, test } from "@playwright/test";
import { chooseExample } from "./example-support";

for (const inspection of [false, true]) {
  test(`${inspection ? "inspection" : "verification"} keeps a result when reloading identical inputs without restoring a result cleared by editing`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    if (inspection) await page.getByRole("button", { name: "Show Inspect evidence" }).click();
    const load = page.getByRole("button", { name: "Load example", exact: true });
    await chooseExample(page);
    let requests = 0;
    page.on("request", request => { if (new URL(request.url()).pathname.startsWith("/api/")) requests++; });
    await page.getByRole("button", { name: inspection ? "Inspect evidence" : "Verify observation", exact: true }).click();
    const result = page.getByRole("region", { name: inspection ? "Observation details" : "Verified execution", exact: true });
    await expect(result).toBeVisible();
    if (inspection) await expect(page.locator(".outcome-badge").filter({ hasText: /Verification outcome:/ })).toHaveCount(0);
    else await expect(result.locator(".outcome-badge").filter({ hasText: "Verification outcome: PASS" })).toBeVisible();

    await load.focus();
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "Standard example", exact: true }).click();
    await expect(result).toBeVisible();
    await expect(load).toBeFocused();
    await expect(page.locator(".action-status")).toHaveText(inspection ? "Inspection completed. Evidence is valid." : "Verification completed.");
    await expect(page.getByRole("status")).toBeEmpty();

    const field = page.getByLabel(inspection ? "Evidence JSON" : "Execution ID", { exact: true });
    const original = await field.inputValue();
    await field.fill(`${original} `);
    await field.fill(original);
    await load.focus();
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "Standard example", exact: true }).click();
    await expect(result).toHaveCount(0);
    await expect(load).toBeFocused();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator(".action-status")).toHaveText(inspection
      ? "Inputs changed. Inspect to check the current evidence."
      : "Inputs changed. Verify to check the current values.");
    expect(requests).toBe(1);
  });
}

test("the example picker supports touch taps at the trigger edge", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, hasTouch: true });
  try {
    const page = await context.newPage();
    await page.goto("/");
    for (const workflow of ["Verify observation", "Inspect evidence"]) {
      if (workflow === "Inspect evidence") {
        await page.getByRole("button", { name: "Show Inspect evidence" }).tap();
      }
      const trigger = page.getByRole("button", { name: "Load example", exact: true });
      await trigger.scrollIntoViewIfNeeded();
      const bounds = (await trigger.boundingBox())!;
      await page.touchscreen.tap(bounds.x + bounds.width / 2, bounds.y + bounds.height - 1);
      await expect(trigger).toHaveAttribute("aria-expanded", "true");
      await page.getByRole("button", { name: "Standard example", exact: true }).tap();
      await expect(page.getByLabel(workflow === "Verify observation" ? "Observation evidence JSON" : "Evidence JSON", { exact: true })).not.toHaveValue("");
      await expect(trigger).toHaveAttribute("aria-expanded", "false");
      await expect(page.getByRole("dialog", { name: "Replace current inputs?" })).toHaveCount(0);
    }
  } finally {
    await context.close();
  }
});

for (const width of [1440, 768, 320]) {
  for (const workflow of ["Verify observation", "Inspect evidence"]) {
    test(`${workflow} protects manual inputs when loading an example at ${width}px`, async ({ page, browserName }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/");
      if (workflow === "Inspect evidence") {
        await page.getByRole("button", { name: "Show Inspect evidence" }).click();
      }
      const trigger = page.getByRole("button", { name: "Load example", exact: true });
      const confirmation = page.getByRole("dialog", { name: "Replace current inputs?" });
      await expect(trigger).toHaveAttribute("aria-expanded", "false");

      await chooseExample(page);
      await expect(confirmation).toHaveCount(0);
      await chooseExample(page);
      await expect(confirmation).toHaveCount(0);
      const input = page.getByLabel(workflow === "Verify observation" ? "Execution ID" : "Evidence JSON", { exact: true });
      const example = await input.inputValue();
      const manual = workflow === "Verify observation" ? "manual-execution" : `${example}\n `;
      await input.fill(manual);
      await page.getByRole("button", { name: workflow, exact: true }).click();
      const result = workflow === "Verify observation"
        ? page.getByRole("region", { name: "Verified execution", exact: true })
        : page.getByRole("region", { name: "Observation details", exact: true });
      await expect(result).toBeVisible();
      if (workflow === "Verify observation") {
        await expect(result.locator(".outcome-badge").filter({ hasText: "Verification outcome: PASS" })).toBeVisible();
      } else {
        await expect(result).toContainText("Accepted");
      }

      await chooseExample(page);
      await expect(confirmation).toBeVisible();
      await expect(confirmation).toHaveAccessibleDescription("Loading the example will replace your current form inputs, including any unsaved changes.");
      await expect(trigger).toHaveAttribute("aria-expanded", "false");
      const cancel = confirmation.getByRole("button", { name: "Cancel", exact: true });
      const confirm = confirmation.getByRole("button", { name: "Load standard example", exact: true });
      await expect(cancel).toBeFocused();
      // WebKit on macOS uses Option-Tab for non-text controls.
      const optionTab = browserName === "webkit" && process.platform === "darwin";
      await page.keyboard.press(optionTab ? "Alt+Tab" : "Tab");
      await expect(confirm).toBeFocused();
      await page.keyboard.press(optionTab ? "Alt+Shift+Tab" : "Shift+Tab");
      await expect(cancel).toBeFocused();
      expect(await confirmation.evaluate(element => element.matches(":modal"))).toBe(true);
      const bounds = (await confirmation.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.y).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(800);
      for (const button of [cancel, confirm]) {
        // Read DOMRect dimensions: Firefox's protocol can report the 44px minimum a fraction short.
        const box = await button.evaluate(element => {
          const { width, height } = element.getBoundingClientRect();
          return { width, height };
        });
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
      await page.keyboard.press("Escape");
      await expect(confirmation).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await expect(input).toHaveValue(manual);
      await expect(result).toBeVisible();

      await chooseExample(page);
      await cancel.click();
      await expect(confirmation).toHaveCount(0);
      await expect(input).toHaveValue(manual);
      await expect(result).toBeVisible();
      await expect(trigger).toBeFocused();

      await chooseExample(page);
      if (width === 320) {
        await page.locator("html").evaluate(element => { element.style.fontSize = "200%"; });
        expect(await confirmation.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
        const zoomedBounds = (await confirmation.boundingBox())!;
        expect(zoomedBounds.x).toBeGreaterThanOrEqual(0);
        expect(zoomedBounds.x + zoomedBounds.width).toBeLessThanOrEqual(width);
      }
      await confirm.click();
      await expect(confirmation).toHaveCount(0);
      await expect(input).toHaveValue(example);
      await expect(result).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await chooseExample(page);
      await expect(confirmation).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    });
  }
}
