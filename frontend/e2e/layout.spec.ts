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

async function recordNextClick(input: Locator) {
  return input.evaluateHandle(element => {
    const hits: boolean[] = [];
    document.addEventListener("click", event => hits.push(event.target === element), { capture: true, once: true });
    return hits;
  });
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
      const introductionLines = await page.locator(".page-header > p:not(.brand):not(.field-hint)").evaluate(element => {
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
      const firstLabel = (await page.locator('label[for="verification-execution-id"]').boundingBox())!;
      const evidenceLabel = (await page.locator('label[for="verification-observation-evidence"]').boundingBox())!;
      expect(firstLabel.y).toBeCloseTo(evidenceLabel.y, 0);
      expect(actionBounds.x + actionBounds.width).toBeCloseTo(editorBounds.x + editorBounds.width, 0);
      expect(actionBounds.width).toBeLessThan(editorBounds.width);
      expect(actionBounds.y - (editorBounds.y + editorBounds.height)).toBeCloseTo(16, 0);
      expect(editorBounds.x).toBeGreaterThan(metadataBounds.x + metadataBounds.width);
      expect(editorBounds.y).toBeLessThan(metadataBounds.y + metadataBounds.height);
      expect(editorBounds.width).toBeGreaterThanOrEqual(580);
      expect(editorBounds.width / metadataBounds.width).toBeCloseTo(1.35, 1);
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
    for (const name of ["About Execution ID", "About Scenario", "About Observation evidence JSON"]) {
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
    await expect(result.locator(".outcome-badge").filter({ hasText: "Verification outcome: FAIL" })).toBeInViewport();
    await expect(result.getByText(longId, { exact: true })).toBeVisible();
    await expect(result.getByText("Verification result", { exact: true })).toBeVisible();
    const postState = result.getByRole("listitem").filter({ has: page.getByText("post_state_matches_requested_mode", { exact: true }) });
    await expect(postState.locator("dt").filter({ hasText: /^Expected$/ }).locator("+ dd")).toHaveText("SAFE");
    await expect(postState.locator("dt").filter({ hasText: /^Actual$/ }).locator("+ dd")).toHaveText("NOMINAL");
    await expect(postState.locator(".outcome-badge").filter({ hasText: "Verification check: FAIL" })).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expectWithinWidth(result.locator("dd, code, .outcome-badge"), viewport.width);
    expect(await result.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);

    await page.getByRole("button", { name: "Show Inspect evidence", exact: true }).click();
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
      expect(inspectionEditorBounds.width).toBeGreaterThanOrEqual(580);
      expect(inspectionEditorBounds.width / types.width).toBeCloseTo(1.35, 1);
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
    await expect(inspected.locator(".outcome-badge").filter({ hasText: "Sequence outcome: FAIL" })).toBeInViewport();
    await expect(inspected.getByText("Valid saved evidence", { exact: true })).toBeVisible();
    const boundary = inspected.getByRole("article", { name: "Continuity check 1", exact: true });
    await expect(boundary.locator(".outcome-badge").filter({ hasText: "Continuity outcome: FAIL" })).toBeVisible();
    await boundary.getByRole("button", { name: /Show details for continuity check 1/ }).click();
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
    await page.getByRole("button", { name: "Show Inspect evidence", exact: true }).click();
    await page.getByRole("button", { name: "Load example", exact: true }).click();
    const editor = page.getByLabel("Evidence JSON", { exact: true });
    const observationText = await editor.inputValue();
    const observation = page.getByRole("radio", { name: "Observation", exact: true });
    await expect(observation).toBeChecked();
    await observation.focus();
    for (const [name, description] of [
      ["Verified execution", "One execution with its selected scenario and verification checks."],
      ["Verified execution sequence", "Ordered records; each should start where the last ended."],
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
    await expect(page.getByRole("button", { name: "About Evidence JSON", exact: true })).toBeFocused();
    await page.keyboard.press(browserName === "webkit" && process.platform === "darwin" ? "Alt+Tab" : "Tab");
    await expect(editor).toBeFocused();
    await editor.fill(sequence);
    await page.keyboard.press(browserName === "webkit" && process.platform === "darwin" ? "Alt+Tab" : "Tab");
    const action = page.getByRole("button", { name: "Inspect evidence", exact: true });
    await expect(action).toBeFocused();
    await expect(action).toBeInViewport();
    await page.keyboard.press("Enter");
    const result = page.getByRole("region", { name: "Verified execution sequence", exact: true });
    await expect(result.locator(".outcome-badge").filter({ hasText: "Sequence outcome: FAIL" })).toBeInViewport();
    await expect(result.getByRole("heading", { name: "Verified execution sequence", exact: true })).toBeFocused();
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
      page.getByRole("button", { name: "About Observation evidence JSON", exact: true }),
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
    await expect(result.locator(".outcome-badge").filter({ hasText: "Verification outcome: PASS" })).toBeInViewport();
    await expect(result.getByRole("heading", { name: "Verified execution", exact: true })).toBeFocused();
  });
}

for (const { width, textScale } of [
  { width: 1440, textScale: 100 },
  { width: 390, textScale: 100 },
  { width: 320, textScale: 100 },
  { width: 320, textScale: 200 },
]) {
  for (const [field, helpId] of [
    ["Execution ID", "execution-id-help-description"],
    ["Scenario", "scenario-help-description"],
    ["Observation evidence JSON", "verification-observation-hint"],
    ["Evidence JSON", "inspection-evidence-hint"],
  ]) {
    test(`${field} help remains readable across the hover gap at ${width}px with ${textScale}% text`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      if (field === "Evidence JSON") await page.getByRole("button", { name: "Show Inspect evidence", exact: true }).click();
      await page.locator("html").evaluate((element, scale) => { element.style.fontSize = `${scale}%`; }, textScale);
      const input = page.getByLabel(field, { exact: true });
      const preserved = field === "Scenario" ? "nominal_to_safe_mode" : "preserved-through-hover";
      if (field === "Scenario") {
        await input.selectOption(preserved);
        await input.focus();
      } else {
        await input.fill(preserved);
      }
      const help = page.getByRole("button", { name: `About ${field}`, exact: true });
      const tooltip = page.locator(`#${helpId}`);
      // Start reading from the middle of the viewport; edge positioning is a separate concern.
      await help.evaluate(element => element.scrollIntoView({ block: "center" }));
      const positions = () => page.locator(".workflow-panel input, .workflow-panel select, .workflow-panel textarea, .workflow-panel button").evaluateAll(elements => elements.map(element => {
        const bounds = element.getBoundingClientRect();
        return { x: bounds.x + window.scrollX, y: bounds.y + window.scrollY, width: bounds.width, height: bounds.height };
      }));
      const initialPositions = await positions();
      const expectStablePositions = async () => {
        const current = await positions();
        expect(current).toHaveLength(initialPositions.length);
        for (const [index, bounds] of current.entries()) {
          for (const key of ["x", "y", "width", "height"] as const) {
            // Scrolling can alter floating-point precision without moving the document layout.
            expect(bounds[key]).toBeCloseTo(initialPositions[index][key], 2);
          }
        }
      };
      await help.hover();
      await expect(tooltip).toBeVisible();
      await expectStablePositions();
      await expect(help.locator("..")).toHaveAttribute("data-open", "false");
      await expect(input).toBeFocused();
      await expectWithinWidth(tooltip, width);
      const buttonBounds = (await help.boundingBox())!;
      const textBounds = (await tooltip.boundingBox())!;
      const x = buttonBounds.x + buttonBounds.width / 2;
      // Cross the actual gap without a locator retry or focus pinning the help.
      await page.mouse.move(x, (buttonBounds.y + buttonBounds.height + textBounds.y) / 2);
      await expect(tooltip).toBeVisible();
      const viewportHeight = page.viewportSize()!.height;
      const visibleTop = Math.max(0, textBounds.y);
      const visibleBottom = Math.min(viewportHeight, textBounds.y + textBounds.height);
      expect(visibleBottom).toBeGreaterThan(visibleTop);
      await page.mouse.move(textBounds.x + textBounds.width / 2, visibleTop + Math.min(20, (visibleBottom - visibleTop) / 2), { steps: 5 });
      await expect(tooltip).toBeVisible();
      const lastLine = () => tooltip.evaluate(element => {
        const range = document.createRange();
        range.selectNodeContents(element);
        const bounds = [...range.getClientRects()].at(-1)!;
        return { top: bounds.top, bottom: bounds.bottom };
      });
      // Read long guidance using wheel input while the pointer stays over its text.
      while ((await lastLine()).bottom > viewportHeight - 12) {
        const scrollY = await page.evaluate(() => window.scrollY);
        await page.mouse.wheel(0, 120);
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(scrollY);
        await expect(tooltip).toBeVisible();
      }
      expect((await lastLine()).top).toBeGreaterThanOrEqual(0);
      await expect(help.locator("..")).toHaveAttribute("data-open", "false");
      await expect(input).toBeFocused();
      await page.mouse.move(0, 0);
      await expect(tooltip).toBeHidden();
      // Hover-only help must also let a normal click reach the editor or dropdown beneath it.
      await input.scrollIntoViewIfNeeded();
      await help.hover();
      const hoverPoint = await input.evaluate(element => {
        const bounds = element.getBoundingClientRect();
        return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
      });
      const hoverClicks = await recordNextClick(input);
      await page.mouse.move(hoverPoint.x, hoverPoint.y);
      await page.mouse.click(hoverPoint.x, hoverPoint.y);
      expect(await hoverClicks.jsonValue()).toEqual([true]);
      await expect(input).toBeFocused();
      await expect(tooltip).toBeHidden();
      await expectStablePositions();
      if (field === "Scenario") await page.keyboard.press("Escape");
      await help.hover();
      await expect(tooltip).toBeVisible();
      // The hover gap must leave the lower edge of the trigger usable.
      const clickBounds = (await help.boundingBox())!;
      const clickX = clickBounds.x + clickBounds.width / 2;
      await page.mouse.click(clickX, clickBounds.y + clickBounds.height - 2);
      await expect(help.locator("..")).toHaveAttribute("data-open", "true");
      await page.mouse.click(clickX, clickBounds.y + clickBounds.height - 2);
      await expect(tooltip).toBeHidden();
      await page.mouse.click(clickX, clickBounds.y + clickBounds.height - 2);
      await expect(help.locator("..")).toHaveAttribute("data-open", "true");
      await input.scrollIntoViewIfNeeded();
      const point = await input.evaluate(element => {
        const bounds = element.getBoundingClientRect();
        return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
      });
      const clicks = await recordNextClick(input);
      await page.mouse.move(point.x, point.y);
      await page.mouse.click(point.x, point.y);
      expect(await clicks.jsonValue()).toEqual([true]);
      await expect(input).toBeFocused();
      await expect(tooltip).toBeHidden();
      if (field === "Scenario") await page.keyboard.press("Escape");
      await page.mouse.move(0, 0);
      await help.hover();
      await expect(tooltip).toBeVisible();
      await page.mouse.move(0, 0);
      await input.focus();
      await expect(tooltip).toBeHidden();
      await expect(input).toHaveValue(preserved);
    });
  }
}

test("reading enlarged help does not open another help button beneath its text", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/");
  await page.locator("html").evaluate(element => { element.style.fontSize = "200%"; });
  const help = page.getByRole("button", { name: "About Scenario", exact: true });
  await help.evaluate(element => element.scrollIntoView({ block: "center" }));
  await help.hover();
  const description = page.locator("#scenario-help-description");
  const otherHelp = page.getByRole("button", { name: "About Observation evidence JSON", exact: true });
  await otherHelp.scrollIntoViewIfNeeded();
  const point = await otherHelp.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  });
  expect(await description.evaluate((element, point) => {
    const bounds = element.getBoundingClientRect();
    return point.x >= bounds.left && point.x <= bounds.right && point.y >= bounds.top && point.y <= bounds.bottom;
  }, point)).toBe(true);
  await page.mouse.move(point.x, point.y);
  await expect(description).toBeVisible();
  await expect(page.locator("#verification-observation-hint")).toBeHidden();
  // An intentional click still reaches the underlying button and switches help.
  const clicks = await recordNextClick(otherHelp);
  await page.mouse.click(point.x, point.y);
  expect(await clicks.jsonValue()).toEqual([true]);
  await expect(description).toBeHidden();
  await expect(page.locator("#verification-observation-hint")).toBeVisible();
});

