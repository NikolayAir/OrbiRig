import { expect, test } from "@playwright/test";

test("server time errors identify the field and keep verification outcomes separate", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Load example", exact: true }).click();
  const time = page.getByLabel("Execution time (UTC)", { exact: true });
  await time.fill("2026-02-30T10:00:00Z");
  await page.getByRole("button", { name: "Verify observation", exact: true }).click();
  await expect(time).toHaveAttribute("aria-invalid", "true");
  await expect(time).toHaveAccessibleDescription(/timestamp must be a valid UTC date and time/);
  await expect(page.getByRole("alert")).toContainText("timestamp must be a valid UTC date and time");
  await expect(page.locator(".outcome-badge")).toHaveCount(0);
  await time.fill("2026-11-01T10:00:00Z");
  await expect(time).not.toHaveAttribute("aria-invalid");
});
