import { readFileSync } from "node:fs";

import { expect, test, type Download, type Locator, type Page } from "@playwright/test";

// Fixed fixtures and expectations let these tests check both the displayed
// result and the downloaded file independently of the verifier.
function observationFile(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
}

const FILE_NAME = "orbirig-verified-execution.json";
// Wider fonts expose word breaks that a narrower system font can hide.
const ENLARGED_TEXT = ':root { font-family: Verdana, "DejaVu Sans", sans-serif; font-size: 200%; }';

type Check = readonly [id: string, expected: string, actual: string, outcome: string];

// Values are keyed by the label shown beside them, so a swapped or renamed label
// fails a test even when the values stay in the same order.
type ResultView = {
  execution: Record<string, string>;
  observation: Record<string, string>;
  checks: Check[];
  outcome: string;
};

const passingView: ResultView = {
  execution: {
    "Execution ID": "browser-execution",
    "Execution time (UTC)": "2026-08-17T08:00:00Z",
    "Scenario": "nominal_to_safe_mode",
  },
  observation: {
    "Command type": "SET_OPERATING_MODE",
    "Target mode": "SAFE",
    "Starting mode": "NOMINAL",
    "Acknowledgement": "Accepted",
    "Ending mode": "SAFE",
    "Mode reported by telemetry": "SAFE",
  },
  checks: [
    ["pre_state_matches_expected", "NOMINAL", "NOMINAL", "PASS"],
    ["acknowledgement_is_accepted", "Accepted", "Accepted", "PASS"],
    ["post_state_matches_requested_mode", "SAFE", "SAFE", "PASS"],
    ["telemetry_matches_post_state", "SAFE", "SAFE", "PASS"],
  ],
  outcome: "PASS",
};

// The saved form of the passing result, in the field order of the format reference.
const passingEvidence = {
  schema_version: 1,
  execution: {
    execution_id: "browser-execution",
    scenario_id: "nominal_to_safe_mode",
    executed_at: "2026-08-17T08:00:00Z",
  },
  observation: {
    command: { command_type: "SET_OPERATING_MODE", target_mode: "SAFE" },
    pre_state: { operating_mode: "NOMINAL" },
    acknowledgement: { accepted: true },
    post_state: { operating_mode: "SAFE" },
    telemetry: { operating_mode: "SAFE" },
  },
  invariant_results: [
    { invariant_id: "pre_state_matches_expected", passed: true, expected: "NOMINAL", actual: "NOMINAL" },
    { invariant_id: "acknowledgement_is_accepted", passed: true, expected: true, actual: true },
    { invariant_id: "post_state_matches_requested_mode", passed: true, expected: "SAFE", actual: "SAFE" },
    { invariant_id: "telemetry_matches_post_state", passed: true, expected: "SAFE", actual: "SAFE" },
  ],
  outcome: "PASS",
};

// mixed-results.json records an accepted command, an unchanged mode and SAFE telemetry.
const failingView: ResultView = {
  execution: {
    "Execution ID": "run/001: Δ*?",
    "Execution time (UTC)": "2026-08-17T08:00:00Z",
    "Scenario": "nominal_to_safe_mode",
  },
  observation: {
    "Command type": "SET_OPERATING_MODE",
    "Target mode": "SAFE",
    "Starting mode": "NOMINAL",
    "Acknowledgement": "Accepted",
    "Ending mode": "NOMINAL",
    "Mode reported by telemetry": "SAFE",
  },
  checks: [
    ["pre_state_matches_expected", "NOMINAL", "NOMINAL", "PASS"],
    ["acknowledgement_is_accepted", "Accepted", "Accepted", "PASS"],
    ["post_state_matches_requested_mode", "SAFE", "NOMINAL", "FAIL"],
    ["telemetry_matches_post_state", "NOMINAL", "SAFE", "FAIL"],
  ],
  outcome: "FAIL",
};

