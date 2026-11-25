import { expect, test, type Locator } from "@playwright/test";

function supportsAppearancePicker() {
  return CSS.supports("appearance", "base-select") &&
    CSS.supports("selector(::picker(select))") &&
    CSS.supports("position-try-fallbacks", "--centre-appearance-picker");
}

function isPickerOpen(select: Locator) {
  return select.evaluate(element => element.matches(":open"));
}

test("appearance lists use the active palette and support keyboard selection", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const theme = page.getByRole("combobox", { name: "Color theme", exact: true });
  const size = page.getByRole("combobox", { name: "Text size", exact: true });
  const enhanced = await page.evaluate(supportsAppearancePicker);
  await expect(theme).toHaveCSS("appearance", enhanced ? "base-select" : "none");
  await expect(size).toHaveCSS("appearance", enhanced ? "base-select" : "none");

  if (!enhanced) {
    await theme.selectOption("night");
    await size.selectOption("large");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "night");
    await expect(page.locator("html")).toHaveAttribute("data-text-size", "large");
    return;
  }

  const triggerWidth = (await theme.boundingBox())!.width;
  for (const palette of ["day", "night"]) {
    await theme.selectOption(palette);
    await expect(page.locator("html")).toHaveAttribute("data-theme", palette);
    expect((await theme.boundingBox())!.width).toBeCloseTo(triggerWidth, 0);
    const surface = await page.getByRole("region", { name: "Verify observation", exact: true })
      .evaluate(element => getComputedStyle(element).backgroundColor);

    for (const select of [theme, size]) {
      const original = await select.inputValue();
      await select.press("Space");
      await expect.poll(() => isPickerOpen(select)).toBe(true);
      const menu = await select.evaluate((element: HTMLSelectElement) => ({
        background: getComputedStyle(element, "::picker(select)").backgroundColor,
        arrow: getComputedStyle(element, "::picker-icon").display,
        triggerBottom: element.getBoundingClientRect().bottom,
        options: Array.from(element.options, option => option.getBoundingClientRect().toJSON()),
      }));
      expect(menu).toMatchObject({ background: surface, arrow: "none" });
      expect(menu.options[0].top - menu.triggerBottom).toBeGreaterThanOrEqual(0);
      expect(menu.options[0].top - menu.triggerBottom).toBeLessThan(16);
      for (const option of menu.options) {
        expect(option.height).toBeGreaterThanOrEqual(28);
        expect(option.height).toBeLessThanOrEqual(32);
        expect(option.left).toBeGreaterThanOrEqual(0);
        expect(option.right).toBeLessThanOrEqual(1440);
      }

      await page.keyboard.press(original === "night" ? "ArrowUp" : "ArrowDown");
      await page.keyboard.press("Escape");
      await expect.poll(() => isPickerOpen(select)).toBe(false);
      await expect(select).toHaveValue(original);
      await expect(select).toBeFocused();
      await expect(select).toHaveCSS("outline-style", "solid");
    }
  }

  await size.press("Space");
  await expect.poll(() => isPickerOpen(size)).toBe(true);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(size).toHaveValue("large");
  await page.reload();
  await expect(size).toHaveValue("large");
});

test("appearance lists use native controls on very short viewports", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 140 });
  await page.goto("/");
  const theme = page.getByRole("combobox", { name: "Color theme", exact: true });
  const size = page.getByRole("combobox", { name: "Text size", exact: true });
  await expect(theme).toHaveCSS("appearance", "none");
  await expect(size).toHaveCSS("appearance", "none");
  await theme.selectOption("night");
  await size.selectOption("large");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "night");
  await expect(page.locator("html")).toHaveAttribute("data-text-size", "large");
});

test("themed options fit and respond to touch at narrow widths and enlarged text", async ({ browser, browserName, baseURL }) => {
  const context = await browser.newContext({ baseURL, hasTouch: true, isMobile: browserName !== "firefox" });
  try {
    const page = await context.newPage();
    await page.goto("/");
    test.skip(!await page.evaluate(supportsAppearancePicker), "Customisable selects unavailable in this engine");
    const theme = page.getByRole("combobox", { name: "Color theme", exact: true });
    const size = page.getByRole("combobox", { name: "Text size", exact: true });

    for (const [width, height, fontSize] of [[320, 568, ""], [561, 225, "200%"]] as const) {
      await page.setViewportSize({ width, height });
      await page.locator("html").evaluate((root, value) => { root.style.fontSize = value; }, fontSize);
      await theme.selectOption("night");
      await size.selectOption("large");

      for (const [select, label] of [[theme, "Day"], [size, "Medium"]] as const) {
        await select.tap();
        await expect.poll(() => isPickerOpen(select)).toBe(true);
        const options = await select.evaluate((element: HTMLSelectElement) =>
          Array.from(element.options, option => option.getBoundingClientRect().toJSON()));
        for (const option of options) {
          expect(option.height).toBeGreaterThanOrEqual(44);
          expect(option.top).toBeGreaterThanOrEqual(0);
          expect(option.bottom).toBeLessThanOrEqual(height);
          expect(option.left).toBeGreaterThanOrEqual(0);
          expect(option.right).toBeLessThanOrEqual(width);
        }
        await select.getByRole("option", { name: label, exact: true }).tap();
        await expect(select).toHaveValue(label.toLowerCase());
      }
    }
  } finally {
    await context.close();
  }
});
