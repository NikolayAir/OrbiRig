import { readFileSync } from "node:fs";

import { expect, test, type Locator, type Page } from "@playwright/test";

// The JSON fixtures and expected results are written by hand, independently
// of API responses, UI examples and ReferenceSpacecraft.
function evidenceFile(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
}

type Check = readonly [id: string, expected: string, actual: string, outcome: string];

const acceptedChecks: readonly Check[] = [
  ["pre_state_matches_expected", "NOMINAL", "NOMINAL", "PASS"],
  ["acknowledgement_is_accepted", "true", "true", "PASS"],
  ["post_state_matches_requested_mode", "SAFE", "SAFE", "PASS"],
  ["telemetry_matches_post_state", "SAFE", "SAFE", "PASS"],
];

const rejectedChecks: readonly Check[] = [
  ["pre_state_matches_expected", "NOMINAL", "NOMINAL", "PASS"],
  ["acknowledgement_is_rejected", "false", "false", "PASS"],
  ["post_state_matches_pre_state", "NOMINAL", "NOMINAL", "PASS"],
  ["telemetry_matches_post_state", "NOMINAL", "NOMINAL", "PASS"],
];

const mixedChecks: readonly Check[] = [
  ["pre_state_matches_expected", "NOMINAL", "NOMINAL", "PASS"],
  ["acknowledgement_is_accepted", "true", "true", "PASS"],
  ["post_state_matches_requested_mode", "SAFE", "NOMINAL", "FAIL"],
  ["telemetry_matches_post_state", "NOMINAL", "SAFE", "FAIL"],
];

function field(scope: Locator, label: string): Locator {
  return scope.locator("dt").filter({ hasText: label }).locator("+ dd");
}

async function expectOutcome(scope: Locator, label: string, outcome: string) {
  const badge = scope.getByLabel(`${label}: ${outcome}`, { exact: true });
  await expect(badge).toBeVisible();
  await expect(badge).toHaveText(outcome);
}

async function expectChecks(scope: Locator, expected: readonly Check[]) {
  const rows = scope.getByRole("listitem");
  await expect(rows).toHaveCount(expected.length);
  for (const [index, [id, expectedValue, actual, outcome]] of expected.entries()) {
    const row = rows.nth(index);
    await expect(row.locator("code")).toHaveText(id);
    await expect(row.getByRole("heading")).toBeVisible();
    await expect(field(row, "Expected")).toBeVisible();
    await expect(field(row, "Expected")).toHaveText(expectedValue);
    await expect(field(row, "Actual")).toBeVisible();
    await expect(field(row, "Actual")).toHaveText(actual);
    await expectOutcome(row, "Verification check", outcome);
  }
}

async function fillEvidence(input: Locator, evidence: string): Promise<string> {
  await input.fill(evidence);
  const value = await input.inputValue();
  // After fill(), browser builds may preserve CRLF or normalise CRLF/CR to LF.
  // Allow no other changes; requests must preserve the actual textarea value.
  expect([evidence, evidence.replace(/\r\n?/g, "\n")]).toContain(value);
  return value;
}