const failingEvidence = {
  schema_version: 1,
  execution: {
    execution_id: "run/001: Δ*?",
    scenario_id: "nominal_to_safe_mode",
    executed_at: "2026-08-17T08:00:00Z",
  },
  observation: {
    command: { command_type: "SET_OPERATING_MODE", target_mode: "SAFE" },
    pre_state: { operating_mode: "NOMINAL" },
    acknowledgement: { accepted: true },
    post_state: { operating_mode: "NOMINAL" },
    telemetry: { operating_mode: "SAFE" },
  },
  invariant_results: [
    { invariant_id: "pre_state_matches_expected", passed: true, expected: "NOMINAL", actual: "NOMINAL" },
    { invariant_id: "acknowledgement_is_accepted", passed: true, expected: true, actual: true },
    { invariant_id: "post_state_matches_requested_mode", passed: false, expected: "SAFE", actual: "NOMINAL" },
    { invariant_id: "telemetry_matches_post_state", passed: false, expected: "NOMINAL", actual: "SAFE" },
  ],
  outcome: "FAIL",
};

function resultRegion(page: Page): Locator {
  return page.getByRole("region", { name: "Verified execution", exact: true });
}

function downloadButton(page: Page): Locator {
  return page.getByRole("button", { name: "Download result JSON", exact: true });
}

// Read the displayed labels and values so both result views use the same expectations.
async function readResult(result: Locator): Promise<ResultView> {
  return result.evaluate(section => {
    // Pair each label (dt) with the value (dd) that follows it.
    const labelled = (scope: ParentNode): Record<string, string> => Object.fromEntries(
      Array.from(scope.querySelectorAll("dt"), label => [
        label.textContent!.trim(),
        label.nextElementSibling!.textContent!.trim(),
      ]),
    );
    return {
      execution: labelled(section.querySelector(".execution-summary-fields")!),
      observation: labelled(section.querySelector(".result-observation .observation-fields")!),
      checks: Array.from(section.querySelectorAll(".invariant-results > li"), item => {
        const { Expected, Actual } = labelled(item);
        return [
          item.querySelector("code")!.textContent!.trim(),
          Expected,
          Actual,
          // The visible badge contains PASS or FAIL. Its accessible text also
          // includes the "Verification check" label.
          item.querySelector(".outcome-badge [aria-hidden='true']")!.textContent!.trim(),
        ] as const;
      }),
      outcome: section.querySelector(".result-heading > .outcome-badge [aria-hidden='true']")!.textContent!.trim(),
    };
  });
}

async function verify(page: Page, executionId: string, scenario: string, evidence: string) {
  await page.getByLabel("Execution ID", { exact: true }).fill(executionId);
  await page.getByLabel("Execution time (UTC)", { exact: true }).fill("2026-08-17T08:00:00Z");
  await page.getByLabel("Scenario", { exact: true }).selectOption(scenario);
  await page.getByLabel("Observation evidence JSON", { exact: true }).fill(evidence);
  await page.getByRole("button", { name: "Verify observation", exact: true }).click();
}

async function savedFile(download: Download): Promise<Buffer> {
  expect(download.suggestedFilename()).toBe(FILE_NAME);
  expect(await download.failure()).toBeNull();
  return readFileSync((await download.path())!);
}

async function reopen(page: Page, file: Buffer): Promise<ResultView> {
  // The bytes must be UTF-8 without a byte-order mark; the page receives them as text.
  expect(Array.from(file.subarray(0, 3))).not.toEqual([0xef, 0xbb, 0xbf]);
  await page.getByRole("button", { name: "Show Inspect evidence" }).click();
  await page.getByRole("radio", { name: "Verified execution", exact: true }).check();
  await page.getByLabel("Evidence JSON", { exact: true }).fill(file.toString("utf8"));
  await page.getByRole("button", { name: "Inspect evidence", exact: true }).click();
  const reopened = resultRegion(page);
  await expect(reopened.getByText("Valid saved evidence")).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  return readResult(reopened);
}

test.beforeEach(async ({ page }) => {
  // The page scrolls smoothly to a new result. Avoid measuring or clicking mid-scroll.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
});

