import { expect, test } from "@playwright/test";

for (const inspection of [false, true]) {
  test(`${inspection ? "inspection" : "verification"} keeps a result when reloading identical inputs without restoring a result cleared by editing`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    if (inspection) await page.getByRole("button", { name: "Show Inspect evidence" }).click();
    const load = page.getByRole("button", { name: "Load example", exact: true });
    await load.click();
    let requests = 0;
    page.on("request", request => { if (new URL(request.url()).pathname.startsWith("/api/")) requests++; });
    await page.getByRole("button", { name: inspection ? "Inspect evidence" : "Verify observation", exact: true }).click();
    const result = page.getByRole("region", { name: inspection ? "Observation details" : "Verified execution", exact: true });
    await expect(result).toBeVisible();
    if (inspection) await expect(page.getByLabel(/Verification outcome:/)).toHaveCount(0);
    else await expect(result.getByLabel("Verification outcome: PASS", { exact: true })).toBeVisible();

    await load.focus();
    await page.keyboard.press("Enter");
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
    await expect(result).toHaveCount(0);
    await expect(load).toBeFocused();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator(".action-status")).toHaveText(inspection
      ? "Inputs changed. Inspect to check the current evidence."
      : "Inputs changed. Verify to check the current values.");
    expect(requests).toBe(1);
  });
}

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
      // Header text can leave the button at the viewport edge. A pointer below the
      // viewport cannot reliably keep hover, so keep the whole path inside it.
      await trigger.evaluate(element => element.scrollIntoView({ block: "center" }));
      await trigger.hover();
      await expect(hint).toBeVisible();
      await expect(hint).toBeInViewport({ ratio: 1 });
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