async function fillVerification(page: Page, scenario: string, evidence: string): Promise<string> {
  await page.getByLabel("Execution ID", { exact: true }).fill("browser-execution");
  await page.getByLabel("Execution time (UTC)", { exact: true }).fill("2026-08-17T08:00:00Z");
  await page.getByLabel("Scenario", { exact: true }).selectOption(scenario);
  return fillEvidence(page.getByLabel("Observation evidence JSON", { exact: true }), evidence);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("page identity loads the product mark alongside its name", async ({ page }) => {
  await expect(page.locator(".brand")).toHaveText("OrbiRig");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Verify observations and inspect evidence",
  );
  const mark = page.locator(".brand img");
  await expect(mark).toHaveAttribute("alt", "");
  await expect(mark).toHaveJSProperty("complete", true);
  expect(await mark.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThanOrEqual(40);
});

test("keyboard workflow selection stays separate from help and preserves edited input", async ({ page, browserName }) => {
  const help = page.getByRole("region", { name: "How it works" });
  const chooser = page.getByRole("group", { name: "Choose a workflow" });
  await expect(help.getByRole("button")).toHaveCount(2);
  await expect(chooser.getByRole("button")).toHaveCount(2);

  await page.getByLabel("Execution ID", { exact: true }).fill("keyboard-review");
  const verify = chooser.getByRole("button", { name: "Show Verify observation workflow" });
  const inspect = chooser.getByRole("button", { name: "Show Inspect evidence workflow" });
  // WebKit on macOS follows native Option-Tab navigation for non-text controls.
  const optionTab = browserName === "webkit" && process.platform === "darwin";
  await verify.focus();
  await expect(verify).toHaveCSS("outline-style", "solid");
  await page.keyboard.press(optionTab ? "Alt+Tab" : "Tab");
  await expect(inspect).toBeFocused();
  await page.keyboard.press("Space");
  await expect(inspect).toHaveAttribute("aria-pressed", "true");
  await expect(verify).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByLabel("Evidence JSON", { exact: true })).toBeVisible();
  await page.keyboard.press(optionTab ? "Alt+Shift+Tab" : "Shift+Tab");
  await expect(verify).toBeFocused();
  await page.keyboard.press("Space");
  await expect(verify).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Execution ID", { exact: true })).toHaveValue("keyboard-review");
});

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 768, height: 1024 },
  { width: 320, height: 800 },
  { width: 390, height: 480 },
  { width: 320, height: 480 },
]) {
  for (const guide of ["In the browser", "From the command line"] as const) {
    test(`${guide} help overlays the page at ${viewport.width}x${viewport.height}`, async ({ page, browserName }) => {
      await page.setViewportSize(viewport);
      const browserTrigger = page.getByRole("button", { name: "In the browser", exact: true });
      const cliTrigger = page.getByRole("button", { name: "From the command line", exact: true });
      const trigger = guide === "In the browser" ? browserTrigger : cliTrigger;
      const otherGuide = guide === "In the browser" ? "From the command line" : "In the browser";
      const otherTrigger = page.getByRole("button", { name: otherGuide, exact: true });
      const help = page.getByRole("dialog", { name: "How it works" });
      const activePanel = help.getByRole("tabpanel", { name: /^(In the browser|From the command line)$/ });
      const chooser = page.getByRole("group", { name: "Choose a workflow" });
      const chooserTop = await chooser.evaluate((element) => element.getBoundingClientRect().top + window.scrollY);

      await expect(page.getByRole("heading", { name: "How it works", level: 2 })).toBeVisible();
      await expect(browserTrigger).toBeVisible();
      await expect(cliTrigger).toBeVisible();
      const browserBounds = (await browserTrigger.boundingBox())!;
      const cliBounds = (await cliTrigger.boundingBox())!;
      // Supporting help uses content-sized controls, which may wrap at narrow widths.
      expect(
        browserBounds.x + browserBounds.width <= cliBounds.x ||
        browserBounds.y + browserBounds.height <= cliBounds.y,
      ).toBe(true);
      for (const bounds of [browserBounds, cliBounds]) {
        expect(bounds.height).toBeGreaterThanOrEqual(24);
        expect(bounds.x).toBeGreaterThanOrEqual(0);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
      }
      const helpBounds = (await page.getByRole("region", { name: "How it works" }).boundingBox())!;
      const chooserBounds = (await chooser.boundingBox())!;
      expect(helpBounds.y + helpBounds.height).toBeLessThan(chooserBounds.y);
      await expect(page.locator("dialog")).toHaveCount(1);
      await expect(page.locator("dialog")).not.toHaveAttribute("open");
      await expect(page.getByRole("dialog")).toBeHidden();

      await page.keyboard.press("Tab");
      await expect(browserTrigger).toBeFocused();
      if (guide === "From the command line") {
        await page.keyboard.press("Tab");
      }
      await expect(trigger).toBeFocused();
      await expect(trigger).toHaveCSS("outline-style", "solid");
      const initialScrollY = await page.evaluate(() => window.scrollY);
      const initialScrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);

      await page.keyboard.press("Enter");
      await expect(help).toBeVisible();
      await expect(help).toHaveAttribute("open");
      const close = help.getByRole("button", { name: "Close", exact: true });
      await expect(close).toBeFocused();
      // Firefox's protocol rounds quad coordinates before subtracting them.
      // Read DOMRect dimensions directly to preserve the strict 44px minimum.
      const closeBounds = await close.evaluate(element => {
        const { width, height } = element.getBoundingClientRect();
        return { width, height };
      });
      expect(closeBounds.width).toBeGreaterThanOrEqual(44);
      expect(closeBounds.height).toBeGreaterThanOrEqual(44);
      await expect(help.getByRole("heading", { name: "How it works", level: 2 })).toBeInViewport();
      const selectedTab = help.getByRole("tab", { name: guide });
      const otherTab = help.getByRole("tab", { name: otherGuide });
      await expect(help.getByRole("tablist", { name: "Help sections" })).toBeVisible();
      await expect(selectedTab).toHaveAttribute("aria-selected", "true");
      await expect(selectedTab).toHaveAttribute("tabindex", "0");
      await expect(otherTab).toHaveAttribute("aria-selected", "false");
      await expect(otherTab).toHaveAttribute("tabindex", "-1");
      await expect(help.getByRole("tabpanel", { name: guide })).toBeVisible();
      const tabBounds = await help.getByRole("tablist", { name: "Help sections" }).getByRole("tab").evaluateAll(elements => elements.map(element => {
        const { x, y, width } = element.getBoundingClientRect();
        return { x, y, width };
      }));
      expect(tabBounds[0].y).toBe(tabBounds[1].y);
      expect(tabBounds[0].x + tabBounds[0].width).toBeLessThanOrEqual(tabBounds[1].x);
      await expect(help.getByRole("heading", { name: otherGuide })).toHaveCount(0);
      expect(await activePanel.evaluate((element) => element.scrollTop)).toBe(0);
      const firstParagraph = help.locator(".workflow-help-content > p").first();
      await expect(firstParagraph).toBeInViewport();
      expect(await chooser.evaluate((element) => element.getBoundingClientRect().top + window.scrollY)).toBe(chooserTop);
      expect(await page.evaluate(() => window.scrollY)).toBe(initialScrollY);
      expect(await help.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
      expect(await activePanel.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
      const bounds = (await help.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.y).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
      const textBounds = (await firstParagraph.boundingBox())!;
      expect(textBounds.x).toBeGreaterThan(bounds.x);
      expect(textBounds.x + textBounds.width).toBeLessThan(bounds.x + bounds.width);

      // Native Tab order can include the dialog itself and browser chrome.
      for (const key of ["Tab", "Shift+Tab"]) {
        await page.keyboard.press(key);
        expect(await help.evaluate((element) =>
          !document.hasFocus() || element.contains(document.activeElement),
        )).toBe(true);
      }
      await close.focus();
      await expect(close).toBeFocused();
      await page.getByLabel("Execution ID", { exact: true }).evaluate((element) => (element as HTMLElement).focus());
      await expect(close).toBeFocused();
      await page.mouse.click(bounds.x + 1, bounds.y + 1);
      await expect(help).toBeVisible();
      if (guide === "In the browser") {
        const webScope = help.getByText(/The web interface verifies and inspects submitted records/);
        await expect(webScope).toHaveText("The web interface verifies and inspects submitted records. It does not connect to a real spacecraft, send spacecraft commands or collect live telemetry.");
        await webScope.scrollIntoViewIfNeeded();
        await expect(webScope).toBeInViewport();
        await expect(help.getByRole("tab", { name: "Verify observation", selected: true })).toBeVisible();
        await expect(help.getByRole("tabpanel", { name: "Inspect evidence" })).toBeHidden();
        await help.getByRole("tab", { name: "Inspect evidence" }).click();
        await expect(help.getByRole("tabpanel", { name: "Verify observation" })).toBeHidden();
        await expect(help.getByRole("tabpanel", { name: "Inspect evidence" })).toBeVisible();
        await expect(help.getByRole("region", { name: "CLI verification command" })).toHaveCount(0);
        await expect(help.getByText(/OrbiRig can verify/)).toHaveCount(0);
        await expect(help.getByRole("link")).toHaveCount(0);
        const browserTabs = help.getByRole("tablist", { name: "Browser instructions" });
        for (const tab of await browserTabs.getByRole("tab").all()) {
          expect((await tab.boundingBox())!.height).toBeGreaterThanOrEqual(44);
        }
        await browserTabs.getByRole("tab", { name: "Inspect evidence" }).focus();
        for (const [key, name] of [
          ["Home", "Verify observation"],
          ["ArrowLeft", "Inspect evidence"],
          ["ArrowRight", "Verify observation"],
          ["End", "Inspect evidence"],
        ]) {
          await activePanel.evaluate(element => { element.scrollTop = element.scrollHeight; });
          await page.keyboard.press(key);
          const selected = browserTabs.getByRole("tab", { name, selected: true });
          await expect(selected).toBeFocused();
          await expect(selected).toHaveCSS("outline-style", "solid");
          await expect(selected).toBeInViewport({ ratio: 1 });
          await expect(help.getByRole("tabpanel", { name }).getByRole("listitem").first()).toBeInViewport();
          await expect(selectedTab).toHaveAttribute("aria-selected", "true");
        }
        await page.keyboard.press("Tab");
        await expect(help.getByRole("tabpanel", { name: "Inspect evidence" })).toBeFocused();
        const inspectionGuidance = help.getByText(/For saved verified executions and sequences/);
        await inspectionGuidance.scrollIntoViewIfNeeded();
        await expect(inspectionGuidance).toBeInViewport();
      } else {
        await expect(help.getByRole("heading", { name: "Verify observation" })).toHaveCount(0);
        await expect(help.getByRole("heading", { name: "Inspect evidence" })).toHaveCount(0);
        await expect(help.getByText(/OrbiRig checks command records/)).toHaveCount(0);

        if (viewport.width === 1280) {
          const lastCodeOffset = await help.getByText(/The command prints JSON evidence/)
            .locator("code").last().evaluate((element) => {
              const previousText = element.previousSibling!;
              const range = document.createRange();
              range.setStart(previousText, previousText.textContent!.lastIndexOf("return"));
              range.setEnd(previousText, previousText.textContent!.length);
              return Math.abs(element.getBoundingClientRect().top - range.getBoundingClientRect().top);
            });
          // Keep the final exit code on the same line as the preceding word.
          expect(lastCodeOffset).toBeLessThan(6);
        }

        // The selected tab and its panel precede the command in the tab order.
        await close.focus();
        await page.keyboard.press("Tab");
        await expect(help.getByRole("tab", { name: guide, selected: true })).toBeFocused();
        await page.keyboard.press("Tab");
        await expect(help.getByRole("tabpanel", { name: guide })).toBeFocused();
        await page.keyboard.press("Tab");
        const command = help.getByRole("region", { name: "CLI verification command" });
        await expect(command).toBeFocused();
        await expect(command).toBeInViewport();
        await expect(command).toHaveCSS("outline-style", "solid");
        await expect(command).toHaveCSS("white-space", "pre-wrap");
        expect(await command.locator("code").textContent()).toBe([
          "uv run --no-sync orbirig verify-observation observation.json \\",
          "  --scenario nominal_to_safe_mode \\",
          "  --execution-id demo-001 \\",
          "  --executed-at 2026-10-21T10:00:00Z",
        ].join("\n"));
        expect(await command.evaluate((element) => getComputedStyle(element).userSelect)).not.toBe("none");
        expect(await command.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
        const selectedCommand = await command.evaluate((element) => {
          const range = document.createRange();
          range.selectNodeContents(element.querySelector("code")!);
          const selection = window.getSelection()!;
          selection.removeAllRanges();
          selection.addRange(range);
          return selection.toString();
        });
        expect(selectedCommand).toBe(await command.textContent());

        // WebKit on macOS uses Option-Tab to include links in keyboard navigation.
        await page.keyboard.press(browserName === "webkit" && process.platform === "darwin" ? "Alt+Tab" : "Tab");
        const readme = help.getByRole("link", { name: "CLI setup and full instructions" });
        await expect(readme).toBeFocused();
        await expect(readme).toBeInViewport();
        await expect(readme).toHaveCSS("outline-style", "solid");
        await expect(readme).toHaveAttribute("href", "https://github.com/NikolayAir/OrbiRig#verify-a-saved-observation-from-the-command-line");
      }
      expect(await firstParagraph.evaluate((element) => getComputedStyle(element).userSelect)).not.toBe("none");
      expect(await help.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(initialScrollWidth);

      await activePanel.evaluate((element) => { element.scrollTop = element.scrollHeight; });
      if (viewport.width <= 390) {
        expect(await activePanel.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
      }
      await expect(close).toBeInViewport();

      await expect(selectedTab).toBeInViewport();
      await expect(otherTab).toBeInViewport();
      await otherTab.click();
      await expect(help).toHaveAttribute("open");
      await expect(otherTab).toHaveAttribute("aria-selected", "true");
      await expect(help.getByRole("tabpanel", { name: otherGuide })).toBeVisible();
      expect(await activePanel.evaluate(element => element.scrollTop)).toBe(0);

      for (const [key, name] of [
        ["ArrowRight", guide],
        ["End", "From the command line"],
        ["Home", "In the browser"],
        ["ArrowLeft", "From the command line"],
        ["ArrowRight", "In the browser"],
      ]) {
        await page.keyboard.press(key);
        await expect(help.getByRole("tab", { name, selected: true })).toBeFocused();
        await expect(help.getByRole("tabpanel", { name })).toBeVisible();
        expect(await activePanel.evaluate(element => element.scrollTop)).toBe(0);
      }
      await page.keyboard.press("Tab");
      const focusedPanel = help.getByRole("tabpanel", { name: "In the browser" });
      await expect(focusedPanel).toBeFocused();
      const focusedParagraphBounds = (await focusedPanel.locator("p").first().boundingBox())!;
      const navigationBounds = (await help.locator(".workflow-help-header").boundingBox())!;
      expect(focusedParagraphBounds.y).toBeGreaterThanOrEqual(navigationBounds.y + navigationBounds.height);
      await page.keyboard.press("Shift+Tab");
      await expect(help.getByRole("tab", { name: "In the browser", selected: true })).toBeFocused();
      expect(await help.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);

      await close.click();
      await expect(help).toBeHidden();
      await expect(trigger).toBeFocused();

      await page.keyboard.press("Space");
      await expect(help).toBeVisible();
      expect(await activePanel.evaluate((element) => element.scrollTop)).toBe(0);
      await expect(firstParagraph).toBeInViewport();
      await page.keyboard.press("Escape");
      await expect(help).toBeHidden();
      await expect(trigger).toBeFocused();

      await trigger.click();
      await page.mouse.click(2, 2);
      await expect(help).toBeHidden();
      await expect(trigger).toBeFocused();

      await otherTrigger.click();
      const otherHelp = page.getByRole("dialog", { name: "How it works" });
      await expect(otherHelp).toBeVisible();
      await expect(otherHelp.getByRole("tab", { name: otherGuide, selected: true })).toBeVisible();
      expect(await otherHelp.getByRole("tabpanel", { name: otherGuide }).evaluate((element) => element.scrollTop)).toBe(0);
      await expect(otherHelp.getByRole("heading", { name: guide })).toHaveCount(0);
      await otherHelp.getByRole("button", { name: "Close", exact: true }).click();
      await expect(otherHelp).toBeHidden();
      await expect(otherTrigger).toBeFocused();
      expect(await chooser.evaluate((element) => element.getBoundingClientRect().top + window.scrollY)).toBe(chooserTop);
    });
  }
}

test.describe("Touch browser instructions", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test.skip(({ browserName }) => browserName === "firefox", "Firefox does not support Playwright touch emulation.");

  test("switches instructions by touch without changing the form", async ({ page }) => {
    await page.getByLabel("Execution ID", { exact: true }).fill("touch-preserved");
    await page.getByRole("button", { name: "In the browser", exact: true }).tap();
    const help = page.getByRole("dialog", { name: "How it works" });
    for (const name of ["Inspect evidence", "Verify observation"]) {
      const tab = help.getByRole("tab", { name, exact: true });
      await tab.tap();
      await expect(tab).toHaveAttribute("aria-selected", "true");
      await expect(tab).toBeInViewport({ ratio: 1 });
      await expect(help.getByRole("tabpanel", { name })).toBeVisible();
    }
    await help.getByRole("button", { name: "Close", exact: true }).tap();
    await expect(page.getByLabel("Execution ID", { exact: true })).toHaveValue("touch-preserved");
    await expect(page.getByRole("button", { name: "Show Verify observation workflow" })).toHaveAttribute("aria-pressed", "true");
  });
});

for (const guide of ["In the browser", "From the command line"] as const) {
  test(`${guide} help preserves form inputs and completed results`, async ({ page }) => {
    const evidence = evidenceFile("accepted.json");
    const submittedText = await fillVerification(page, "nominal_to_safe_mode", evidence);
    const trigger = page.getByRole("button", { name: guide, exact: true });
    const help = page.getByRole("dialog", { name: "How it works" });
    const close = help.getByRole("button", { name: "Close", exact: true });
    async function browseInstructions(workflow: "Verify observation" | "Inspect evidence") {
      await trigger.click();
      await help.getByRole("tab", { name: "In the browser", exact: true }).click();
      await expect(help.getByRole("tab", { name: workflow, selected: true })).toBeVisible();
      const other = workflow === "Verify observation" ? "Inspect evidence" : "Verify observation";
      await help.getByRole("tab", { name: other, exact: true }).click();
      await help.getByRole("tab", { name: "From the command line" }).click();
      await expect(help.getByRole("tablist", { name: "Browser instructions" })).toHaveCount(0);
      await help.getByRole("tab", { name: "In the browser", exact: true }).click();
      await expect(help.getByRole("tab", { name: other, selected: true })).toBeVisible();
      await close.click();
      await expect(page.getByRole("button", { name: `Show ${workflow} workflow` })).toHaveAttribute("aria-pressed", "true");
    }
    await browseInstructions("Verify observation");

    await page.getByRole("button", { name: "Verify observation", exact: true }).click();
    const verification = page.getByRole("region", { name: "Verified execution", exact: true });
    await expectOutcome(verification, "Verification outcome", "PASS");
    await browseInstructions("Verify observation");
    await expect(verification).toBeVisible();

    await page.getByRole("button", { name: "Show Inspect evidence workflow" }).click();
    await fillEvidence(page.getByLabel("Evidence JSON", { exact: true }), evidence);
    await browseInstructions("Inspect evidence");
    await page.getByRole("button", { name: "Inspect evidence", exact: true }).click();
    const inspection = page.getByRole("region", { name: "Observation details", exact: true });
    await expect(field(inspection, "Acknowledgement")).toHaveText("Accepted");
    await expect(page.getByLabel(/^Verification (outcome|check):/)).toHaveCount(0);
    await browseInstructions("Inspect evidence");
    await expect(inspection).toBeVisible();

    await page.getByRole("button", { name: "Show Verify observation workflow" }).click();
    await expect(page.getByLabel("Execution ID", { exact: true })).toHaveValue("browser-execution");
    await expect(page.getByLabel("Execution time (UTC)", { exact: true })).toHaveValue("2026-08-17T08:00:00Z");
    await expect(page.getByLabel("Scenario", { exact: true })).toHaveValue("nominal_to_safe_mode");
    await expect(page.getByLabel("Observation evidence JSON", { exact: true })).toHaveValue(submittedText);
    await expectOutcome(verification, "Verification outcome", "PASS");

    await page.getByRole("button", { name: "Show Inspect evidence workflow" }).click();
    await expect(page.getByLabel("Evidence JSON", { exact: true })).toHaveValue(submittedText);
    await expect(field(inspection, "Acknowledgement")).toHaveText("Accepted");
  });
}

for (const example of [
  {
    name: "the same rejection fails against an explicitly selected accepted transition",
    fixture: "rejected.json",
    scenario: "safe_to_nominal_mode",
    outcome: "FAIL",
    acknowledgement: "Rejected",
    checks: [
      ["pre_state_matches_expected", "SAFE", "NOMINAL", "FAIL"],
      ["acknowledgement_is_accepted", "true", "false", "FAIL"],
      ["post_state_matches_requested_mode", "NOMINAL", "NOMINAL", "PASS"],
      ["telemetry_matches_post_state", "NOMINAL", "NOMINAL", "PASS"],
    ] satisfies readonly Check[],
  },
  {
    name: "accepted command passes verification",
    fixture: "accepted.json",
    scenario: "nominal_to_safe_mode",
    outcome: "PASS",
    acknowledgement: "Accepted",
    checks: acceptedChecks,
  },
  {
    name: "expected command rejection passes verification",
    fixture: "rejected.json",
    scenario: "nominal_to_nominal_rejection",
    outcome: "PASS",
    acknowledgement: "Rejected",
    checks: rejectedChecks,
  },
  {
    name: "valid observation with incorrect behaviour fails verification",
    fixture: "incorrect-behaviour.json",
    scenario: "nominal_to_safe_mode",
    outcome: "FAIL",
    acknowledgement: "Rejected",
    checks: [
      ["pre_state_matches_expected", "NOMINAL", "SAFE", "FAIL"],
      ["acknowledgement_is_accepted", "true", "false", "FAIL"],
      ["post_state_matches_requested_mode", "SAFE", "NOMINAL", "FAIL"],
      ["telemetry_matches_post_state", "NOMINAL", "SAFE", "FAIL"],
    ] satisfies readonly Check[],
  },
  {
    name: "failed verification shows both passing and failing checks",
    fixture: "mixed-results.json",
    scenario: "nominal_to_safe_mode",
    outcome: "FAIL",
    acknowledgement: "Accepted",
    checks: mixedChecks,
  },
]) {
  test(example.name, async ({ page }) => {
    const submittedText = await fillVerification(page, example.scenario, evidenceFile(example.fixture));
    const responsePromise = page.waitForResponse("**/api/verify/observation");
    await page.getByRole("button", { name: "Verify observation", exact: true }).click();
    const response = await responsePromise;

    expect(response.status()).toBe(200);
    expect(response.request().postDataJSON()).toEqual({
      execution_id: "browser-execution",
      executed_at: "2026-08-17T08:00:00Z",
      scenario_id: example.scenario,
      observation_evidence: submittedText,
    });

    const result = page.getByRole("region", { name: "Verified execution", exact: true });
    await expect(result).toBeVisible();
    await expect(field(result, "Execution ID")).toHaveText("browser-execution");
    await expect(field(result, "Execution time (UTC)")).toHaveText("2026-08-17T08:00:00Z");
    await expect(field(result, "Scenario")).toHaveText(example.scenario);
    await expect(field(result, "Acknowledgement")).toHaveText(example.acknowledgement);
    await expectOutcome(result, "Verification outcome", example.outcome);
    await expectChecks(result, example.checks);
    await expect(page.getByRole("alert")).toHaveCount(0);
  });
}

// JSON.parse would keep only the last value for a repeated key. Read this fixture
// as text; .txt avoids editor warnings about the intentionally repeated key.
const duplicateKeyEvidence = evidenceFile("duplicate-keys.json.txt").replace(/\r\n?/g, "\n");

for (const invalid of [
  { name: "malformed JSON", text: '{"evidence_format_version":' },
  // Test both LF and CRLF, even when Git changes line endings during checkout.
  { name: "nested duplicate keys with LF line endings", text: duplicateKeyEvidence },
  { name: "nested duplicate keys with CRLF line endings", text: duplicateKeyEvidence.replace(/\n/g, "\r\n") },
]) {
  test(`verification reports an input error for ${invalid.name} and preserves the submitted text`, async ({ page }) => {
    const submittedText = await fillVerification(page, "nominal_to_safe_mode", invalid.text);
    const responsePromise = page.waitForResponse("**/api/verify/observation");
    await page.getByRole("button", { name: "Verify observation", exact: true }).click();
    const response = await responsePromise;

    expect(response.status()).toBe(422);
    expect(response.request().postDataJSON().observation_evidence).toBe(submittedText);
    await expect(page.getByRole("alert").locator("strong")).toHaveText("Input error");
    await expect(page.getByRole("alert").locator("span")).toHaveText("The observation evidence is invalid.");
    await expect(page.getByRole("region", { name: "Verified execution", exact: true })).toHaveCount(0);
    await expect(page.getByLabel(/^Verification (outcome|check):/)).toHaveCount(0);
  });

  test(`inspection reports an input error for ${invalid.name} and preserves the submitted text`, async ({ page }) => {
    await page.getByRole("button", { name: "Show Inspect evidence workflow", exact: true }).click();
    const submittedText = await fillEvidence(page.getByLabel("Evidence JSON", { exact: true }), invalid.text);
    const responsePromise = page.waitForResponse("**/api/inspect/observation");
    await page.getByRole("button", { name: "Inspect evidence", exact: true }).click();
    const response = await responsePromise;

    expect(response.status()).toBe(422);
    expect(response.request().postData()).toBe(submittedText);
    expect(response.request().headers()["content-type"]).toBe("text/plain; charset=utf-8");
    await expect(page.getByRole("alert").locator("strong")).toHaveText("Invalid evidence");
    await expect(page.getByRole("alert").locator("span")).toHaveText("The observation evidence is invalid.");
    await expect(page.getByRole("region", { name: "Observation details", exact: true })).toHaveCount(0);
    await expect(page.getByLabel(/^Verification (outcome|check):/)).toHaveCount(0);
  });
}

test("sequence keeps input order and reports a mode mismatch even though every record passes", async ({ page }) => {
  await page.getByRole("button", { name: "Show Inspect evidence workflow", exact: true }).click();
  await page.getByRole("radio", { name: "Verified execution sequence", exact: true }).check();
  const submittedText = await fillEvidence(
    page.getByLabel("Evidence JSON", { exact: true }), evidenceFile("discontinuous-sequence.json"),
  );
  const responsePromise = page.waitForResponse("**/api/inspect/verified-execution-sequence");
  await page.getByRole("button", { name: "Inspect evidence", exact: true }).click();
  const response = await responsePromise;

  expect(response.status()).toBe(200);
  expect(response.request().postData()).toBe(submittedText);
  expect(response.request().headers()["content-type"]).toBe("text/plain; charset=utf-8");

  const sequence = page.getByRole("region", { name: "Verified execution sequence", exact: true });
  await expectOutcome(sequence, "Sequence outcome", "FAIL");
  const flow = sequence.getByRole("list", { name: "Sequence member records and continuity checks", exact: true });
  await expect(flow.getByRole("heading", { level: 4 })).toHaveText([
    "Member 1", "Continuity check 1", "Member 2", "Continuity check 2", "Member 3",
  ]);

  // Input order b/a/c differs from ID order a/b/c and timestamp order a/c/b.
  const members = [
    ["exec-b", "2026-08-17T14:00:00Z", "nominal_to_safe_mode", acceptedChecks],
    ["exec-a", "2026-08-17T10:00:00Z", "nominal_to_nominal_rejection", rejectedChecks],
    ["exec-c", "2026-08-17T12:00:00Z", "nominal_to_safe_mode", acceptedChecks],
  ] as const;
  for (const [index, [id, timestamp, scenario, checks]] of members.entries()) {
    const member = flow.getByRole("article", { name: `Member ${index + 1}`, exact: true });
    await expect(field(member, "Execution ID")).toHaveText(id);
    await expect(field(member, "Execution time (UTC)")).toHaveText(timestamp);
    await expect(field(member, "Scenario")).toHaveText(scenario);
    await expectOutcome(member, "Verification outcome", "PASS");
    await expectChecks(member, checks);
  }

  const boundaries = [
    ["exec-b", "exec-a", "SAFE", "NOMINAL", "FAIL"],
    ["exec-a", "exec-c", "NOMINAL", "NOMINAL", "PASS"],
  ];
  for (const [index, [previous, next, expected, observed, outcome]] of boundaries.entries()) {
    const boundary = flow.getByRole("article", { name: `Continuity check ${index + 1}`, exact: true });
    await expect(field(boundary, "Connected executions")).toHaveText(
      `Previous execution ID: ${previous} → Next execution ID: ${next}`,
    );
    await expect(field(boundary, "Expected operating mode")).toHaveText(expected);
    await expect(field(boundary, "Observed operating mode")).toHaveText(observed);
    await expectOutcome(boundary, "Continuity outcome", outcome);
  }
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("observation inspection shows reported behaviour without claiming verification", async ({ page }) => {
  await page.getByRole("button", { name: "Show Inspect evidence workflow", exact: true }).click();
  const submittedText = await fillEvidence(
    page.getByLabel("Evidence JSON", { exact: true }), evidenceFile("incorrect-behaviour.json"),
  );
  const responsePromise = page.waitForResponse("**/api/inspect/observation");
  await page.getByRole("button", { name: "Inspect evidence", exact: true }).click();
  const response = await responsePromise;

  expect(response.status()).toBe(200);
  expect(response.request().postData()).toBe(submittedText);
  const observation = page.getByRole("region", { name: "Observation details", exact: true });
  await expect(observation.getByText("Valid observation evidence", { exact: true })).toBeVisible();
  await expect(observation.getByText("These are reported values. No scenario verification has been performed.")).toBeVisible();
  await expect(observation).toBeVisible();
  for (const [label, value] of [
    ["Command type", "SET_OPERATING_MODE"],
    ["Target mode", "SAFE"],
    ["Pre-state operating mode", "SAFE"],
    ["Acknowledgement", "Rejected"],
    ["Post-state operating mode", "NOMINAL"],
    ["Telemetry operating mode", "SAFE"],
  ]) {
    await expect(field(observation, label)).toHaveText(value);
  }
  await expect(page.getByLabel(/^Verification (outcome|check):/)).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("verified execution inspection accepts canonical FAIL evidence", async ({ page }) => {
  await page.getByRole("button", { name: "Show Inspect evidence workflow", exact: true }).click();
  await page.getByRole("radio", { name: "Verified execution", exact: true }).check();
  const submittedText = await fillEvidence(
    page.getByLabel("Evidence JSON", { exact: true }), evidenceFile("failed-execution.json"),
  );
  const responsePromise = page.waitForResponse("**/api/inspect/verified-execution");
  await page.getByRole("button", { name: "Inspect evidence", exact: true }).click();
  const response = await responsePromise;

  expect(response.status()).toBe(200);
  expect(response.request().postData()).toBe(submittedText);
  expect(response.request().headers()["content-type"]).toBe("text/plain; charset=utf-8");
  const record = page.getByRole("region", { name: "Verified execution", exact: true });
  await expect(record.getByText("Valid saved evidence", { exact: true })).toBeVisible();
  await expect(field(record, "Execution ID")).toHaveText("exec-review-Δ");
  await expect(field(record, "Execution time (UTC)")).toHaveText("2026-08-17T08:00:00Z");
  await expect(field(record, "Scenario")).toHaveText("nominal_to_safe_mode");
  await expectOutcome(record, "Verification outcome", "FAIL");
  await expectChecks(record, mixedChecks);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

for (const invalid of [
  {
    type: "Verified execution",
    endpoint: "verified-execution",
    fixture: "failed-execution.json",
    error: "The verified-execution evidence is invalid.",
  },
  {
    type: "Verified execution sequence",
    endpoint: "verified-execution-sequence",
    fixture: "discontinuous-sequence.json",
    error: "The verified-execution-sequence evidence is invalid.",
  },
]) {
  test(`${invalid.endpoint} inspection rejects a stored outcome that contradicts the evidence`, async ({ page }) => {
    await page.getByRole("button", { name: "Show Inspect evidence workflow", exact: true }).click();
    await page.getByRole("radio", { name: invalid.type, exact: true }).check();
    const originalEvidence = evidenceFile(invalid.fixture);
    // Change only the fixture's final top-level outcome; the underlying evidence still implies FAIL.
    const aggregateOutcome = /(\r?\n  "outcome": )"FAIL"(\r?\n}\s*)$/;
    expect(originalEvidence, "The fixture must end with a top-level FAIL outcome").toMatch(aggregateOutcome);
    const evidence = originalEvidence.replace(aggregateOutcome, '$1"PASS"$2');
    const submittedText = await fillEvidence(page.getByLabel("Evidence JSON", { exact: true }), evidence);
    const responsePromise = page.waitForResponse(`**/api/inspect/${invalid.endpoint}`);
    await page.getByRole("button", { name: "Inspect evidence", exact: true }).click();
    const response = await responsePromise;

    expect(response.status()).toBe(422);
    expect(response.request().postData()).toBe(submittedText);
    await expect(page.getByRole("alert").locator("strong")).toHaveText("Invalid evidence");
    await expect(page.getByRole("alert").locator("span")).toHaveText(invalid.error);
    await expect(page.getByRole("region", { name: invalid.type, exact: true })).toHaveCount(0);
    await expect(page.getByLabel(/^(Verification (outcome|check)|Sequence outcome|Continuity outcome):/)).toHaveCount(0);
  });
}
