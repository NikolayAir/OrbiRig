import type { Page } from "@playwright/test";

export async function chooseExample(page: Page, label = "Standard example") {
  await page.getByRole("button", { name: "Load example", exact: true }).click();
  await page.getByRole("button", { name: label, exact: true }).click();
}
