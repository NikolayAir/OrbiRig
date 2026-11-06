import { readFileSync, writeFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

const example = (filename: string) => readFileSync(new URL(`../../docs/examples/${filename}`, import.meta.url), "utf8");

for (const filename of ["verified-execution.json", "verified-sequence.json"]) {
  test(`another supported document is rejected as Observation: ${filename}`, async ({ page }, testInfo) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Show Inspect evidence", exact: true }).click();
    await expect(page.getByRole("radio", { name: "Observation", exact: true })).toBeChecked();
    const submitted = example(filename);
    await page.getByLabel("Evidence JSON", { exact: true }).fill(submitted);
    const pending = page.waitForResponse("**/api/inspect/observation");
    await page.getByRole("button", { name: "Inspect evidence", exact: true }).click();
    const response = await pending;
    const message = "observation evidence is invalid. observation evidence: missing required fields: acknowledgement, command, evidence_format_version, post_state, pre_state, telemetry; unexpected fields are present";
    expect(response.status()).toBe(422);
    expect(await response.json()).toEqual({ detail: message });
    expect(response.request().postData()).toBe(submitted);
    await expect(page.getByRole("alert").locator("span")).toHaveText(message);
    await expect(page.getByRole("radio", { name: "Observation", exact: true })).toBeChecked();
    await expect(page.locator(".outcome-badge")).toHaveCount(0);
    await expect(page.getByLabel("Evidence JSON", { exact: true })).toHaveValue(submitted);
    const output = testInfo.outputPath("http-ui.json");
    writeFileSync(output, JSON.stringify({ status: response.status(), body: await response.json(), uiMessage: await page.getByRole("alert").innerText() }, null, 2));
    await testInfo.attach("HTTP and UI diagnostic", { path: output, contentType: "application/json" });
    await testInfo.attach("UI diagnostic", { body: await page.screenshot(), contentType: "image/png" });
  });
}

for (const sequence of [false, true]) {
  test(`diagnostics identify ${sequence ? "an indexed sequence field" : "an observation field"} without echoing values`, async ({ page }, testInfo) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Show Inspect evidence", exact: true }).click();
    let submitted: string;
    let message: string;
    let endpoint: string;
    if (sequence) {
      await page.getByRole("radio", { name: "Verified execution sequence", exact: true }).check();
      const document = JSON.parse(example("verified-sequence.json"));
      document.records[1].observation.telemetry.operating_mode = "private-value/<script>";
      submitted = JSON.stringify(document);
      message = "verified execution sequence evidence is invalid. records[1].observation.telemetry.operating_mode: unsupported value";
      endpoint = "verified-execution-sequence";
    } else {
      const document = JSON.parse(example("nominal-to-safe.json"));
      document.acknowledgement.accepted = "private-value/<script>";
      submitted = JSON.stringify(document);
      message = "observation evidence is invalid. acknowledgement.accepted: must be a boolean";
      endpoint = "observation";
    }
    await page.getByLabel("Evidence JSON", { exact: true }).fill(submitted);
    const pending = page.waitForResponse(`**/api/inspect/${endpoint}`);
    await page.getByRole("button", { name: "Inspect evidence", exact: true }).click();
    const response = await pending;
    expect(response.status()).toBe(422);
    expect(await response.json()).toEqual({ detail: message });
    await expect(page.getByRole("alert").locator("span")).toHaveText(message);
    await expect(page.getByRole("alert")).not.toContainText("private-value");
    await expect(page.locator(".outcome-badge")).toHaveCount(0);
    const output = testInfo.outputPath("http-ui.json");
    writeFileSync(output, JSON.stringify({ status: response.status(), body: await response.json(), uiMessage: await page.getByRole("alert").innerText() }, null, 2));
    await testInfo.attach("HTTP and UI diagnostic", { path: output, contentType: "application/json" });
  });
}
