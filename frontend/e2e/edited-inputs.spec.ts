import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const accepted = readFileSync(new URL("./fixtures/accepted.json", import.meta.url), "utf8");
const failed = readFileSync(new URL("./fixtures/incorrect-behaviour.json", import.meta.url), "utf8");
const savedFail = readFileSync(new URL("./fixtures/failed-execution.json", import.meta.url), "utf8");
const verificationChanged = "Inputs changed. Verify again to check the current values.";
const inspectionChanged = "Inputs changed. Inspect again to check the current evidence.";

async function prepare(page: Page, inspection = false) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  if (inspection) await page.getByRole("button", { name: "Show Inspect evidence" }).click();
  await page.getByRole("button", { name: "Load example", exact: true }).click();
}

for (const field of ["Execution ID", "Execution time (UTC)", "Scenario", "Observation evidence JSON", "Evidence JSON", "Evidence type"]) {
  test(`editing ${field} clears the result and requires a new request even after restoring it`, async ({ page }) => {
    const inspection = field === "Evidence JSON" || field === "Evidence type";
    await prepare(page, inspection);
    const editor = page.getByLabel(inspection ? "Evidence JSON" : "Observation evidence JSON", { exact: true });
    await editor.fill(accepted);
    let requests = 0;
    page.on("request", request => { if (new URL(request.url()).pathname.startsWith("/api/")) requests++; });
    await page.getByRole("button", { name: inspection ? "Inspect evidence" : "Verify observation", exact: true }).click();
    const result = page.getByRole("region", { name: inspection ? "Observation details" : "Verified execution", exact: true });
    await expect(result).toBeVisible();
    const reminder = inspection ? inspectionChanged : verificationChanged;
    if (field === "Evidence type") {
      await page.getByRole("radio", { name: "Verified execution", exact: true }).check();
      await expect(result).toHaveCount(0);
      await page.getByRole("radio", { name: "Observation", exact: true }).check();
    } else {
      const input = page.getByLabel(field, { exact: true });
      const original = await input.inputValue();
      await input.focus();
      if (field === "Scenario") await input.selectOption("safe_to_nominal_mode");
      else await input.fill(`${original} `);
      await expect(result).toHaveCount(0);
      await expect(input).toBeFocused();
      if (field === "Scenario") await input.selectOption(original);
      else await input.fill(original);
    }
    await expect(page.locator(".action-status")).toHaveText(reminder);
    expect(requests).toBe(1);
    await expect(result).toHaveCount(0);
    await page.getByRole("button", { name: inspection ? "Inspect again" : "Verify again", exact: true }).click();
    await expect(result).toBeVisible();
    await expect(page.locator(".action-status")).toHaveText(inspection ? "Inspection completed. Evidence is valid." : "Verification completed.");
    if (!inspection) await expect(result.getByLabel("Verification outcome: PASS", { exact: true })).toBeVisible();
    expect(requests).toBe(2);
  });
}

for (const inspection of [false, true]) {
  test(`${inspection ? "inspection" : "verification"} announces the first edit once and keeps keyboard focus`, async ({ page }) => {
    await prepare(page, inspection);
    await page.locator("button[type=submit]").click();
    await expect(page.locator(".workflow-feedback h2").first()).toBeFocused();
    const editor = page.getByLabel(inspection ? "Evidence JSON" : "Observation evidence JSON", { exact: true });
    await editor.focus();
    await page.evaluate(() => {
      const messages: string[] = [];
      Object.assign(window, { inputAnnouncements: messages });
      const status = document.querySelector('[role="status"]')!;
      new MutationObserver(() => messages.push(status.textContent!)).observe(status, { subtree: true, childList: true, characterData: true });
    });
    await page.keyboard.press("End");
    await page.keyboard.type("   ");
    await expect(editor).toBeFocused();
    await expect(page.locator(".workflow-feedback h2")).toHaveCount(0);
    const expected = inspection ? inspectionChanged : verificationChanged;
    await expect(page.getByRole("status")).toHaveText(expected);
    expect(await page.evaluate(() => (window as Window & { inputAnnouncements?: string[] }).inputAnnouncements)).toEqual([expected]);
  });
}

