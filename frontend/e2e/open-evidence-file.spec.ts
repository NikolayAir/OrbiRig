import { readFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";

function fixture(name: string): Buffer {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url));
}

async function chooseFile(page: Page, buffer: Buffer, openPicker: (button: Locator) => Promise<void> = button => button.click()) {
  const open = page.getByRole("button", { name: "Open JSON file", exact: true });
  const choosing = page.waitForEvent("filechooser");
  await openPicker(open);
  await (await choosing).setFiles({ name: "evidence.json", mimeType: "application/json", buffer });
}

const mobileWidths = [320, 375, 393, 414, 440];
for (const { scale, widths } of [
  { scale: 100, widths: [...mobileWidths, 1440] },
  { scale: 200, widths: [...mobileWidths, 1440, 2560] },
]) for (const width of widths) {
  test(`Open JSON file fits both editors at ${width}px with ${scale}% text`, async ({ page, browserName }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    if (scale === 200) {
      await page.addStyleTag({ content: ':root { font-size: 200%; font-family: Verdana, "DejaVu Sans", sans-serif; }' });
    }
    const tab = browserName === "webkit" && process.platform === "darwin" ? "Alt+Tab" : "Tab";
    const wide = (width === 1440 && scale === 100) || width === 2560;

    for (const field of ["Observation evidence JSON", "Evidence JSON"]) {
      if (field === "Evidence JSON") {
        await page.getByRole("button", { name: "Show Inspect evidence", exact: true }).click();
      }
      const open = page.getByRole("button", { name: "Open JSON file", exact: true });
      const text = open.locator(".evidence-file-action-label");
      await expect(open.locator("svg")).toBeVisible();
      if (width === 320 || (scale === 200 && mobileWidths.includes(width))) {
        await expect(text).toBeHidden();
      }
      if (wide) {
        await expect(text).toBeVisible();
      }
      await page.getByRole("button", { name: `About ${field}`, exact: true }).focus();
      await expect(page.getByRole("tooltip")).toBeVisible();
      await page.keyboard.press(tab);
      await expect(open).toBeFocused();
      await expect(open).toHaveCSS("outline-style", "solid");
      const position = await open.evaluate(button => {
        const heading = button.parentElement!;
        const label = heading.querySelector("label")!;
        const text = label.firstChild!;
        const range = document.createRange();
        const fragmented = Array.from(text.textContent!.matchAll(/\S+/g)).some(word => {
          range.setStart(text, word.index);
          range.setEnd(text, word.index + word[0].length);
          return range.getClientRects().length > 1;
        });
        range.selectNodeContents(label);
        const labelLines = range.getClientRects().length;
        const box = button.getBoundingClientRect();
        const reference = label.getBoundingClientRect();
        const help = heading.querySelector(".field-help-button")!.getBoundingClientRect();
        const tooltip = heading.querySelector('[role="tooltip"]')!.getBoundingClientRect();
        const style = getComputedStyle(button);
        const outline = parseFloat(style.outlineOffset) + parseFloat(style.outlineWidth);
        return {
          width: box.width,
          height: box.height,
          beside: box.left >= reference.right - 0.5 && box.top < reference.bottom && box.bottom > reference.top,
          below: box.top >= reference.bottom,
          besideHelp: box.left >= help.right - 0.5 && box.top < help.bottom && box.bottom > help.top,
          focusFits: box.left >= outline && box.right + outline <= window.innerWidth,
          tooltipClearsButton: tooltip.top >= box.bottom,
          fragmented,
          labelLines,
          scrollWidth: document.documentElement.scrollWidth,
        };
      });
      expect(position.width).toBeGreaterThanOrEqual(44);
      expect(position.height).toBeGreaterThanOrEqual(44);
      expect(position.beside || (scale === 200 && position.below)).toBe(true);
      if (scale === 100 || width === 320) expect(position.besideHelp).toBe(true);
      expect(position.focusFits).toBe(true);
      expect(position.tooltipClearsButton).toBe(true);
      expect(position.fragmented).toBe(false);
      if (wide) expect(position.labelLines).toBe(1);
      expect(position.scrollWidth).toBe(width);
    }
  });
}