test("a passing result downloads as evidence that Inspect evidence reopens unchanged", async ({ page }) => {
  // Saving must reuse the completed check: only verification and the later
  // inspection should reach the server.
  const apiRequests: string[] = [];
  page.on("request", request => { if (new URL(request.url()).pathname.startsWith("/api/")) apiRequests.push(request.url()); });

  await verify(page, "browser-execution", "nominal_to_safe_mode", observationFile("accepted.json"));
  await expect(resultRegion(page).getByText("Verification outcome: PASS")).toBeVisible();
  expect(await readResult(resultRegion(page))).toEqual(passingView);
  expect(apiRequests).toHaveLength(1);

  const downloading = page.waitForEvent("download");
  await downloadButton(page).click();
  const file = await savedFile(await downloading);

  // Saving reuses the completed check and the result stays on screen.
  expect(apiRequests).toHaveLength(1);
  await expect(resultRegion(page)).toBeVisible();
  // Two-space indentation, canonical field order and one final newline.
  expect(file.toString("utf8")).toBe(`${JSON.stringify(passingEvidence, null, 2)}\n`);

  expect(await reopen(page, file)).toEqual(passingView);
  expect(apiRequests).toHaveLength(2);
  expect(apiRequests[1]).toContain("/api/inspect/verified-execution");
});

test("downloads valid FAIL evidence for state and telemetry mismatches", async ({ page }) => {
  await verify(page, "run/001: Δ*?", "nominal_to_safe_mode", observationFile("mixed-results.json"));
  await expect(resultRegion(page).getByText("Verification outcome: FAIL")).toBeVisible();
  expect(await readResult(resultRegion(page))).toEqual(failingView);
  // The observation is valid and two checks found mismatches.
  await expect(page.getByRole("alert")).toHaveCount(0);

  const downloading = page.waitForEvent("download");
  await downloadButton(page).click();
  const file = await savedFile(await downloading);

  // Compare the parsed document: escaping of non-ASCII text is not under test here.
  expect(JSON.parse(file.toString("utf8"))).toEqual(failingEvidence);
  expect(file.toString("utf8").endsWith("}\n")).toBe(true);
  expect(await reopen(page, file)).toEqual(failingView);
});

