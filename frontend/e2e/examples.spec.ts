import { expect, test } from "@playwright/test";

test("example tooltips leave touch taps at the button edge usable", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, hasTouch: true });
  try {
    const page = await context.newPage();
    await page.goto("/");
    for (const workflow of ["Verify observation", "Inspect evidence"]) {
      if (workflow === "Inspect evidence") {
        await page.getByRole("button", { name: "Show Inspect evidence" }).tap();
      }
      const trigger = page.getByRole("button", { name: "Load example", exact: true });
      const hint = page.locator(`[id="${await trigger.getAttribute("aria-describedby")}"]`);
      await trigger.scrollIntoViewIfNeeded();
      const bounds = (await trigger.boundingBox())!;
      await page.touchscreen.tap(bounds.x + bounds.width / 2, bounds.y + bounds.height - 1);
      await expect(page.getByLabel(workflow === "Verify observation" ? "Observation evidence JSON" : "Evidence JSON", { exact: true })).not.toHaveValue("");
      await expect(hint).toBeHidden();
      await expect(page.getByRole("dialog", { name: "Replace current inputs?" })).toHaveCount(0);
    }
  } finally {
    await context.close();
  }
});

for (const width of [1440, 320]) {
  for (const workflow of ["Verify observation", "Inspect evidence"]) {
    test(`${workflow} example tooltip supports hover-only dismissal and reopening at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/");
      if (workflow === "Inspect evidence") {
        await page.getByRole("button", { name: "Show Inspect evidence" }).click();
      }
      const input = page.getByLabel(workflow === "Verify observation" ? "Execution ID" : "Evidence JSON", { exact: true });
      const trigger = page.getByRole("button", { name: "Load example", exact: true });
      const hint = page.locator(`[id="${await trigger.getAttribute("aria-describedby")}"]`);
      await input.focus();
      await trigger.hover();
      await expect(hint).toBeVisible();
      await expect(input).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(hint).toBeHidden();
      await expect(input).toBeFocused();
      const buttonBounds = (await trigger.boundingBox())!;
      await page.mouse.move(buttonBounds.x + buttonBounds.width / 2 + 1, buttonBounds.y + buttonBounds.height / 2);
      await expect(hint).toBeHidden();

      await page.mouse.move(0, 0);
      await trigger.hover();
      await expect(hint).toBeVisible();
      const hintBounds = (await hint.boundingBox())!;
      await page.mouse.move(hintBounds.x + hintBounds.width / 2, hintBounds.y + hintBounds.height / 2, { steps: 12 });
      await expect(hint).toBeVisible();
      expect(await hint.evaluate(node => node.matches(":hover"))).toBe(true);
      await expect(input).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(hint).toBeHidden();
      await expect(input).toBeFocused();

      await trigger.focus();
      await expect(hint).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(hint).toBeHidden();
      await expect(trigger).toBeFocused();
      await input.focus();
      await trigger.focus();
      await expect(hint).toBeVisible();
      // The hover bridge must not intercept the lower edge of the button.
      // Use an actionable relative click while Firefox completes focus scrolling.
      const edge = await trigger.evaluate(element => {
        const { width, height } = element.getBoundingClientRect();
        return { x: width / 2 - element.clientLeft, y: height - element.clientTop - 1 };
      });
      await trigger.click({ position: edge });
      await expect(hint).toBeHidden();
      await expect(page.getByRole("dialog", { name: "Replace current inputs?" })).toHaveCount(0);
      await expect(page.getByLabel(workflow === "Verify observation" ? "Observation evidence JSON" : "Evidence JSON", { exact: true })).not.toHaveValue("");
    });
  }
}

for (const width of [1440, 768, 320]) {
  for (const workflow of ["Verify observation", "Inspect evidence"]) {
    test(`${workflow} protects manual inputs when loading an example at ${width}px`, async ({ page, browserName }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/");
      if (workflow === "Inspect evidence") {
        await page.getByRole("button", { name: "Show Inspect evidence" }).click();
      }
      const trigger = page.getByRole("button", { name: "Load example", exact: true });
      const hint = page.locator(`[id="${await trigger.getAttribute("aria-describedby")}"]`);
      const confirmation = page.getByRole("dialog", { name: "Replace current inputs?" });
      await expect(hint).toBeHidden();
      await trigger.hover();
      await expect(hint).toBeVisible();
      const hintBounds = (await hint.boundingBox())!;
      expect(hintBounds.x).toBeGreaterThanOrEqual(0);
      expect(hintBounds.x + hintBounds.width).toBeLessThanOrEqual(width);
      await page.mouse.move(0, 0);
      await expect(hint).toBeHidden();
      await trigger.focus();
      await expect(hint).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(hint).toBeHidden();
      await expect(trigger).toBeFocused();

      await trigger.click();
      await expect(confirmation).toHaveCount(0);
      await trigger.click();
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
        await expect(result.getByLabel("Verification outcome: PASS", { exact: true })).toBeVisible();
      } else {
        await expect(result).toContainText("Accepted");
      }

      await trigger.click();
      await expect(confirmation).toBeVisible();
      await expect(confirmation).toHaveAccessibleDescription("Loading the example will replace your current form inputs, including any unsaved changes.");
      await expect(hint).toBeHidden();
      const cancel = confirmation.getByRole("button", { name: "Cancel", exact: true });
      const confirm = confirmation.getByRole("button", { name: "Load example", exact: true });
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
        const box = (await button.boundingBox())!;
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
      await page.keyboard.press("Escape");
      await expect(confirmation).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await expect(input).toHaveValue(manual);
      await expect(result).toBeVisible();

      await trigger.click();
      await cancel.click();
      await expect(confirmation).toHaveCount(0);
      await expect(input).toHaveValue(manual);
      await expect(result).toBeVisible();
      await expect(trigger).toBeFocused();

      await trigger.click();
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
      await trigger.click();
      await expect(confirmation).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    });
  }
}
