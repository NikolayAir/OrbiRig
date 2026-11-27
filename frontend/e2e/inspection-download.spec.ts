import { readFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";

import { chooseExample } from "./example-support";

const DOWNLOAD = "Download evidence JSON";

async function openEvidenceFile(page: Page, name: string, buffer: Buffer, replaceEdited = false) {
  const choosing = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Open JSON file", exact: true }).click();
  await (await choosing).setFiles({ name, mimeType: "application/json", buffer });
  if (replaceEdited) {
    await page.getByRole("button", { name: "Replace Evidence JSON", exact: true }).click();
  }
  await expect(page.getByText("File opened.", { exact: true })).toBeVisible();
}

async function inspect(page: Page, endpoint: string, submitted: Buffer) {
  const pending = page.waitForResponse(`**/api/inspect/${endpoint}`);
  await page.getByRole("button", { name: "Inspect evidence", exact: true }).click();
  const response = await pending;
  expect(response.status()).toBe(200);
  expect(response.request().postDataBuffer()?.equals(submitted)).toBe(true);
}

async function downloadFile(page: Page, filename: string, activate: () => Promise<void>) {
  const pending = page.waitForEvent("download");
  await activate();
  const download = await pending;
  expect(download.suggestedFilename()).toBe(filename);
  expect(await download.failure()).toBeNull();
  return readFileSync((await download.path())!);
}

async function expectResultLayout(result: Locator, width: number, stacked: boolean) {
  const { overview, title, action, badge, description, pageWidth } = await result.evaluate(section => {
    const bounds = (selector: string) => section.querySelector(selector)?.getBoundingClientRect().toJSON();
    return {
      overview: bounds(".result-overview")!,
      title: bounds(".result-title h2")!,
      action: bounds(".result-actions button")!,
      badge: bounds(".result-title > .outcome-badge"),
      description: bounds(".result-description")!,
      pageWidth: document.documentElement.scrollWidth,
    };
  });
  expect(pageWidth).toBe(width);
  expect(action.width).toBeGreaterThanOrEqual(44);
  expect(action.height).toBeGreaterThanOrEqual(44);
  expect(action.left).toBeGreaterThanOrEqual(overview.left);
  expect(action.right).toBeLessThanOrEqual(overview.right + 0.05);
  if (stacked) {
    expect(action.top).toBeGreaterThan(description.bottom);
  } else {
    expect(action.right).toBeCloseTo(overview.right, 1);
    expect(action.top).toBeLessThan(title.bottom);
    expect(action.bottom).toBeGreaterThan(title.top);
    expect(action.left).toBeGreaterThan(badge?.right ?? title.right);
    expect(description.top).toBeGreaterThan(action.bottom);
  }
  return { title, badge };
}

async function enlargeNightText(page: Page) {
  await page.getByRole("combobox", { name: "Color theme" }).selectOption("night");
  await page.getByRole("combobox", { name: "Text size" }).selectOption("large");
  await page.locator("html").evaluate(root => { root.style.fontSize = "calc(200% * var(--text-scale))"; });
  await expect(page.locator("html")).toHaveCSS("font-size", "36px");
}

for (const [type, endpoint, heading, example, outcome, width] of [
  ["Observation", "observation", "Observation details", "Standard example", null, 390],
  ["Verified execution", "verified-execution", "Verified execution", "Standard example", "Verification outcome: PASS", 1440],
  ["Verified execution", "verified-execution", "Verified execution", "Failing example", "Verification outcome: FAIL", 320],
  ["Verified execution sequence", "verified-execution-sequence", "Verified execution sequence", "Standard example", "Sequence outcome: PASS", 1440],
  ["Verified execution sequence", "verified-execution-sequence", "Verified execution sequence", "Long sequence", "Sequence outcome: FAIL", 1440],
] as const) {
  test(`downloads and reopens the inspected ${type} ${example.toLowerCase()}`, async ({ page, browserName }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    if (width === 320) await enlargeNightText(page);

    await page.getByRole("button", { name: "Show Inspect evidence", exact: true }).click();
    await page.getByRole("radio", { name: type, exact: true }).check();
    await chooseExample(page, example);
    const editor = page.getByLabel("Evidence JSON", { exact: true });
    const text = (await editor.inputValue()).trimEnd().replaceAll("\n", "\r\n");
    const source = Buffer.from(` \t\r\n${text}\r\n\r\n `);
    const filename = `orbirig-${endpoint}.json`;
    await openEvidenceFile(page, "source.json", source);

    const requests: string[] = [];
    page.on("request", request => {
      if (new URL(request.url()).pathname.startsWith("/api/")) requests.push(request.url());
    });
    await inspect(page, endpoint, source);

    const result = page.getByRole("region", { name: heading, exact: true });
    const resultHeading = result.getByRole("heading", { name: heading, exact: true });
    const action = result.getByRole("button", { name: DOWNLOAD, exact: true });
    const context = outcome === null ? "Valid observation evidence" : "Valid saved evidence";
    await expect(result.getByText(context, { exact: true })).toBeVisible();
    if (outcome === null) {
      await expect(result.locator(".outcome-badge")).toHaveCount(0);
    } else {
      await expect(result.getByText(outcome, { exact: true })).toBeVisible();
    }
    await expect(action).toBeVisible();
    await expectResultLayout(result, width, width < 1440);
    await expect(resultHeading).toBeFocused();
    await page.keyboard.press(browserName === "webkit" && process.platform === "darwin" ? "Alt+Tab" : "Tab");
    await expect(action).toBeFocused();
    await expect(action).toHaveCSS("outline-style", "solid");

    if (example === "Long sequence") {
      await result.getByRole("button", { name: "Next page", exact: true }).first().click();
      await expect(result.locator(".sequence-page-status")).toHaveText("Showing members 26–50 of 100.");
      const paged = await downloadFile(page, filename, () => action.click());
      expect(paged.equals(source)).toBe(true);

      await result.getByRole("checkbox", { name: "Show failures and related records" }).check();
      await expect(result.locator(".sequence-page-status")).toContainText("Showing matching members");
      const details = result.getByRole("button", { name: /^(Show|Hide) details for member / }).first();
      await details.click();
      await expect(details).toHaveAttribute("aria-expanded", "true");
    }

    const saved = await downloadFile(page, filename, () => example === "Long sequence"
      ? action.click()
      : page.keyboard.press("Enter"));
    expect(saved.equals(source)).toBe(true);
    expect(requests).toHaveLength(1);

    await editor.fill("");
    await expect(action).toHaveCount(0);
    await openEvidenceFile(page, filename, saved, true);
    await inspect(page, endpoint, source);
    await expect(result.getByText(context, { exact: true })).toBeVisible();
    if (outcome !== null) await expect(result.getByText(outcome, { exact: true })).toBeVisible();
    if (example === "Long sequence") {
      await expect(result.locator(".sequence-page-status")).toHaveText("Showing members 1–25 of 100.");
      await page.setViewportSize({ width: 320, height: 900 });
      await enlargeNightText(page);
      await expectResultLayout(result, 320, true);
    }
    await expect(action).toBeEnabled();
    expect(requests).toHaveLength(2);
  });
}

test("keeps the sequence outcome beside its heading at intermediate widths", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.locator("html").evaluate(root => {
    root.style.fontFamily = 'Verdana, "DejaVu Sans", sans-serif';
  });
  await page.getByRole("button", { name: "Show Inspect evidence", exact: true }).click();
  await page.getByRole("radio", { name: "Verified execution sequence", exact: true }).check();
  await chooseExample(page);
  await page.getByRole("button", { name: "Inspect evidence", exact: true }).click();
  const result = page.getByRole("region", { name: "Verified execution sequence", exact: true });
  await expect(result.getByRole("button", { name: DOWNLOAD })).toBeVisible();

  for (const [width, stacked] of [[768, true], [900, false]] as const) {
    await page.setViewportSize({ width, height: 900 });
    const { title, badge } = await expectResultLayout(result, width, stacked);
    expect(badge.left).toBeGreaterThan(title.right);
    expect(badge.top).toBeLessThan(title.bottom);
    expect(badge.bottom).toBeGreaterThan(title.top);
  }
});

test.describe("Inspect evidence download by touch", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test("saves a valid observation by tapping the download button", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Show Inspect evidence", exact: true }).tap();
    await chooseExample(page);
    const source = Buffer.from(await page.getByLabel("Evidence JSON", { exact: true }).inputValue());
    await inspect(page, "observation", source);

    const action = page.getByRole("button", { name: DOWNLOAD, exact: true });
    const saved = await downloadFile(page, "orbirig-observation.json", () => action.tap());
    expect(saved.equals(source)).toBe(true);
  });
});
