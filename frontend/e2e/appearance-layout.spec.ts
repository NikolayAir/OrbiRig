import { expect, test } from "@playwright/test";

for (const width of [320, 393, 440, 768, 1024, 1440]) {
  test(`the header and form title fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width <= 440 ? 430 : 900 });
    await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
    await page.goto("/");
    const themeSelect = page.getByRole("combobox", { name: "Color theme" });
    const sizeSelect = page.getByRole("combobox", { name: "Text size" });
    const form = page.getByRole("region", { name: "Verify observation", exact: true });
    const example = form.getByRole("button", { name: "Load example" });

    for (const textSize of ["medium", "large"]) {
      await test.step(textSize, async () => {
        await sizeSelect.selectOption(textSize);
        const { brand, theme, size, pageWidth } = await page.locator(".header-toolbar").evaluate(toolbar => {
          const bounds = (selector: string) => toolbar.querySelector(selector)!.getBoundingClientRect().toJSON();
          return {
            brand: bounds(".brand"),
            theme: bounds("label:first-child > select"),
            size: bounds("label:last-child > select"),
            pageWidth: document.documentElement.scrollWidth,
          };
        });
        expect(pageWidth).toBe(width);
        expect(theme.top >= brand.bottom || theme.left >= brand.right).toBe(true);
        expect(size.top >= theme.bottom || size.left >= theme.right).toBe(true);
        for (const control of [theme, size]) {
          expect(control.left).toBeGreaterThan(0);
          expect(control.right).toBeLessThan(width);
          expect(control.width).toBeGreaterThanOrEqual(44);
          expect(control.height).toBeGreaterThanOrEqual(44);
        }
        if (width >= 440 && textSize === "medium") {
          expect(theme.top).toBeLessThan(brand.bottom);
          expect(size.top).toBeCloseTo(theme.top, 0);
        }

        const heading = form.getByRole("heading", { name: "Verify observation", exact: true });
        const title = await heading.evaluate(element => {
          const range = document.createRange();
          range.selectNodeContents(element);
          return { lines: range.getClientRects().length, box: element.getBoundingClientRect().toJSON() };
        });
        const button = (await example.boundingBox())!;
        expect(title.lines).toBe(1);
        expect(title.box.right <= button.x || title.box.bottom <= button.y).toBe(true);
        expect(button.x + button.width).toBeLessThanOrEqual(width);
        expect(button.height).toBeGreaterThanOrEqual(44);
      });
    }
    await expect(themeSelect).toHaveValue("system");
  });
}

test("settings and example options stay reachable at 320px with doubled text", async ({ page, browserName }) => {
  await page.setViewportSize({ width: 320, height: 430 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.locator("html").evaluate(element => { element.style.fontSize = "200%"; });

  const theme = page.getByRole("combobox", { name: "Color theme" });
  const size = page.getByRole("combobox", { name: "Text size" });
  const optionTab = browserName === "webkit" && process.platform === "darwin";
  await theme.selectOption("night");
  await theme.focus();
  await page.keyboard.press(optionTab ? "Alt+Tab" : "Tab");
  await expect(size).toBeFocused();
  await expect(size).toHaveCSS("outline-style", "solid");
  await expect(size).toBeInViewport({ ratio: 1 });
  await page.keyboard.press(optionTab ? "Alt+Shift+Tab" : "Shift+Tab");
  await expect(theme).toBeFocused();
  await expect(theme).toHaveCSS("outline-style", "solid");

  const example = page.getByRole("button", { name: "Load example" });
  for (const workflow of ["Verify observation", "Inspect evidence"]) {
    await page.getByRole("button", { name: "Show " + workflow }).click();
    await example.click();
    await expect(page.getByRole("button", { name: "Standard example" })).toBeVisible();
    await expect.poll(() => page.locator(".example-options").evaluate(menu => {
      const { top, bottom, left, right } = menu.getBoundingClientRect();
      return top >= 0 && bottom <= innerHeight && left >= 0 && right <= innerWidth;
    })).toBe(true);
    await page.keyboard.press("Escape");
    await expect(example).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  }
});

test("Small keeps 44px touch targets on the settings, examples and field help", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 430 });
  await page.goto("/");
  await page.getByRole("combobox", { name: "Text size" }).selectOption("small");
  const sizes = await page.locator(".appearance-control select, .example-picker-trigger, .field-help-button")
    .evaluateAll(controls => controls.map(control => {
      const rect = control.getBoundingClientRect();
      return Math.min(rect.width, rect.height);
    }));
  expect(sizes.length).toBeGreaterThan(3);
  for (const size of sizes) expect(size).toBeGreaterThanOrEqual(44);
});

test("forced colours retain native selectors and visible keyboard focus", async ({ page, browserName }) => {
  await page.emulateMedia({ forcedColors: "active" });
  await page.goto("/");
  test.skip(!await page.evaluate(() => matchMedia("(forced-colors: active)").matches), "Forced colours unavailable in this engine");
  const theme = page.getByRole("combobox", { name: "Color theme" });
  const size = page.getByRole("combobox", { name: "Text size" });
  await theme.selectOption("night");
  await expect(theme).toHaveCSS("appearance", "auto");
  await expect(size).toHaveCSS("background-image", "none");
  await theme.focus();
  await page.keyboard.press(browserName === "webkit" && process.platform === "darwin" ? "Alt+Tab" : "Tab");
  await expect(size).toBeFocused();
  await expect(size).toHaveCSS("outline-style", "solid");
});

test("the orbital illustration stays clear of the header copy and controls", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const diagram = page.locator(".orbital-diagram");
  const theme = page.getByRole("combobox", { name: "Color theme" });
  const satellite = diagram.locator(".orbital-satellite");
  await theme.selectOption("day");
  await expect(diagram).toBeVisible();
  await expect(diagram).toHaveAttribute("aria-hidden", "true");
  await expect(diagram).toHaveAttribute("focusable", "false");
  const dayStroke = await satellite.evaluate(element => getComputedStyle(element).stroke);
  await theme.selectOption("night");
  await expect(satellite).not.toHaveCSS("stroke", dayStroke);

  let previousArtworkWidth = Infinity;
  for (const width of [1440, 1120, 1040]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(diagram).toBeVisible();
    const { copy, artwork, toolbar, flow } = await page.locator(".page-header").evaluate(header => {
      const bounds = (selector: string) => header.querySelector(selector)!.getBoundingClientRect().toJSON();
      return {
        copy: bounds(".header-intro > div"),
        artwork: bounds(".orbital-diagram"),
        toolbar: bounds(".header-toolbar"),
        flow: bounds(".check-flow"),
      };
    });
    expect(artwork.left).toBeGreaterThan(copy.right);
    expect(artwork.top).toBeGreaterThan(toolbar.bottom);
    expect(artwork.bottom).toBeLessThan(flow.top);
    expect(artwork.height).toBeLessThanOrEqual(copy.height);
    expect(artwork.width).toBeLessThan(previousArtworkWidth);
    previousArtworkWidth = artwork.width;
  }

  await page.setViewportSize({ width: 1008, height: 900 });
  await expect(diagram).toBeHidden();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator("html").evaluate(element => { element.style.fontSize = "200%"; });
  await expect(diagram).toBeHidden();
});
