import { readFileSync } from "node:fs";

import { expect, test, type Locator } from "@playwright/test";

const observation = readFileSync(new URL("./fixtures/mixed-results.json", import.meta.url), "utf8");
const sequence = readFileSync(new URL("./fixtures/discontinuous-sequence.json", import.meta.url), "utf8");

async function expectWithinWidth(elements: Locator, width: number) {
  for (const element of await elements.all()) {
    const bounds = await element.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
  }
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
  { width: 1280, height: 800 },
  { width: 1200, height: 900 },
  { width: 1199, height: 900 },
  { width: 1024, height: 768 },
  { width: 768, height: 1024 },
  { width: 390, height: 480 },
  { width: 320, height: 800 },
  { width: 320, height: 480 },
]) {
  test(`forms and evidence results remain readable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");

    if (viewport.width >= 1280) {
      const introductionLines = await page.locator(".page-header > p:last-child").evaluate(element => {
        const range = document.createRange();
        range.selectNodeContents(element);
        return range.getClientRects().length;
      });
      expect(introductionLines).toBe(1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width);
    const appBounds = (await page.locator("main").boundingBox())!;
    expect(appBounds.width).toBe(Math.min(viewport.width, 1280));
    const executionId = page.getByLabel("Execution ID", { exact: true });
    const editor = page.getByLabel("Observation evidence JSON", { exact: true });
    const action = page.getByRole("button", { name: "Verify observation", exact: true });
    const metadataBounds = (await page.locator(".verification-inputs").boundingBox())!;
    const editorBounds = (await editor.boundingBox())!;
    const actionBounds = (await action.boundingBox())!;
    expect(editorBounds.height).toBeGreaterThanOrEqual(176);
    expect(actionBounds.y).toBeGreaterThanOrEqual(editorBounds.y + editorBounds.height);
    if (viewport.width >= 1200) {
      expect(actionBounds.x + actionBounds.width).toBeCloseTo(editorBounds.x + editorBounds.width, 0);
      expect(actionBounds.width).toBeLessThan(editorBounds.width);
      expect(actionBounds.y - (editorBounds.y + editorBounds.height)).toBeCloseTo(16, 0);
      expect(editorBounds.x).toBeGreaterThan(metadataBounds.x + metadataBounds.width);
      expect(editorBounds.y).toBeLessThan(metadataBounds.y + metadataBounds.height);
      expect(editorBounds.width).toBeGreaterThanOrEqual(680);
      const idBounds = (await executionId.boundingBox())!;
      const timeBounds = (await page.getByLabel("Execution time (UTC)", { exact: true }).boundingBox())!;
      expect(timeBounds.y).toBeGreaterThan(idBounds.y + idBounds.height);
      if (viewport.width >= 1280 && viewport.height >= 900) {
        expect(actionBounds.y + actionBounds.height).toBeLessThanOrEqual(viewport.height);
      }
    } else {
      expect(actionBounds.x).toBeCloseTo(editorBounds.x, 0);
      expect(editorBounds.x).toBeCloseTo(metadataBounds.x, 0);
      expect(editorBounds.width).toBeCloseTo(metadataBounds.width, 0);
      expect(editorBounds.y).toBeGreaterThan(metadataBounds.y + metadataBounds.height);
    }
    for (const name of ["About Verify observation", "About Execution ID", "About Scenario"]) {
      await page.getByRole("button", { name, exact: true }).focus();
      const tooltip = page.getByRole("tooltip");
      await expect(tooltip).toBeVisible();
      await expectWithinWidth(tooltip, viewport.width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width);
      await page.keyboard.press("Escape");
      await expect(tooltip).toBeHidden();
    }

    await page.getByRole("button", { name: "Verify observation", exact: true }).click();
    await expect(executionId).toBeFocused();
    await expect(executionId).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByRole("alert")).toHaveCount(4);
    await expectWithinWidth(page.getByRole("alert"), viewport.width);

    const example = page.getByRole("button", { name: "Load example", exact: true });
    await expect(example).toHaveAccessibleDescription("Replaces current inputs");
    const exampleHint = page.getByText("Replaces current inputs", { exact: true });
    await expect(exampleHint).toBeHidden();
    await example.hover();
    await expect(exampleHint).toBeVisible();
    await expectWithinWidth(exampleHint, viewport.width);
    const exampleBounds = (await example.boundingBox())!;
    const inputBounds = (await executionId.boundingBox())!;
    expect(exampleBounds.y + exampleBounds.height).toBeLessThan(inputBounds.y);
    await example.click();
    await expect(executionId).toHaveValue("example-execution-001");
    await expect(page.getByLabel("Scenario", { exact: true })).toHaveValue("nominal_to_safe_mode");
    expect(await editor.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Verified execution", exact: true })).toHaveCount(0);

    const longId = `review-${"record".repeat(20)}-Δ`;
    await executionId.fill(longId);
    await page.getByLabel("Execution time (UTC)", { exact: true }).fill("2026-08-17T08:00:00Z");
    await page.getByLabel("Scenario", { exact: true }).selectOption("nominal_to_safe_mode");
    await editor.fill(JSON.stringify(JSON.parse(observation)));
    expect(await editor.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await expectWithinWidth(page.locator(".verification-form input, .verification-form select, .verification-form textarea, .primary-action"), viewport.width);
    await page.getByRole("button", { name: "Verify observation", exact: true }).click();

    const result = page.getByRole("region", { name: "Verified execution", exact: true });
    await expect(result.getByLabel("Verification outcome: FAIL", { exact: true })).toBeInViewport();
    await expect(result.getByText(longId, { exact: true })).toBeVisible();
    await expect(result.getByText("Verification result", { exact: true })).toBeVisible();
    const postState = result.getByRole("listitem").filter({ has: page.getByText("post_state_matches_requested_mode", { exact: true }) });
    await expect(postState.locator("dt").filter({ hasText: /^Expected$/ }).locator("+ dd")).toHaveText("SAFE");
    await expect(postState.locator("dt").filter({ hasText: /^Actual$/ }).locator("+ dd")).toHaveText("NOMINAL");
    await expect(postState.getByLabel("Verification check: FAIL", { exact: true })).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expectWithinWidth(result.locator("dd, code, .outcome-badge"), viewport.width);
    expect(await result.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);

    await page.getByRole("button", { name: "Show Inspect evidence workflow", exact: true }).click();
    const types = (await page.getByRole("group", { name: "Evidence type", exact: true }).boundingBox())!;
    const inspectionEditor = page.getByLabel("Evidence JSON", { exact: true });
    const inspectionEditorBounds = (await inspectionEditor.boundingBox())!;
    const inspectionAction = (await page.getByRole("button", { name: "Inspect evidence", exact: true }).boundingBox())!;
    const cards = page.locator(".evidence-types label");
    await expect(cards).toHaveCount(3);
    let previousCardBottom = 0;
    for (const card of await cards.all()) {
      const bounds = (await card.boundingBox())!;
      expect(bounds.y).toBeGreaterThanOrEqual(previousCardBottom);
      expect(bounds.x).toBeCloseTo(types.x, 0);
      expect(bounds.width).toBeCloseTo(types.width, 0);
      expect(await card.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      if (viewport.width >= 1200) expect(bounds.height).toBeLessThanOrEqual(104);
      previousCardBottom = bounds.y + bounds.height;
    }
    expect(inspectionEditorBounds.height).toBeGreaterThanOrEqual(176);
    expect(inspectionAction.y).toBeGreaterThanOrEqual(inspectionEditorBounds.y + inspectionEditorBounds.height);
    if (viewport.width >= 1200) {
      expect(inspectionEditorBounds.x).toBeGreaterThan(types.x + types.width);
      expect(inspectionEditorBounds.y).toBeLessThan(types.y + types.height);
      expect(inspectionEditorBounds.width).toBeGreaterThanOrEqual(680);
      expect(inspectionEditorBounds.width / types.width).toBeCloseTo(2, 1);
      expect(inspectionAction.x + inspectionAction.width).toBeCloseTo(inspectionEditorBounds.x + inspectionEditorBounds.width, 0);
      expect(inspectionAction.width).toBeLessThan(inspectionEditorBounds.width);
      expect(inspectionAction.y - (inspectionEditorBounds.y + inspectionEditorBounds.height)).toBeCloseTo(16, 0);
      if (viewport.width >= 1280 && viewport.height >= 900) {
        expect(inspectionAction.y + inspectionAction.height).toBeLessThanOrEqual(viewport.height);
      }
    } else {
      expect(inspectionEditorBounds.y).toBeGreaterThan(types.y + types.height);
      expect(inspectionEditorBounds.x).toBeCloseTo(types.x, 0);
      expect(inspectionEditorBounds.width).toBeCloseTo(types.width, 0);
      expect(inspectionAction.x).toBeCloseTo(inspectionEditorBounds.x, 0);
    }
    await page.getByRole("radio", { name: "Verified execution sequence", exact: true }).check();
    await inspectionEditor.fill(sequence);
    expect(await inspectionEditor.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
    expect(await inspectionEditor.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.getByRole("button", { name: "Inspect evidence", exact: true }).click();
    const inspected = page.getByRole("region", { name: "Verified execution sequence", exact: true });
    await expect(inspected.getByLabel("Sequence outcome: FAIL", { exact: true })).toBeInViewport();
    await expect(inspected.getByText("Valid saved evidence", { exact: true })).toBeVisible();
    const boundary = inspected.getByRole("article", { name: "Continuity check 1", exact: true });
    await expect(boundary.getByLabel("Continuity outcome: FAIL", { exact: true })).toBeVisible();
    await expect(boundary.getByText("SAFE", { exact: true })).toBeVisible();
    await expect(boundary.getByText("NOMINAL", { exact: true })).toBeVisible();
    await expectWithinWidth(inspected.locator("dd, code, .outcome-badge"), viewport.width);
    expect(await inspected.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width);
  });
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
  { width: 320, height: 800 },
]) {
  test(`inspection selects evidence by keyboard and preserves JSON at ${viewport.width}px`, async ({ page, browserName }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await page.getByRole("button", { name: "Show Inspect evidence workflow", exact: true }).click();
    await page.getByRole("button", { name: "Load example", exact: true }).click();
    const editor = page.getByLabel("Evidence JSON", { exact: true });
    const observationText = await editor.inputValue();
    const observation = page.getByRole("radio", { name: "Observation", exact: true });
    await expect(observation).toBeChecked();
    await observation.focus();
    for (const [name, description] of [
      ["Verified execution", "One execution with its scenario and checks."],
      ["Verified execution sequence", "Ordered executions and continuity checks."],
    ]) {
      await page.keyboard.press("ArrowDown");
      const radio = page.getByRole("radio", { name, exact: true });
      await expect(radio).toBeChecked();
      await expect(radio).toBeFocused();
      await expect(radio).toHaveAccessibleDescription(description);
      expect(await radio.locator("..").evaluate(element => getComputedStyle(element).outlineStyle)).toBe("solid");
      await expect(editor).toHaveValue(observationText);
    }
    await page.keyboard.press(browserName === "webkit" && process.platform === "darwin" ? "Alt+Tab" : "Tab");
    await expect(editor).toBeFocused();
    await editor.fill(sequence);
    await page.keyboard.press(browserName === "webkit" && process.platform === "darwin" ? "Alt+Tab" : "Tab");
    const action = page.getByRole("button", { name: "Inspect evidence", exact: true });
    await expect(action).toBeFocused();
    await expect(action).toBeInViewport();
    await page.keyboard.press("Enter");
    const result = page.getByRole("region", { name: "Verified execution sequence", exact: true });
    await expect(result.getByLabel("Sequence outcome: FAIL", { exact: true })).toBeInViewport();
    await observation.check();
    await expect(result).toHaveCount(0);
    await expect(editor).toHaveValue(sequence);
  });
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
]) {
  test(`verification follows the field order and submits by keyboard at ${viewport.width}px`, async ({ page, browserName }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await page.getByRole("button", { name: "Load example", exact: true }).click();
    await page.getByLabel("Execution ID", { exact: true }).focus();
    const tab = browserName === "webkit" && process.platform === "darwin" ? "Alt+Tab" : "Tab";
    for (const control of [
      page.getByLabel("Execution time (UTC)", { exact: true }),
      page.getByRole("button", { name: "About Scenario", exact: true }),
      page.getByLabel("Scenario", { exact: true }),
      page.getByLabel("Observation evidence JSON", { exact: true }),
      page.getByRole("button", { name: "Verify observation", exact: true }),
    ]) {
      await page.keyboard.press(tab);
      await expect(control).toBeFocused();
      await expect(control).toBeInViewport();
      expect(await control.evaluate(element => getComputedStyle(element).outlineStyle)).toBe("solid");
    }
    await page.keyboard.press("Enter");
    const result = page.getByRole("region", { name: "Verified execution", exact: true });
    await expect(result.getByLabel("Verification outcome: PASS", { exact: true })).toBeInViewport();
  });
}

for (const width of [1440, 390, 320]) {
  for (const [title, helpId, description, outsideLabel, reminder] of [
    ["Verify observation", "verification-help-description", "Provide execution details, select a supported scenario, and submit observation evidence for verification.", "Execution ID", "Replaces current inputs"],
    ["Inspect evidence", "inspection-help-description", "Select an evidence type and paste its JSON document to review it in a structured view.", "Evidence JSON", "Replaces evidence JSON"],
  ]) {
    test(`${title} introduction supports hover, keyboard and touch at ${width}px`, async ({ browser, baseURL, browserName }) => {
      const context = await browser.newContext({ baseURL, viewport: { width, height: 800 }, hasTouch: true });
      const page = await context.newPage();
      await page.goto("/");
      if (title === "Inspect evidence") await page.getByRole("button", { name: "Show Inspect evidence workflow" }).click();
      const help = page.getByRole("button", { name: `About ${title}`, exact: true });
      const tooltip = page.locator(`#${helpId}`);
      const heading = page.getByRole("heading", { name: title, exact: true });
      await expect(tooltip).toBeHidden();
      await expect(help).toHaveAccessibleDescription(
        description,
      );
      const headingBounds = (await heading.boundingBox())!;
      const helpBounds = (await help.boundingBox())!;
      expect(helpBounds.x).toBeGreaterThanOrEqual(headingBounds.x + headingBounds.width);
      expect(Math.abs(helpBounds.y + helpBounds.height / 2 - headingBounds.y - headingBounds.height / 2)).toBeLessThan(1);

      await help.hover();
      await expect(tooltip).toBeVisible();
      await expectWithinWidth(tooltip, width);
      // The hover bridge must leave the lower edge of the button clickable.
      await page.mouse.click(helpBounds.x + helpBounds.width / 2, helpBounds.y + helpBounds.height - 2);
      await expect(help.locator("..")).toHaveAttribute("data-open", "true");
      await page.mouse.move(0, 0);
      await expect(tooltip).toBeVisible();
      await tooltip.hover();
      await expect(tooltip).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(tooltip).toBeHidden();
      await page.mouse.move(0, 0);

      await help.focus();
      const optionTab = browserName === "webkit" && process.platform === "darwin";
      await page.keyboard.press(optionTab ? "Alt+Shift+Tab" : "Shift+Tab");
      await page.keyboard.press(optionTab ? "Alt+Tab" : "Tab");
      await expect(help).toBeFocused();
      await expect(tooltip).toBeVisible();
      await expect(help).toHaveCSS("outline-style", "solid");
      await page.keyboard.press("Escape");
      await expect(tooltip).toBeHidden();
      await expect(help).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(tooltip).toBeVisible();
      await page.keyboard.press("Enter");
      await expect(tooltip).toBeHidden();
      await page.keyboard.press("Space");
      await expect(tooltip).toBeVisible();
      await page.keyboard.press("Tab");
      await expect(tooltip).toBeHidden();

      await help.tap();
      await expect(tooltip).toBeVisible();
      await help.tap();
      await expect(tooltip).toBeHidden();
      await help.tap();
      await expect(tooltip).toBeVisible();
      await page.getByLabel(outsideLabel, { exact: true }).tap();
      await expect(tooltip).toBeHidden();
      await expect(page.getByText(reminder, { exact: true })).toBeHidden();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);

      await page.setViewportSize({ width, height: 480 });
      await page.mouse.move(0, 0);
      await help.evaluate(element => {
        window.scrollBy(0, element.getBoundingClientRect().bottom - window.innerHeight + 16);
      });
      await help.hover();
      await expect(tooltip).toBeVisible();
      const tooltipBounds = (await tooltip.boundingBox())!;
      expect(tooltipBounds.y).toBeGreaterThanOrEqual(0);
      expect(tooltipBounds.y + tooltipBounds.height).toBeLessThanOrEqual(480);
      await expect(help.locator("..")).toHaveAttribute("data-above", "true");
      // A tooltip above the heading must also leave the upper edge usable.
      const aboveHelpBounds = (await help.boundingBox())!;
      await page.mouse.click(aboveHelpBounds.x + aboveHelpBounds.width / 2, aboveHelpBounds.y + 2);
      await expect(help.locator("..")).toHaveAttribute("data-open", "true");
      await page.mouse.move(0, 0);
      await expect(tooltip).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(tooltip).toBeHidden();
      await context.close();
    });

    if (width !== 1440) {
      test(`${title} introduction toggles with touch-only edge taps at ${width}px`, async ({ browser, baseURL, browserName }) => {
        test.skip(browserName === "firefox", "Firefox does not support Playwright mobile emulation.");
        const context = await browser.newContext({ baseURL, viewport: { width, height: 844 }, hasTouch: true, isMobile: true });
        try {
          const page = await context.newPage();
          await page.goto("/");
          if (title === "Inspect evidence") await page.getByRole("button", { name: "Show Inspect evidence workflow" }).tap();
          const input = page.getByLabel(outsideLabel, { exact: true });
          await input.fill("preserved-through-edge-taps");
          const help = page.getByRole("button", { name: `About ${title}`, exact: true });
          const tooltip = page.locator(`#${helpId}`);
          await help.scrollIntoViewIfNeeded();
          const bounds = (await help.boundingBox())!;
          const x = bounds.x + bounds.width / 2;
          const y = bounds.y + bounds.height - 2;
          await page.touchscreen.tap(x, y);
          await expect(tooltip).toBeVisible();
          await expect(help.locator("..")).toHaveAttribute("data-open", "true");
          await page.touchscreen.tap(x, y);
          await expect(tooltip).toBeHidden();
          await expect(help.locator("..")).toHaveAttribute("data-open", "false");
          await expect(input).toHaveValue("preserved-through-edge-taps");
        } finally {
          await context.close();
        }
      });
    }
  }
}