test("edited and completed states stay independent when switching tasks", async ({ page }) => {
  await prepare(page);
  await page.locator("button[type=submit]").click();
  await expect(page.getByRole("region", { name: "Verified execution", exact: true })).toBeVisible();
  await page.getByLabel("Execution ID", { exact: true }).fill("edited-execution");
  await page.getByRole("button", { name: "Show Inspect evidence" }).click();
  await page.getByRole("radio", { name: "Verified execution", exact: true }).check();
  await page.getByLabel("Evidence JSON", { exact: true }).fill(savedFail);
  await page.locator("button[type=submit]").click();
  await expect(page.getByLabel("Verification outcome: FAIL", { exact: true })).toBeVisible();
  await expect(page.locator(".action-status")).toHaveText("Inspection completed. Evidence is valid.");
  await page.getByRole("button", { name: "Show Verify observation" }).click();
  await expect(page.locator(".action-status")).toHaveText(verificationChanged);
  await expect(page.getByLabel("Execution ID", { exact: true })).toHaveValue("edited-execution");
  await expect(page.locator(".workflow-feedback h2")).toHaveCount(0);
  await page.getByRole("button", { name: "Show Inspect evidence" }).click();
  await expect(page.getByLabel("Verification outcome: FAIL", { exact: true })).toBeVisible();
  await page.getByLabel("Evidence JSON", { exact: true }).fill(`${savedFail}\n`);
  await expect(page.locator(".action-status")).toHaveText(inspectionChanged);
  await page.getByRole("button", { name: "Show Verify observation" }).click();
  await expect(page.locator(".action-status")).toHaveText(verificationChanged);
});

test("empty inspection JSON focuses the field without an HTTP request", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Show Inspect evidence" }).click();
  let requests = 0;
  page.on("request", request => { if (new URL(request.url()).pathname.startsWith("/api/")) requests++; });
  for (const value of ["", " \n\t "]) {
    await page.getByLabel("Evidence JSON", { exact: true }).fill(value);
    await page.locator("button[type=submit]").focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("alert")).toHaveText("Evidence JSON is required.");
    await expect(page.getByLabel("Evidence JSON", { exact: true })).toBeFocused();
    await expect(page.getByLabel("Evidence JSON", { exact: true })).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator(".action-status")).toHaveCount(0);
  }
  expect(requests).toBe(0);
});

for (const width of [320, 1280]) {
  test(`action feedback wraps at ${width}px with doubled text size`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 800 });
    await prepare(page);
    // Use a wide font on every platform: narrower system fonts can hide a split label.
    await page.addStyleTag({ content: ':root { font-family: Verdana, "DejaVu Sans", sans-serif; font-size: 200%; }' });
    await page.getByLabel("Observation evidence JSON", { exact: true }).fill(failed);
    await page.locator("button[type=submit]").click();
    await expect(page.getByLabel("Verification outcome: FAIL", { exact: true })).toBeVisible();
    await expect(page.locator(".action-status")).toHaveText("Verification completed.");
    await testInfo.attach("completed-fail", { body: await page.locator("#verification-workflow").screenshot(), contentType: "image/png" });
    await page.getByLabel("Execution ID", { exact: true }).fill("edited");
    await expect(page.locator(".action-status")).toHaveText(verificationChanged);
    const actions = page.locator(".form-actions");
    await actions.scrollIntoViewIfNeeded();
    await expect(page.getByRole("button", { name: "Verify again", exact: true })).toBeInViewport();
    await expect(page.locator(".action-status")).toBeInViewport();
    for (const element of await actions.locator("button, p").all()) {
      expect(await element.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await testInfo.attach("edited-inputs", { body: await actions.screenshot(), contentType: "image/png" });
    await page.getByRole("button", { name: "Show Inspect evidence" }).click();
    await page.getByRole("radio", { name: "Verified execution", exact: true }).check();
    await page.getByLabel("Evidence JSON", { exact: true }).fill(savedFail);
    await page.locator("button[type=submit]").click();
    await expect(page.getByLabel("Verification outcome: FAIL", { exact: true })).toBeVisible();
    await expect(page.locator(".action-status")).toHaveText("Inspection completed. Evidence is valid.");
    const inspect = page.getByRole("button", { name: "Inspect again", exact: true });
    // Keep the action word readable rather than splitting "Inspect" across lines.
    expect(await inspect.evaluate(button => {
      const range = document.createRange();
      range.setStart(button.firstChild!, 0);
      range.setEnd(button.firstChild!, "Inspect".length);
      return range.getClientRects().length;
    })).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  });
}
