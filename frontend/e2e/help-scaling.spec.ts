import { expect, test, type Locator } from "@playwright/test";

for (const { height, textScale, fontFamily } of [
  { height: 480, textScale: 200 },
  { height: 480, textScale: 200, fontFamily: "monospace" },
  // The layout viewport of a 1280x800 browser window at 400% zoom.
  { height: 200, textScale: 100 },
]) {
  test(`help remains reachable at 320x${height} with ${textScale}% text${fontFamily ? ` in ${fontFamily}` : ""}`, async ({ page, browserName }) => {
    await page.setViewportSize({ width: 320, height });
    await page.goto("/");
    await page.getByLabel("Execution ID", { exact: true }).fill("preserved-through-scaling");
    await page.locator("html").evaluate((element, { scale, fontFamily }) => {
      element.style.fontSize = `${scale}%`;
      if (fontFamily) element.style.fontFamily = fontFamily;
    }, { scale: textScale, fontFamily });
    const trigger = page.getByRole("button", { name: "In the browser", exact: true });
    await trigger.click();
    const help = page.getByRole("dialog", { name: "How it works" });
    const close = help.getByRole("button", { name: "Close", exact: true });
    const tab = browserName === "webkit" && process.platform === "darwin" ? "Alt+Tab" : "Tab";
    async function expectFocusedTabInView(target: Locator) {
      await expect(target).toBeFocused();
      await expect(target).toHaveCSS("outline-style", "solid");
      await expect(target).toBeInViewport({ ratio: 1 });
      const focus = await target.evaluate(element => {
        const dialog = element.closest("dialog")!;
        const bounds = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        const outline = parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset);
        const top = dialog.getBoundingClientRect().top + dialog.clientTop;
        return {
          top: bounds.top - outline,
          bottom: bounds.bottom + outline,
          viewportTop: top,
          viewportBottom: top + dialog.clientHeight,
        };
      });
      expect(focus.top).toBeGreaterThanOrEqual(focus.viewportTop);
      expect(focus.bottom).toBeLessThanOrEqual(focus.viewportBottom);
    }
    async function wheelTo(target: Locator, direction: number, ratio = 0) {
      // Engines may limit one wheel event to a fraction of the viewport.
      // Stop only when the target has the visibility required by the next action.
      await expect(async () => {
        await page.mouse.wheel(0, direction * 800);
        await expect(target).toBeInViewport({ ratio, timeout: 100 });
      }).toPass({ timeout: 10_000, intervals: [50] });
    }

    await expect(close).toBeFocused();
    await expect(close).toBeInViewport({ ratio: 1 });
    const bounds = (await help.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(height);

    // Wheel input must reach content even when the header exceeds the viewport.
    // scrollIntoView() alone could conceal an overflow:hidden regression.
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await wheelTo(help.getByText(/The scenario defines what should happen/), 1);
    await wheelTo(close, -1, 1);
    await expect(help.getByRole("heading", { name: "How it works" })).toBeInViewport();
    await expect(close).toBeInViewport({ ratio: 1 });

    await close.focus();
    await page.keyboard.press(tab);
    await expectFocusedTabInView(help.getByRole("tab", { name: "In the browser", exact: true }));
    await page.keyboard.press("ArrowRight");
    const cliTab = help.getByRole("tab", { name: "From the command line", exact: true });
    await expectFocusedTabInView(cliTab);
    await page.keyboard.press(tab);
    await expect(help.getByRole("tabpanel", { name: "From the command line", exact: true })).toBeFocused();
    await page.keyboard.press(tab);
    const command = help.getByRole("region", { name: "CLI verification command" });
    await expect(command).toBeFocused();
    await expect(command).toBeInViewport();
    await page.keyboard.press(tab);
    const readme = help.getByRole("link", { name: "CLI setup and full instructions" });
    await expect(readme).toBeFocused();
    await expect(readme).toBeInViewport();

    for (const element of [help, help.getByRole("tabpanel", { name: "From the command line", exact: true }), command]) {
      expect(await element.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    }
    await cliTab.click();
    await page.keyboard.press("ArrowLeft");
    const browserTab = help.getByRole("tab", { name: "In the browser", exact: true });
    await expectFocusedTabInView(browserTab);
    await page.keyboard.press(tab);
    await expect(help.getByRole("tabpanel", { name: "In the browser", exact: true })).toBeFocused();
    await page.keyboard.press(tab);
    await expect(help.getByRole("tab", { name: "Verify observation", exact: true })).toBeFocused();
    await page.keyboard.press("ArrowRight");
    const inspect = help.getByRole("tab", { name: "Inspect evidence", selected: true });
    await expect(inspect).toBeFocused();
    await expect(inspect).toBeInViewport({ ratio: 1 });
    await page.keyboard.press(tab);
    await expect(help.getByRole("tabpanel", { name: "Inspect evidence", exact: true })).toBeFocused();
    expect(await help.getByRole("tabpanel", { name: "In the browser", exact: true })
      .evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);

    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await wheelTo(help.getByText(/For saved verified executions and sequences/), 1);
    await wheelTo(close, -1, 1);
    await expect(close).toBeInViewport({ ratio: 1 });
    await close.click();
    await expect(help).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(page.getByLabel("Execution ID", { exact: true })).toHaveValue("preserved-through-scaling");
    await page.keyboard.press("Space");
    await expect(close).toBeFocused();

    // Restoring space also restores the usual independently scrolling panel.
    await page.setViewportSize({ width: 320, height: 800 });
    await page.locator("html").evaluate(element => { element.style.fontSize = "100%"; });
    await help.getByRole("tab", { name: "From the command line", exact: true }).click();
    await command.hover();
    await wheelTo(readme, 1);
    await expect(close).toBeInViewport({ ratio: 1 });
    await page.keyboard.press("Escape");
    await expect(help).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(page.getByLabel("Execution ID", { exact: true })).toHaveValue("preserved-through-scaling");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  });
}