for (const font of ["", "monospace"]) {
  test(`forms reflow with doubled text at 320px using ${font || "the default font"}`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto("/");
    await page.locator("html").evaluate((element, font) => {
      element.style.fontSize = "200%";
      if (font) element.style.fontFamily = font;
    }, font);

    // Wider glyphs expose text overflow even on hosts with a compact system font.
    for (const element of await page.locator(
      ".brand, h1, .workflow-choice, .workflow-panel label, .field-hint, .primary-action",
    ).all()) {
      expect(await element.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    }

    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
    await page.getByRole("button", { name: "About Verify observation", exact: true }).focus();
    await expectWithinWidth(page.getByRole("tooltip"), 320);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Show Inspect evidence workflow", exact: true }).click();
    await page.getByRole("button", { name: "About Inspect evidence", exact: true }).focus();
    await expectWithinWidth(page.getByRole("tooltip"), 320);
    await page.keyboard.press("Escape");
    await expectWithinWidth(page.locator(".evidence-types label"), 320);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);

    const sequence = page.getByRole("radio", { name: "Verified execution sequence", exact: true });
    await sequence.check();
    await expect(sequence).toBeChecked();
    await page.getByRole("button", { name: "Load example", exact: true }).click();
    await expect(page.getByLabel("Evidence JSON", { exact: true })).not.toHaveValue("");
  });
}
