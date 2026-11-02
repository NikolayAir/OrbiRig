import { expect, test } from "@playwright/test";

test("empty inspection JSON focuses the field without an HTTP request", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Show Inspect evidence" }).click();
  let requests = 0;
  page.on("request", request => { if (new URL(request.url()).pathname.startsWith("/api/")) requests++; });
  for (const value of ["", " \n\t "]) {
    await page.getByLabel("Evidence JSON", { exact: true }).fill(value);
    await page.locator("button[type=submit]").focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("alert")).toHaveText("Evidence JSON is required.");
    await expect(page.getByLabel("Evidence JSON", { exact: true })).toBeFocused();
    await expect(page.getByLabel("Evidence JSON", { exact: true })).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator(".action-status")).toHaveCount(0);
  }
  expect(requests).toBe(0);
});