for (const [field, helpId] of [
  ["Execution ID", "execution-id-help-description"],
  ["Scenario", "scenario-help-description"],
  ["Observation evidence JSON", "verification-observation-hint"],
  ["Evidence JSON", "inspection-evidence-hint"],
]) {
  test(`${field} help dismisses with Escape under a stationary pointer and reopens deliberately`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    if (field === "Evidence JSON") await page.getByRole("button", { name: "Show Inspect evidence", exact: true }).click();
    const input = page.getByLabel(field === "Evidence JSON" ? field : "Execution ID", { exact: true });
    await input.fill("preserved-through-help");
    const help = page.getByRole("button", { name: `About ${field}`, exact: true });
    const tooltip = page.locator(`#${helpId}`);
    await expect(tooltip).toBeHidden();
    await help.hover();
    await expect(tooltip).toBeVisible();
    await help.click();
    await expect(help.locator("..")).toHaveAttribute("data-open", "true");
    // Do not move the pointer between opening the tooltip and pressing Escape.
    await page.keyboard.press("Escape");
    await expect(tooltip).toBeHidden();
    expect(await help.evaluate(element => element.matches(":hover"))).toBe(true);
    await expect(help.locator("..")).toHaveAttribute("data-open", "false");

    const bounds = (await help.boundingBox())!;
    await page.mouse.move(bounds.x + bounds.width / 2 + 1, bounds.y + bounds.height / 2);
    await expect(tooltip).toBeHidden();
    await help.click();
    await expect(tooltip).toBeVisible();
    // Move the pointer and focus away so the click alone keeps the help open.
    await page.mouse.move(0, 0);
    await input.focus();
    await expect(input).toBeFocused();
    await expect(tooltip).toBeVisible();
    await help.click();
    await expect(tooltip).toBeHidden();

    // Hover-only dismissal also works while focus stays in the form input.
    await input.focus();
    await page.mouse.move(0, 0);
    await help.hover();
    await expect(tooltip).toBeVisible();
    await expect(input).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(tooltip).toBeHidden();
    await expect(input).toBeFocused();
    await page.mouse.move(0, 0);
    await help.hover();
    await expect(tooltip).toBeVisible();
    await expect(input).toHaveValue("preserved-through-help");
  });

  test(`${field} help dismisses and reopens by keyboard without losing focus`, async ({ page, browserName }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    if (field === "Evidence JSON") await page.getByRole("button", { name: "Show Inspect evidence", exact: true }).click();
    const help = page.getByRole("button", { name: `About ${field}`, exact: true });
    const tooltip = page.locator(`#${helpId}`);
    const optionTab = browserName === "webkit" && process.platform === "darwin";
    const tab = optionTab ? "Alt+Tab" : "Tab";
    // Reach the trigger using the keyboard only, including WebKit's macOS convention.
    for (let index = 0; index < 15 && !await help.evaluate(element => document.activeElement === element); index++) {
      await page.keyboard.press(tab);
    }
    await expect(help).toBeFocused();
    await expect(tooltip).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(tooltip).toBeHidden();
    await expect(help).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(tooltip).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(tooltip).toBeHidden();
    await expect(help).toBeFocused();
    await page.keyboard.press("Space");
    await expect(tooltip).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(tooltip).toBeHidden();
    await expect(help).toBeFocused();
    await page.keyboard.press(tab);
    await expect(page.getByLabel(field, { exact: true })).toBeFocused();
    await page.keyboard.press(optionTab ? "Alt+Shift+Tab" : "Shift+Tab");
    await expect(help).toBeFocused();
    await expect(tooltip).toBeVisible();
  });

  for (const isMobile of [false, true]) {
    test(`${field} help toggles and reopens with touch${isMobile ? " in mobile emulation" : ""}`, async ({ browser, baseURL, browserName }) => {
      test.skip(isMobile && browserName === "firefox", "Firefox does not support Playwright mobile emulation.");
      const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile });
      try {
        const page = await context.newPage();
        await page.goto("/");
        if (field === "Evidence JSON") await page.getByRole("button", { name: "Show Inspect evidence", exact: true }).click();
        const help = page.getByRole("button", { name: `About ${field}`, exact: true });
        const tooltip = page.locator(`#${helpId}`);
        await help.tap();
        await expect(tooltip).toBeVisible();
        await help.tap();
        await expect(tooltip).toBeHidden();
        await help.tap();
        await expect(tooltip).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(tooltip).toBeHidden();
        await help.tap();
        await expect(tooltip).toBeVisible();
        const input = page.getByLabel(field, { exact: true });
        await input.scrollIntoViewIfNeeded();
        expect(await input.evaluate(element => {
          const bounds = element.getBoundingClientRect();
          return document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2) === element;
        })).toBe(true);
        await input.tap();
        await expect(input).toBeFocused();
        await expect(tooltip).toBeHidden();
      } finally {
        await context.close();
      }
    });
  }
}

