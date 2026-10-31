import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

type Workflow = "verification" | "inspection";

const actionName = (workflow: Workflow) => workflow === "verification"
  ? "Verify observation" : "Inspect evidence";

async function prepare(page: Page, workflow: Workflow) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  if (workflow === "inspection") {
    await page.getByRole("button", { name: "Show Inspect evidence" }).click();
  }
  await page.getByRole("button", { name: "Load example", exact: true }).click();
}

async function holdResponse(page: Page) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  // Keep the real Python response; delay only its delivery to the browser.
  await page.route("**/api/**", async (route) => {
    const response = await route.fetch();
    await gate;
    await route.fulfill({ response });
  });
  return release;
}

async function submit(page: Page, workflow: Workflow) {
  await page.getByRole("button", { name: actionName(workflow), exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toHaveText(
    workflow === "verification" ? "Verifying observation…" : "Inspecting evidence…",
  );
}

const completions = [
  { workflow: "verification", scenario: "nominal_to_safe_mode", file: "accepted.json",
    heading: "Verified execution", message: "Verification completed. Outcome: PASS." },
  { workflow: "verification", scenario: "nominal_to_safe_mode", file: "incorrect-behaviour.json",
    heading: "Verified execution", message: "Verification completed. Outcome: FAIL." },
  { workflow: "verification", scenario: "nominal_to_nominal_rejection", file: "rejected.json",
    heading: "Verified execution", message: "Verification completed. Outcome: PASS." },
  { workflow: "inspection", type: "Observation", file: "accepted.json",
    heading: "Observation details", message: "Inspection completed. Valid observation evidence. No scenario verification was performed." },
  { workflow: "inspection", type: "Verified execution", file: "failed-execution.json",
    heading: "Verified execution", message: "Inspection completed. Valid verified execution evidence. Verification outcome: FAIL." },
  { workflow: "inspection", type: "Verified execution sequence", file: "discontinuous-sequence.json",
    heading: "Verified execution sequence", message: "Inspection completed. Valid verified execution sequence evidence. Sequence outcome: FAIL." },
] as const;

for (const example of completions) {
  test(`${example.workflow} focuses and announces ${example.file}, including a repeated submission`, async ({ page }) => {
    await prepare(page, example.workflow);
    if (example.workflow === "verification") {
      await page.getByLabel("Scenario", { exact: true }).selectOption(example.scenario);
    } else {
      await page.getByRole("radio", { name: example.type, exact: true }).check();
    }
    const evidence = readFileSync(new URL(`./fixtures/${example.file}`, import.meta.url), "utf8");
    await page.getByLabel(example.workflow === "verification" ? "Observation evidence JSON" : "Evidence JSON", { exact: true }).fill(evidence);
    const status = await page.getByRole("status").elementHandle();
    expect(status).not.toBeNull();
    for (let attempt = 0; attempt < 2; attempt++) {
      const release = await holdResponse(page);
      await submit(page, example.workflow);
      release();
      const heading = page.getByRole("heading", { name: example.heading, exact: true }).first();
      await expect(heading).toBeFocused();
      await expect(heading).toBeInViewport();
      await expect(heading).toHaveCSS("outline-style", "solid");
      await expect(page.getByRole("status")).toHaveText(example.message);
      expect(await status!.evaluate((element) => element === document.querySelector('[role="status"]'))).toBe(true);
      await page.unrouteAll({ behavior: "wait" });
    }
  });
}

for (const workflow of ["verification", "inspection"] as const) {
  test(`${workflow} also restores focus after pointer submission`, async ({ page }) => {
    await prepare(page, workflow);
    const release = await holdResponse(page);
    const action = page.getByRole("button", { name: actionName(workflow), exact: true });
    await action.click();
    await expect(action).toBeDisabled();
    // A repeated click on the pending action does not mean the user moved on.
    const bounds = (await action.boundingBox())!;
    await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    release();
    await expect(page.locator(".workflow-feedback h2").first()).toBeFocused();
    await expect(page.getByRole("status")).toContainText("completed.");
  });

  for (const destination of ["other workflow", "workflow round trip", "open help", "closed help", "field help"] as const) {
    test(`${workflow} completion preserves focus and scrolling after ${destination}`, async ({ page }) => {
      await prepare(page, workflow);
      const release = await holdResponse(page);
      await submit(page, workflow);
      const other = workflow === "verification" ? "inspection" : "verification";
      if (destination === "other workflow" || destination === "workflow round trip") {
        await page.getByRole("button", { name: `Show ${actionName(other)}` }).focus();
        await page.keyboard.press("Enter");
        if (destination === "workflow round trip") {
          await page.getByRole("button", { name: `Show ${actionName(workflow)}` }).focus();
          await page.keyboard.press("Enter");
        }
      } else if (destination === "field help") {
        await page.getByRole("button", { name: `About ${actionName(workflow)}`, exact: true }).focus();
      } else {
        await page.getByRole("button", { name: "In the browser", exact: true }).click();
        await expect(page.getByRole("dialog", { name: "How it works" })).toBeVisible();
        if (destination === "closed help") await page.keyboard.press("Escape");
      }
      const focused = await page.locator(":focus").elementHandle();
      expect(focused).not.toBeNull();
      const scrollY = await page.evaluate(() => window.scrollY);
      const completed = page.waitForResponse((response) => response.url().includes("/api/"));
      release();
      await (await completed).finished();
      if (destination !== "other workflow") {
        // Wait for rendered completion even when the result is behind the modal.
        await page.locator(".workflow-feedback h2").first().waitFor({ state: "attached" });
      }
      expect(await focused!.evaluate((element) => element === document.activeElement)).toBe(true);
      expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
      await expect(page.locator('[role="status"]')).toBeEmpty();
      if (destination === "open help") await page.keyboard.press("Escape");
      if (destination === "other workflow") {
        await page.getByRole("button", { name: `Show ${actionName(workflow)}` }).focus();
        await page.keyboard.press("Enter");
      }
      await expect(page.locator(".workflow-feedback h2").first()).toBeVisible();
      await expect(page.locator(".workflow-feedback h2").first()).not.toBeFocused();
    });
  }

  test(`${workflow} focuses invalid-input feedback after keyboard submission`, async ({ page }) => {
    await prepare(page, workflow);
    await page.getByLabel(workflow === "verification" ? "Observation evidence JSON" : "Evidence JSON", { exact: true }).fill("{}");
    const release = await holdResponse(page);
    await submit(page, workflow);
    release();
    await expect(page.getByRole("alert")).toBeFocused();
    await expect(page.getByRole("alert")).toBeInViewport();
    await expect(page.getByRole("alert")).toHaveCSS("outline-style", "solid");
    await expect(page.getByRole("status")).toBeEmpty();
  });
}

test("verification restores focus after Enter in an execution field", async ({ page, browserName }) => {
  await prepare(page, "verification");
  await page.getByLabel("Execution ID", { exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".workflow-feedback h2")).toBeFocused();
  await expect(page.getByRole("status")).toHaveText("Verification completed. Outcome: PASS.");
  await page.keyboard.press(browserName === "webkit" && process.platform === "darwin" ? "Alt+Shift+Tab" : "Shift+Tab");
  await expect(page.getByRole("button", { name: "Verify observation", exact: true })).toBeFocused();
});
