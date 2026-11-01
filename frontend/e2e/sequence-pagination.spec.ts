import { expect, test } from "@playwright/test";

function largeSequence(withFailures: boolean) {
  // Expected values are specified here, not copied from an API response or the SUT.
  // IDs repeat and timestamps run backwards; member positions must remain authoritative.
  const records = Array.from({ length: 3900 }, (_, index) => {
    const accepted = withFailures && index === 24;
    const badTelemetry = withFailures && index === 3899;
    const postMode = accepted ? "SAFE" : "NOMINAL";
    return {
      schema_version: 1,
      execution: {
        execution_id: "repeated-id",
        executed_at: new Date(Date.UTC(2026, 7, 17, 0, 0, 3899 - index)).toISOString(),
        scenario_id: accepted ? "nominal_to_safe_mode" : "nominal_to_nominal_rejection",
      },
      observation: {
        command: { command_type: "SET_OPERATING_MODE", target_mode: postMode },
        pre_state: { operating_mode: "NOMINAL" },
        acknowledgement: { accepted },
        post_state: { operating_mode: postMode },
        telemetry: { operating_mode: badTelemetry ? "SAFE" : postMode },
      },
      invariant_results: [
        { invariant_id: "pre_state_matches_expected", expected: "NOMINAL", actual: "NOMINAL", passed: true },
        { invariant_id: accepted ? "acknowledgement_is_accepted" : "acknowledgement_is_rejected", expected: accepted, actual: accepted, passed: true },
        { invariant_id: accepted ? "post_state_matches_requested_mode" : "post_state_matches_pre_state", expected: postMode, actual: postMode, passed: true },
        { invariant_id: "telemetry_matches_post_state", expected: postMode, actual: badTelemetry ? "SAFE" : postMode, passed: !badTelemetry },
      ],
      outcome: badTelemetry ? "FAIL" : "PASS",
    };
  });
  return JSON.stringify({
    schema_version: 1, records,
    continuity_results: Array.from({ length: 3899 }, (_, index) => ({
      previous_execution_id: "repeated-id", next_execution_id: "repeated-id",
      expected_operating_mode: withFailures && index === 24 ? "SAFE" : "NOMINAL",
      observed_operating_mode: "NOMINAL", passed: !(withFailures && index === 24),
    })),
    outcome: withFailures ? "FAIL" : "PASS",
  });
}

for (const [width, withFailures] of [[1280, false], [390, true]] as const) {
  test(`large sequence pagination and failure discovery at ${width}px`, async ({ page }, testInfo) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page.getByRole("button", { name: "Show Inspect evidence", exact: true }).click();
    await page.getByRole("radio", { name: "Verified execution sequence", exact: true }).check();
    const input = largeSequence(withFailures);
    expect(Buffer.byteLength(input)).toBeLessThan(4 * 1024 * 1024);
    await page.getByLabel("Evidence JSON", { exact: true }).fill(input);
    const responsePromise = page.waitForResponse("**/api/inspect/verified-execution-sequence");
    await page.getByRole("button", { name: "Inspect evidence", exact: true }).click();
    const response = await responsePromise;
    expect(response.status()).toBe(200);
    expect((await response.json()).outcome).toBe(withFailures ? "FAIL" : "PASS");

    const result = page.getByRole("region", { name: "Verified execution sequence", exact: true });
    await expect(result.getByRole("heading", { name: "Verified execution sequence", exact: true })).toBeFocused();
    await expect(result.locator(".sequence-member")).toHaveCount(25);
    await expect(result.getByRole("article", { name: "Member 1", exact: true })).toContainText("2026-08-17T01:04:59Z");
    expect(await result.locator("*").count()).toBeLessThan(5000);
    await expect(result.getByLabel(`Sequence outcome: ${withFailures ? "FAIL" : "PASS"}`, { exact: true })).toBeVisible();
    await expect(result.getByRole("article", { name: "Continuity check 25", exact: true })).toContainText("Members 25 → 26");
    if (withFailures) {
      await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    // Enter submits an explicit page change; editing the number alone keeps focus and the current page.
    const navigation = result.getByRole("navigation", { name: "Sequence pages", exact: true }).first();
    const pageInput = navigation.getByRole("spinbutton", { name: "Page", exact: true });
    await pageInput.fill("156");
    await expect(result.getByRole("article", { name: "Member 1", exact: true })).toHaveCount(1);
    await expect(pageInput).toBeFocused();
    await pageInput.press("Enter");
    await expect(result.getByRole("article", { name: "Member 3900", exact: true })).toHaveCount(1);
    await expect(result.getByRole("article", { name: "Member 3900", exact: true })).toContainText("2026-08-17T00:00:00Z");
    await expect(navigation.getByRole("button", { name: "Next page", exact: true })).toBeDisabled();
    const heading = result.getByRole("heading", { name: "Member records and continuity", exact: true });
    await expect(heading).toBeFocused();
    await expect.poll(async () => {
      const bounds = await heading.boundingBox();
      return bounds !== null && bounds.y >= 0 && bounds.y < 900;
    }).toBe(true);
    expect(await heading.evaluate(element => getComputedStyle(element).outlineStyle)).not.toBe("none");
    await navigation.screenshot({ path: testInfo.outputPath("page-controls.png") });

    const filter = result.getByRole("checkbox", { name: "Show failures and connected records only", exact: true });
    await filter.focus();
    await filter.press("Space");
    await expect(filter).toBeFocused();
    if (withFailures) {
      await expect(result).toContainText("Failed members: 1. Failed continuity checks: 1.");
      await expect(result.locator(".sequence-member-heading h4")).toHaveText(["Member 25", "Member 26", "Member 3900"]);
      await expect(result.getByRole("article", { name: "Continuity check 25", exact: true }).getByLabel("Continuity outcome: FAIL", { exact: true })).toBeVisible();
      await expect(result.getByRole("article", { name: "Continuity check 26", exact: true })).toContainText("Members 26 → 27");
      await expect(result.getByRole("article", { name: "Member 3900", exact: true }).getByLabel("Verification check: FAIL", { exact: true })).toHaveCount(1);
    } else {
      await expect(result.locator(".sequence-page-status")).toHaveText("No failed members or continuity checks.");
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await heading.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath("sequence-navigation.png") });
    // Switching panels must retain the filtered view, without resubmitting the large document.
    await page.getByRole("button", { name: "Show Verify observation", exact: true }).click();
    await page.getByRole("button", { name: "Show Inspect evidence", exact: true }).click();
    await expect(filter).toBeChecked();
    await expect(page.getByLabel("Evidence JSON", { exact: true })).toHaveValue(input);
    await expect(page.getByRole("alert")).toHaveCount(0);
  });
}
