import { expect, test } from "@playwright/test";

for (const [type, endpoint] of [
  ["Observation", "observation"],
  ["Verified execution", "verified-execution"],
  ["Verified execution sequence", "verified-execution-sequence"],
]) {
  test(`the standard ${type} example is valid with the appropriate result meaning`, async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Show Inspect evidence", exact: true }).click();
    await page.getByRole("radio", { name: type, exact: true }).check();
    await page.getByRole("button", { name: "Load example", exact: true }).click();
    const pending = page.waitForResponse(`**/api/inspect/${endpoint}`);
    await page.getByRole("button", { name: "Inspect evidence", exact: true }).click();
    const response = await pending;
    expect(response.status()).toBe(200);
    await expect(page.getByRole("alert")).toHaveCount(0);
    if (type === "Observation") {
      expect(await response.json()).not.toHaveProperty("outcome");
      await expect(page.locator(".outcome-badge")).toHaveCount(0);
      await expect(page.getByRole("region", { name: "Observation details", exact: true }))
        .toContainText("No scenario verification has been performed.");
      await expect(page.locator(".action-status")).toHaveText("Inspection completed. Evidence is valid.");
    } else {
      expect((await response.json()).outcome).toBe("PASS");
      await expect(page.locator(".action-status")).toHaveText("Inspection completed. Evidence is valid. Saved outcome: PASS.");
      const label = type === "Verified execution" ? "Verification outcome: PASS" : "Sequence outcome: PASS";
      await expect(page.getByLabel(label, { exact: true })).toBeVisible();
    }
  });
}

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

test("failing and altered examples use the FAIL colours while the standard example does not", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Show Inspect evidence" }).click();
  await page.getByRole("radio", { name: "Verified execution", exact: true }).check();
  const failColour = "rgb(150, 63, 45)";
  await expect(page.getByRole("button", { name: "Load failing example", exact: true })).toHaveCSS("color", failColour);
  await expect(page.getByRole("button", { name: "Load altered example", exact: true })).toHaveCSS("color", failColour);
  await expect(page.getByRole("button", { name: "Load example", exact: true })).not.toHaveCSS("color", failColour);
});

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

test("the long sequence is paged and its failures can be found across every page", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Show Inspect evidence" }).click();
  await expect(page.getByRole("button", { name: "Load long sequence", exact: true })).toHaveCount(0);
  await page.getByRole("radio", { name: "Verified execution sequence", exact: true }).check();
  const load = page.getByRole("button", { name: "Load long sequence", exact: true });
  await expect(load).toHaveCSS("color", "rgb(150, 63, 45)");
  await load.click();
  await page.locator("button[type=submit]").click();
  const result = page.getByRole("region", { name: "Verified execution sequence", exact: true });
  await expect(result.getByLabel("Sequence outcome: FAIL", { exact: true })).toBeVisible();
  await expect(result).toContainText("Sequence totals: 100 members. Failed members: 2. Failed continuity checks: 1.");
  await expect(result.locator(".sequence-page-status")).toHaveText("Showing members 1–25 of 100.");
  await result.getByRole("button", { name: "Next page" }).first().click();
  await expect(result.locator(".sequence-page-status")).toHaveText("Showing members 26–50 of 100.");
  await result.getByRole("checkbox", { name: "Show failures and related records" }).check();
  await expect(result.locator(".sequence-page-status")).toHaveText("Showing matching members 1–4 of 4.");
  await expect(result.getByRole("heading", { level: 4, name: /^Member \d+$/ })).toHaveText(["Member 37", "Member 60", "Member 61", "Member 88"]);
});

for (const [type, endpoint, message] of [
  ["Observation", "observation", "observation evidence is invalid. JSON contains a repeated field name"],
  ["Verified execution", "verified-execution", "verified execution evidence is invalid. invariant_results: stored checks do not match recomputed checks"],
  ["Verified execution sequence", "verified-execution-sequence", "verified execution sequence evidence is invalid. records[0].invariant_results: stored checks do not match recomputed checks"],
]) {
  test(`the altered ${type} example is rejected without a result`, async ({ page }, testInfo) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Show Inspect evidence" }).click();
    await page.getByRole("radio", { name: type, exact: true }).check();
    const load = page.getByRole("button", { name: "Load altered example", exact: true });
    await expect(load).toHaveAccessibleDescription(type === "Observation"
      ? "Repeats a field name, so the evidence is rejected. Replaces evidence JSON"
      : "Saved checks no longer match the data, so recomputing rejects it. Replaces evidence JSON");
    await load.click();
    const pending = page.waitForResponse(`**/api/inspect/${endpoint}`);
    await page.locator("button[type=submit]").click();
    const response = await pending;
    expect(response.status()).toBe(422);
    expect(await response.json()).toEqual({ detail: message });
    await expect(page.getByRole("alert").locator("strong")).toHaveText("Invalid evidence");
    await expect(page.getByRole("alert").locator("span")).toHaveText(message);
    await expect(page.getByRole("alert")).not.toContainText("Check the reported field");
    await expect(page.locator(".outcome-badge")).toHaveCount(0);
    await expect(page.locator("button[type=submit]")).toBeEnabled();
    await testInfo.attach("Altered example diagnostic", {
      body: JSON.stringify({ status: response.status(), body: await response.json(), uiMessage: await page.getByRole("alert").innerText() }, null, 2),
      contentType: "application/json",
    });
  });
}
