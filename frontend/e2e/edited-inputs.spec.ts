import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const failed = readFileSync(new URL("./fixtures/incorrect-behaviour.json", import.meta.url), "utf8");
const savedFail = readFileSync(new URL("./fixtures/failed-execution.json", import.meta.url), "utf8");

async function prepare(page: Page, inspection = false) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  if (inspection) await page.getByRole("button", { name: "Show Inspect evidence" }).click();
  await page.getByRole("button", { name: "Load example", exact: true }).click();
}

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
    await page.addStyleTag({ content: ":root { font-size: 200%; }" });
    await page.getByLabel("Observation evidence JSON", { exact: true }).fill(failed);
    await page.locator("button[type=submit]").click();
    await expect(page.getByLabel("Verification outcome: FAIL", { exact: true })).toBeVisible();
    await expect(page.locator(".action-status")).toHaveText("Verification completed.");
    await testInfo.attach("completed-fail", { body: await page.locator("#verification-workflow").screenshot(), contentType: "image/png" });
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
