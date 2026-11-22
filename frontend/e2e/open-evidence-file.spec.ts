import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

function fixture(name: string): Buffer {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url));
}

async function chooseFile(page: Page, buffer: Buffer, keyboard = false) {
  const open = page.getByRole("button", { name: "Open JSON file", exact: true });
  const choosing = page.waitForEvent("filechooser");
  if (keyboard) {
    await open.press("Enter");
  } else {
    await open.click();
  }
  await (await choosing).setFiles({ name: "evidence.json", mimeType: "application/json", buffer });
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
  await expect(page.getByText("File opened in Evidence JSON.", { exact: false })).toBeVisible();
  expect(requests).toHaveLength(0);

  const submitted = page.waitForResponse("**/api/inspect/observation");
  await page.getByRole("button", { name: "Inspect evidence", exact: true }).click();
  const response = await submitted;
  expect(response.status()).toBe(422);
  expect(response.request().postDataBuffer()).toEqual(file);
  await expect(page.getByRole("alert")).toContainText("JSON contains a repeated field name");
  await expect(page.getByRole("region", { name: "Observation details", exact: true })).toHaveCount(0);
});

test("the same file can be chosen again after cancelling replacement with Escape", async ({ page, browserName }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/");
  await page.getByRole("button", { name: "Show Inspect evidence", exact: true }).click();
  await page.addStyleTag({ content: ':root { font-family: Verdana, "DejaVu Sans", sans-serif; font-size: 200%; }' });
  const input = page.getByLabel("Evidence JSON", { exact: true });
  const open = page.getByRole("button", { name: "Open JSON file", exact: true });
  const tab = browserName === "webkit" && process.platform === "darwin" ? "Alt+Tab" : "Tab";
  await input.fill("edited draft");
  await page.getByRole("button", { name: "About Evidence JSON", exact: true }).focus();
  await page.keyboard.press(tab);
  await expect(open).toBeFocused();
  await expect(open).toHaveCSS("outline-style", "solid");
  expect(await open.evaluate(button => button.scrollWidth <= button.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);

  const file = fixture("accepted.json");
  const confirmation = page.getByRole("dialog", { name: "Replace Evidence JSON?", exact: true });
  await chooseFile(page, file, true);
  await expect(confirmation.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
  await expect(input).toHaveValue("edited draft");
  await page.keyboard.press("Escape");
  await expect(confirmation).toHaveCount(0);
  await expect(input).toHaveValue("edited draft");
  await expect(open).toBeFocused();

  await chooseFile(page, file, true);
  await expect(confirmation.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
  await page.keyboard.press(tab);
  await expect(confirmation.getByRole("button", { name: "Replace Evidence JSON", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(confirmation).toHaveCount(0);
  await expect(input).toHaveValue(file.toString("utf8"));
  await expect(open).toBeFocused();
  await expect(page.getByRole("button", { name: "Inspect evidence", exact: true })).toBeEnabled();
});
