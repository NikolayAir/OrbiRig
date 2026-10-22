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
  { width: 1280, height: 800 },
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
    for (const name of ["About Execution ID", "About Scenario"]) {
      await page.getByRole("button", { name, exact: true }).focus();
      const tooltip = page.getByRole("tooltip");
      await expect(tooltip).toBeVisible();
      await expectWithinWidth(tooltip, viewport.width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width);
      await page.keyboard.press("Escape");
      await expect(tooltip).toBeHidden();
    }

    await page.getByRole("button", { name: "Verify observation", exact: true }).click();
    const executionId = page.getByLabel("Execution ID", { exact: true });
    await expect(executionId).toBeFocused();
    await expect(executionId).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByRole("alert")).toHaveCount(4);

    const example = page.getByRole("button", { name: "Load example", exact: true });
    await expect(example).toHaveAccessibleDescription("Replaces all form inputs");
    const exampleBounds = (await example.boundingBox())!;
    const inputBounds = (await executionId.boundingBox())!;
    expect(exampleBounds.y + exampleBounds.height).toBeLessThan(inputBounds.y);
    await example.click();
    await expect(executionId).toHaveValue("example-execution-001");
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Verified execution", exact: true })).toHaveCount(0);

    const longId = `review-${"record".repeat(20)}-Δ`;
    await executionId.fill(longId);
    await page.getByLabel("Execution time (UTC)", { exact: true }).fill("2026-08-17T08:00:00Z");
    await page.getByLabel("Scenario", { exact: true }).selectOption("nominal_to_safe_mode");
    await page.getByLabel("Observation evidence JSON", { exact: true }).fill(observation);
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
    await page.getByRole("radio", { name: "Verified execution sequence", exact: true }).check();
    await page.getByLabel("Evidence JSON", { exact: true }).fill(sequence);
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

test("forms reflow with doubled text at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/");
  await page.locator("html").evaluate(element => { element.style.fontSize = "200%"; });

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await page.getByRole("button", { name: "Show Inspect evidence workflow", exact: true }).click();
  await expectWithinWidth(page.locator(".evidence-types label"), 320);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);

  const sequence = page.getByRole("radio", { name: "Verified execution sequence", exact: true });
  await sequence.check();
  await expect(sequence).toBeChecked();
  await page.getByRole("button", { name: "Load example", exact: true }).click();
  await expect(page.getByLabel("Evidence JSON", { exact: true })).not.toHaveValue("");
});
