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

async function fillVerification(page: Page, scenario: string, evidence: string) {
  await page.getByLabel("Execution ID", { exact: true }).fill("browser-execution");
  await page.getByLabel("Execution time (UTC)", { exact: true }).fill("2026-08-17T08:00:00Z");
  await page.getByLabel("Scenario", { exact: true }).selectOption(scenario);
  await page.getByLabel("Observation evidence JSON", { exact: true }).fill(evidence);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

for (const example of [
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
    checks: [
      ["pre_state_matches_expected", "NOMINAL", "NOMINAL", "PASS"],
      ["acknowledgement_is_accepted", "true", "true", "PASS"],
      ["post_state_matches_requested_mode", "SAFE", "NOMINAL", "FAIL"],
      ["telemetry_matches_post_state", "NOMINAL", "SAFE", "FAIL"],
    ] satisfies readonly Check[],
  },
]) {
  test(example.name, async ({ page }) => {
    await fillVerification(page, example.scenario, evidenceFile(example.fixture));
    await page.getByRole("button", { name: "Verify observation", exact: true }).click();

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
    await fillVerification(page, "nominal_to_safe_mode", invalid.text);
    const submittedText = await page.getByLabel("Observation evidence JSON", { exact: true }).inputValue();
    // Browsers convert textarea line endings to LF. Everything else must match the input.
    expect(submittedText).toBe(invalid.text.replace(/\r\n?/g, "\n"));
    const responsePromise = page.waitForResponse("**/api/verify/observation");
    await page.getByRole("button", { name: "Verify observation", exact: true }).click();
    const response = await responsePromise;

    expect(response.status()).toBe(422);
    expect(response.request().postDataJSON().observation_evidence).toBe(submittedText);
    await expect(page.getByRole("alert")).toHaveText("The observation evidence is invalid.");
    await expect(page.getByRole("region", { name: "Verified execution", exact: true })).toHaveCount(0);
    await expect(page.getByLabel(/^Verification (outcome|check):/)).toHaveCount(0);
  });

  test(`inspection reports an input error for ${invalid.name} and preserves the submitted text`, async ({ page }) => {
    await page.getByRole("button", { name: "Show Inspect evidence workflow", exact: true }).click();
    await page.getByLabel("Evidence JSON", { exact: true }).fill(invalid.text);
    const submittedText = await page.getByLabel("Evidence JSON", { exact: true }).inputValue();
    expect(submittedText).toBe(invalid.text.replace(/\r\n?/g, "\n"));
    const responsePromise = page.waitForResponse("**/api/inspect/observation");
    await page.getByRole("button", { name: "Inspect evidence", exact: true }).click();
    const response = await responsePromise;

    expect(response.status()).toBe(422);
    expect(response.request().postData()).toBe(submittedText);
    expect(response.request().headers()["content-type"]).toBe("text/plain; charset=utf-8");
    await expect(page.getByRole("alert")).toHaveText("The observation evidence is invalid.");
    await expect(page.getByRole("region", { name: "Observation details", exact: true })).toHaveCount(0);
    await expect(page.getByLabel(/^Verification (outcome|check):/)).toHaveCount(0);
  });
}

test("sequence keeps input order and reports a mode mismatch even though every record passes", async ({ page }) => {
  await page.getByRole("button", { name: "Show Inspect evidence workflow", exact: true }).click();
  await page.getByRole("radio", { name: "Verified execution sequence", exact: true }).check();
  await page.getByLabel("Evidence JSON", { exact: true }).fill(evidenceFile("discontinuous-sequence.json"));
  await page.getByRole("button", { name: "Inspect evidence", exact: true }).click();

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
