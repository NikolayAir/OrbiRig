import { expect, test } from "@playwright/test";

// Expected results are written here, independently of the example data and API responses.
for (const { scenario, label, reportedTelemetry, expectedTelemetry } of [
  { scenario: "nominal_to_safe_mode", label: "NOMINAL to SAFE", reportedTelemetry: "NOMINAL", expectedTelemetry: "SAFE" },
  { scenario: "nominal_to_nominal_rejection", label: "NOMINAL to NOMINAL rejection", reportedTelemetry: "SAFE", expectedTelemetry: "NOMINAL" },
  { scenario: "safe_to_nominal_mode", label: "SAFE to NOMINAL", reportedTelemetry: "SAFE", expectedTelemetry: "NOMINAL" },
]) {
  test(`the failing ${label} example produces FAIL only for telemetry`, async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Scenario", { exact: true }).selectOption(scenario);
    await page.getByRole("button", { name: "Load failing example", exact: true }).click();
    await page.getByRole("button", { name: "Verify observation", exact: true }).click();
    const result = page.getByRole("region", { name: "Verified execution", exact: true });
    await expect(result.getByLabel("Verification outcome: FAIL", { exact: true })).toBeVisible();
    await expect(result.locator(".invariant-results > li")).toHaveCount(4);
    await expect(result.getByLabel("Verification check: FAIL", { exact: true })).toHaveCount(1);
    await expect(result.locator(".invariant-results > li").last()).toContainText(expectedTelemetry);
    await expect(result.locator(".invariant-results > li").last()).toContainText(reportedTelemetry);
  });
}

test("the failing saved execution stays valid evidence with a FAIL outcome", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Show Inspect evidence" }).click();
  await expect(page.getByRole("button", { name: "Load failing example", exact: true })).toHaveCount(0);
  await page.getByRole("radio", { name: "Verified execution", exact: true }).check();
  await page.getByRole("button", { name: "Load failing example", exact: true }).click();
  await page.locator("button[type=submit]").click();
  await expect(page.getByLabel("Verification outcome: FAIL", { exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.locator(".action-status")).toHaveText("Inspection completed. Evidence is valid. Saved outcome: FAIL.");
});

test("the failing sequence fails continuity while each record passes", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Show Inspect evidence" }).click();
  await page.getByRole("radio", { name: "Verified execution sequence", exact: true }).check();
  await page.getByRole("button", { name: "Load failing example", exact: true }).click();
  await page.locator("button[type=submit]").click();
  const result = page.getByRole("region", { name: "Verified execution sequence", exact: true });
  await expect(result).toContainText("Sequence totals: 2 members. Failed members: 0. Failed continuity checks: 1.");
});

for (const type of ["Observation", "Verified execution", "Verified execution sequence"]) {
  test(`the altered ${type} example is rejected without a result`, async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Show Inspect evidence" }).click();
    await page.getByRole("radio", { name: type, exact: true }).check();
    await page.getByRole("button", { name: "Load altered example", exact: true }).click();
    await page.locator("button[type=submit]").click();
    await expect(page.getByRole("alert").locator("strong")).toHaveText("Invalid evidence");
    await expect(page.getByLabel(/Verification outcome:/)).toHaveCount(0);
    await expect(page.locator("button[type=submit]")).toBeEnabled();
  });
}
