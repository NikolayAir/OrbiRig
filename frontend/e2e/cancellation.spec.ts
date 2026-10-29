import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

const cases = [
  { workflow: "verification", type: "Observation", file: "accepted.json", action: "Verify observation", heading: "Verified execution", outcome: "Verification outcome: PASS" },
  { workflow: "inspection", type: "Observation", file: "accepted.json", action: "Inspect evidence", heading: "Observation details", outcome: null },
  { workflow: "inspection", type: "Verified execution", file: "failed-execution.json", action: "Inspect evidence", heading: "Verified execution", outcome: "Verification outcome: FAIL" },
  { workflow: "inspection", type: "Verified execution sequence", file: "discontinuous-sequence.json", action: "Inspect evidence", heading: "Verified execution sequence", outcome: "Sequence outcome: FAIL" },
] as const;

for (const viewport of [{ width: 1280, height: 800 }, { width: 320, height: 600 }]) {
  for (const example of cases) {
    test(`${example.action} cancels ${example.type} and retries by keyboard at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto("/");
      if (example.workflow === "inspection") {
        await page.getByRole("button", { name: "Show Inspect evidence workflow" }).click();
        await page.getByRole("radio", { name: example.type, exact: true }).check();
      } else {
        await page.getByLabel("Execution ID", { exact: true }).fill("cancel-original");
        await page.getByLabel("Execution time (UTC)", { exact: true }).fill("2026-10-29T10:00:00Z");
        await page.getByLabel("Scenario", { exact: true }).selectOption("nominal_to_safe_mode");
      }
      const editor = page.getByLabel(example.workflow === "verification" ? "Observation evidence JSON" : "Evidence JSON", { exact: true });
      const evidence = readFileSync(new URL(`./fixtures/${example.file}`, import.meta.url), "utf8");
      await editor.fill(evidence);
      const submitted = await editor.inputValue();
      const action = page.getByRole("button", { name: example.action, exact: true });
      let release!: () => void;
      const gate = new Promise<void>((resolve) => { release = resolve; });
      let received!: () => void;
      const responseReady = new Promise<void>((resolve) => { received = resolve; });
      // Compute the real Python result, but hold its response until cancellation.
      await page.route("**/api/**", async (route) => {
        const response = await route.fetch();
        received();
        await gate;
        if (route.request().failure() === null) await route.fulfill({ response });
      }, { times: 1 });

      try {
        await action.focus();
        await page.keyboard.down("Enter");
        const cancel = page.getByRole("button", { name: "Cancel request", exact: true });
        await expect(action).toBeDisabled();
        await expect(editor).toBeDisabled();
        await expect(cancel).toBeFocused();
        await expect(cancel).toBeInViewport();
        await expect(cancel).toHaveCSS("outline-style", "solid");
        // Holding the submit key must not activate the newly focused cancellation.
        await page.keyboard.down("Enter");
        await expect(cancel).toBeFocused();
        await expect(action).toBeDisabled();
        await page.keyboard.up("Enter");
        await responseReady;
        const aborted = page.waitForEvent("requestfailed", { predicate: (request) => request.url().includes("/api/") });
        await page.keyboard.down("Enter");
        expect((await aborted).failure()).not.toBeNull();
        await expect(action).toBeFocused();
        // Holding the cancellation key must not submit the form again either.
        await page.keyboard.down("Enter");
        await expect(cancel).toHaveCount(0);
        await page.keyboard.up("Enter");
        release();
        await page.unrouteAll({ behavior: "wait" });

        await expect(action).toBeFocused();
        await expect(action).toBeEnabled();
        await expect(action).toBeInViewport();
        await expect(action).toHaveCSS("outline-style", "solid");
        await expect(editor).toBeEnabled();
        await expect(editor).toHaveValue(submitted);
        await expect(cancel).toHaveCount(0);
        await expect(page.getByRole("status")).toHaveText(
          `${example.workflow === "verification" ? "Verification" : "Inspection"} request cancelled. Your inputs are kept.`,
        );
        await expect(page.getByRole("alert")).toHaveCount(0);
        await expect(page.locator(".workflow-feedback h2")).toHaveCount(0);
        if (example.workflow === "verification") {
          await expect(page.getByLabel("Execution ID", { exact: true })).toHaveValue("cancel-original");
          await expect(page.getByLabel("Execution time (UTC)", { exact: true })).toHaveValue("2026-10-29T10:00:00Z");
          await expect(page.getByLabel("Scenario", { exact: true })).toHaveValue("nominal_to_safe_mode");
          await page.getByLabel("Execution ID", { exact: true }).fill("retry-execution");
          await action.focus();
        } else {
          await expect(page.getByRole("radio", { name: example.type, exact: true })).toBeChecked();
        }
        const retried = page.waitForResponse((response) => response.url().includes("/api/"));
        await page.keyboard.press("Enter");
        expect((await retried).status()).toBe(200);
        const result = page.getByRole("region", { name: example.heading, exact: true });
        await expect(result.getByRole("heading", { name: example.heading, exact: true }).first()).toBeFocused();
        await expect(page.getByRole("status")).toContainText("completed.");
        if (example.outcome !== null) await expect(result.getByLabel(example.outcome, { exact: true })).toBeVisible();
        if (example.workflow === "verification") await expect(result.getByText("retry-execution", { exact: true })).toBeVisible();
      } finally {
        release();
        await page.unrouteAll({ behavior: "ignoreErrors" });
      }
    });
  }
}