test("a file with repeated JSON fields is sent as read and rejected by inspection", async ({ page }) => {
  const text = fixture("duplicate-keys.json.txt").toString("utf8").replaceAll("\n", "\r\n");
  const file = Buffer.from(text);
  const requests: string[] = [];
  page.on("request", request => {
    if (new URL(request.url()).pathname.startsWith("/api/")) requests.push(request.url());
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Show Inspect evidence", exact: true }).click();
  await chooseFile(page, file);

  await expect(page.getByLabel("Evidence JSON", { exact: true })).toHaveValue(text.replaceAll("\r\n", "\n"));
  await expect(page.getByText("File opened.", { exact: true })).toBeVisible();
  expect(requests).toHaveLength(0);

  const submitted = page.waitForResponse("**/api/inspect/observation");
  await page.getByRole("button", { name: "Inspect evidence", exact: true }).click();
  const response = await submitted;
  expect(response.status()).toBe(422);
  expect(response.request().postDataBuffer()).toEqual(file);
  await expect(page.getByRole("alert")).toContainText("JSON contains a repeated field name");
  await expect(page.getByRole("region", { name: "Observation details", exact: true })).toHaveCount(0);
});

test.describe("Opening an observation by touch", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test("loads only the observation and waits for explicit verification", async ({ page }) => {
    const metadata = {
      execution_id: "imported-rejection",
      executed_at: "2026-08-17T08:00:00Z",
      scenario_id: "nominal_to_nominal_rejection",
    };
    const text = fixture("rejected.json").toString("utf8").replaceAll("\n", "\r\n");
    const apiRequests: string[] = [];
    page.on("request", request => {
      if (new URL(request.url()).pathname.startsWith("/api/")) apiRequests.push(request.url());
    });
    await page.goto("/");
    const executionId = page.getByLabel("Execution ID", { exact: true });
    const executedAt = page.getByLabel("Execution time (UTC)", { exact: true });
    const scenario = page.getByLabel("Scenario", { exact: true });
    await executionId.fill(metadata.execution_id);
    await executedAt.fill(metadata.executed_at);
    await scenario.selectOption(metadata.scenario_id);
    await chooseFile(page, Buffer.from(text), button => button.tap());

    await expect(page.getByLabel("Observation evidence JSON", { exact: true })).toHaveValue(text.replaceAll("\r\n", "\n"));
    await expect(executionId).toHaveValue(metadata.execution_id);
    await expect(executedAt).toHaveValue(metadata.executed_at);
    await expect(scenario).toHaveValue(metadata.scenario_id);
    expect(apiRequests).toHaveLength(0);

    const submitted = page.waitForResponse("**/api/verify/observation");
    await page.getByRole("button", { name: "Verify observation", exact: true }).tap();
    const response = await submitted;
    expect(response.status()).toBe(200);
    expect(response.request().postDataJSON()).toEqual({ ...metadata, observation_evidence: text });
    await expect(page.getByText("Verification outcome: PASS")).toBeVisible();
  });
});

for (const [workflow, field] of [
  ["Inspect evidence", "Evidence JSON"],
  ["Verify observation", "Observation evidence JSON"],
] as const) {
  test(`the same file can be chosen again after cancelling replacement with Escape in ${workflow}`, async ({ page, browserName }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto("/");
    if (workflow === "Inspect evidence") {
      await page.getByRole("button", { name: "Show Inspect evidence", exact: true }).click();
    }
    await page.addStyleTag({ content: ':root { font-family: Verdana, "DejaVu Sans", sans-serif; font-size: 200%; }' });
    const input = page.getByLabel(field, { exact: true });
    const open = page.getByRole("button", { name: "Open JSON file", exact: true });
    const tab = browserName === "webkit" && process.platform === "darwin" ? "Alt+Tab" : "Tab";
    await input.fill("edited draft");
    await page.getByRole("button", { name: `About ${field}`, exact: true }).focus();
    await page.keyboard.press(tab);
    await expect(open).toBeFocused();
    await expect(open).toHaveCSS("outline-style", "solid");
    await expect(open.locator("svg")).toHaveAttribute("aria-hidden", "true");
    expect(await open.evaluate(button => button.scrollWidth <= button.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);

    const file = fixture("accepted.json");
    const confirmation = page.getByRole("dialog", { name: `Replace ${field}?`, exact: true });
    await chooseFile(page, file, button => button.press("Enter"));
    await expect(confirmation.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
    await expect(input).toHaveValue("edited draft");
    await page.keyboard.press("Escape");
    await expect(confirmation).toHaveCount(0);
    await expect(input).toHaveValue("edited draft");
    await expect(open).toBeFocused();

    await chooseFile(page, file, button => button.press("Enter"));
    await expect(confirmation.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
    await page.keyboard.press(tab);
    await expect(confirmation.getByRole("button", { name: `Replace ${field}`, exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(confirmation).toHaveCount(0);
    await expect(input).toHaveValue(file.toString("utf8"));
    await expect(open).toBeFocused();
    await expect(page.getByRole("button", { name: workflow, exact: true })).toBeEnabled();
  });

  test(`closing file replacement after a resize brings the button into view in ${workflow}`, async ({ page, browserName }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    if (workflow === "Inspect evidence") {
      await page.getByRole("button", { name: "Show Inspect evidence", exact: true }).click();
    }
    const input = page.getByLabel(field, { exact: true });
    const open = page.getByRole("button", { name: "Open JSON file", exact: true });
    await input.fill("edited draft");
    const tab = browserName === "webkit" && process.platform === "darwin" ? "Alt+Tab" : "Tab";
    await page.getByRole("button", { name: `About ${field}`, exact: true }).focus();
    await page.keyboard.press(tab);
    await expect(open).toBeFocused();
    await chooseFile(page, fixture("accepted.json"), button => button.press("Enter"));
    const confirmation = page.getByRole("dialog", { name: `Replace ${field}?`, exact: true });
    await expect(confirmation.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();

    await page.setViewportSize({ width: 320, height: 480 });
    await page.keyboard.press("Escape");
    await expect(confirmation).toHaveCount(0);
    await expect(open).toBeFocused();
    await expect(open).toBeInViewport({ ratio: 1 });
    await expect(open).toHaveCSS("outline-style", "solid");
    await expect(input).toHaveValue("edited draft");
  });
}