for (const { width, scale } of [
  { width: 1440, scale: 100 },
  { width: 390, scale: 100 },
  { width: 320, scale: 100 },
  { width: 320, scale: 200 },
]) {
  for (const [title, headingId, inputLabel] of [
    ["Verify observation", "observation-verification", "Execution ID"],
    ["Inspect evidence", "evidence-inspection", "Evidence JSON"],
  ]) {
    test(`${title} heading leaves the form stable on hover at ${width}px with ${scale}% text`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      await page.locator("html").evaluate((element, scale) => { element.style.fontSize = `${scale}%`; }, scale);
      if (title === "Inspect evidence") await page.getByRole("button", { name: "Show Inspect evidence", exact: true }).click();
      const region = page.getByRole("region", { name: title, exact: true });
      const heading = region.getByRole("heading", { name: title, level: 2, exact: true });
      await expect(heading).toHaveAttribute("id", headingId);
      await expect(region).toHaveAttribute("aria-labelledby", headingId);
      const input = region.getByLabel(inputLabel, { exact: true });
      await input.fill("preserved-through-heading-hover");
      await heading.scrollIntoViewIfNeeded();
      const fields = region.locator("input, select, textarea");
      const fieldPositions = () => fields.evaluateAll(elements => elements.map(element => {
        const bounds = element.getBoundingClientRect();
        return { x: bounds.x + window.scrollX, y: bounds.y + window.scrollY, width: bounds.width, height: bounds.height };
      }));
      const initialPositions = await fieldPositions();
      await heading.hover();
      // Include the space beside the title where the introduction button used to appear.
      const bounds = (await heading.boundingBox())!;
      await page.mouse.move(Math.min(width - 1, bounds.x + bounds.width + 10), bounds.y + bounds.height / 2);
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
      expect(await fieldPositions()).toEqual(initialPositions);
      await page.mouse.move(0, 0);
      expect(await fieldPositions()).toEqual(initialPositions);
      await expect(page.getByRole("button", { name: `About ${title}`, exact: true })).toHaveCount(0);
      await expect(page.locator("#verification-help-description, #inspection-help-description")).toHaveCount(0);

      await input.scrollIntoViewIfNeeded();
      const point = await input.evaluate(element => {
        const bounds = element.getBoundingClientRect();
        return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
      });
      const clicks = await recordNextClick(input);
      await page.mouse.move(point.x, point.y);
      await page.mouse.click(point.x, point.y);
      expect(await clicks.jsonValue()).toEqual([true]);
      await expect(input).toBeFocused();
      await expect(input).toHaveValue("preserved-through-heading-hover");
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    });
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
    await page.getByRole("button", { name: "About Observation evidence JSON", exact: true }).focus();
    await expectWithinWidth(page.getByRole("tooltip"), 320);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Show Inspect evidence", exact: true }).click();
    await page.getByRole("button", { name: "About Evidence JSON", exact: true }).focus();
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