test("no download is offered without a completed result for the current inputs", async ({ page }) => {
  await expect(downloadButton(page)).toHaveCount(0);

  // An input error: the command asks for SAFE but the scenario expects NOMINAL.
  await verify(page, "browser-execution", "safe_to_nominal_mode", observationFile("accepted.json"));
  await expect(page.getByRole("alert")).toContainText("Input error");
  await expect(page.getByRole("alert")).toContainText("observation command does not match the selected scenario");
  await expect(resultRegion(page)).toHaveCount(0);
  await expect(downloadButton(page)).toHaveCount(0);

  // Evidence that Python rejects, such as a repeated field name.
  await page.getByLabel("Observation evidence JSON", { exact: true }).fill(observationFile("duplicate-keys.json.txt"));
  await page.getByRole("button", { name: "Verify observation", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("observation evidence is invalid. JSON contains a repeated field name");
  await expect(downloadButton(page)).toHaveCount(0);

  // A completed result belongs to the inputs that produced it.
  await page.getByLabel("Scenario", { exact: true }).selectOption("nominal_to_safe_mode");
  await page.getByLabel("Observation evidence JSON", { exact: true }).fill(observationFile("accepted.json"));
  await page.getByRole("button", { name: "Verify observation", exact: true }).click();
  await expect(downloadButton(page)).toBeVisible();
  for (const [label, value] of [
    ["Execution ID", "edited-execution"],
    ["Execution time (UTC)", "2026-08-18T08:00:00Z"],
  ] as const) {
    await page.getByLabel(label, { exact: true }).fill(value);
    await expect(resultRegion(page)).toHaveCount(0);
    await expect(downloadButton(page)).toHaveCount(0);
    await page.getByRole("button", { name: "Verify observation", exact: true }).click();
    await expect(downloadButton(page)).toBeVisible();
  }
});

for (const enlarged of [false, true]) {
  test(`the download button works with the keyboard${enlarged ? " at 320px with 200% text" : ""}`, async ({ page, browserName }) => {
    // WebKit on macOS follows native Option-Tab navigation for non-text controls.
    const tab = browserName === "webkit" && process.platform === "darwin" ? "Alt+Tab" : "Tab";
    if (enlarged) {
      await page.setViewportSize({ width: 320, height: 480 });
      await page.addStyleTag({ content: ENLARGED_TEXT });
    }
    await verify(page, "browser-execution", "nominal_to_safe_mode", observationFile("accepted.json"));
    // After a completed check, the page moves focus to the result heading.
    const heading = resultRegion(page).getByRole("heading", { name: "Verified execution", level: 2 });
    await expect(heading).toBeFocused();

    // The action follows the result heading, before the details it saves.
    await page.keyboard.press(tab);
    await expect(downloadButton(page)).toBeFocused();
    await expect(downloadButton(page)).toBeInViewport();
    await expect(downloadButton(page)).toHaveCSS("outline-style", "solid");

    for (const key of ["Enter", "Space"]) {
      const downloading = page.waitForEvent("download");
      await page.keyboard.press(key);
      const file = await savedFile(await downloading);
      expect(JSON.parse(file.toString("utf8"))).toEqual(passingEvidence);
      await expect(downloadButton(page)).toBeFocused();
    }
  });
}

for (const { width, scale, inline } of [
  { width: 1440, scale: 100, inline: true },
  { width: 1440, scale: 200, inline: true },
  { width: 768, scale: 100, inline: true },
  { width: 768, scale: 200, inline: false },
  { width: 390, scale: 100, inline: false },
  { width: 390, scale: 200, inline: false },
  { width: 320, scale: 100, inline: false },
  { width: 320, scale: 200, inline: false },
]) for (const outcome of ["PASS", "FAIL"]) {
  test(`${outcome} download action fits at ${width}px with ${scale}% text`, async ({ page }) => {
    await page.setViewportSize({ width, height: width <= 390 ? 480 : 900 });
    if (scale === 200) {
      await page.addStyleTag({ content: ENLARGED_TEXT });
    }
    const evidence = observationFile(outcome === "PASS" ? "accepted.json" : "mixed-results.json");
    await verify(page, "browser-execution", "nominal_to_safe_mode", evidence);
    const result = resultRegion(page);
    await expect(result.getByText(`Verification outcome: ${outcome}`)).toBeVisible();
    await expect(downloadButton(page)).toBeVisible();

    // Read DOMRects together. Firefox can round a 44px control down in boundingBox().
    const layout = await result.evaluate(section => {
      const bounds = (selector: string) => section.querySelector(selector)!.getBoundingClientRect().toJSON();
      const text = section.querySelectorAll(
        ".result-context, .result-heading h2, .result-description, .result-actions button",
      );
      const splitWords = Array.from(text).flatMap(element => {
        const node = element.firstChild!;
        const range = document.createRange();
        return Array.from(node.textContent!.matchAll(/\S+/g), word => {
          range.setStart(node, word.index);
          range.setEnd(node, word.index + word[0].length);
          return range.getClientRects().length > 1 ? word[0] : null;
        }).filter(word => word !== null);
      });
      return {
        button: bounds(".result-actions button"),
        description: bounds(".result-description"),
        details: bounds(".verified-execution-fields"),
        overview: bounds(".result-overview"),
        title: bounds(".result-heading > div"),
        badge: bounds(".result-heading > .outcome-badge"),
        splitWords,
        pageWidth: document.documentElement.scrollWidth,
      };
    });
    const { button, description, details, overview, title, badge, splitWords, pageWidth } = layout;
    expect(pageWidth).toBe(width);
    expect(overview.left).toBeGreaterThanOrEqual(0);
    expect(overview.right).toBeLessThanOrEqual(width);
    expect(splitWords).toEqual([]);
    expect(button.height).toBeGreaterThanOrEqual(44);
    expect(title.right <= badge.left || title.bottom <= badge.top).toBe(true);
    if (scale === 100) expect(button.width).toBeLessThan(overview.width);
    for (const box of [title, button, badge, description]) {
      expect(box.left).toBeGreaterThanOrEqual(overview.left);
      expect(box.right).toBeLessThanOrEqual(overview.right + 0.05);
    }
    if (inline) {
      expect(title.right).toBeLessThan(badge.left);
      expect(badge.left - title.right).toBeLessThanOrEqual(scale === 100 ? 12.05 : 24.05);
      expect(badge.right).toBeLessThan(button.left);
      expect(button.bottom).toBeCloseTo(badge.bottom, 1);
      expect(button.right).toBeCloseTo(overview.right, 1);
      expect(description.top).toBeGreaterThan(Math.max(title.bottom, badge.bottom, button.bottom));
      expect(details.top).toBeGreaterThan(description.bottom);
    } else {
      expect(description.top).toBeGreaterThan(Math.max(title.bottom, badge.bottom));
      expect(button.top).toBeGreaterThan(description.bottom);
      expect(details.top).toBeGreaterThan(button.bottom);
    }
  });
}
