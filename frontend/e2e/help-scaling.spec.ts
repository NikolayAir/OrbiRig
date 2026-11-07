import { expect, test, type Locator, type Page } from "@playwright/test";

test("opening an explanation scrolls towards the workflow selector without moving page focus", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 800 });
  await page.goto("/");
  await page.getByRole("button", { name: "In the browser", exact: true }).click();
  const help = page.getByRole("dialog", { name: "How it works" });
  const panel = help.getByRole("tabpanel", { name: "In the browser", exact: true });
  const summary = help.locator(".workflow-help-example summary");
  await summary.click();
  await expect(summary.locator("..")).toHaveAttribute("open", "");
  await expect.poll(() => panel.evaluate(node => node.scrollTop)).toBeGreaterThan(0);
  await expect(help.getByRole("tablist", { name: "Browser instructions" })).toBeInViewport();
  const scrollTop = await panel.evaluate(node => node.scrollTop);
  await summary.click();
  // Closing a section does not schedule another automatic scroll.
  await expect(summary.locator("..")).not.toHaveAttribute("open", "");
  expect(await panel.evaluate(node => node.scrollTop)).toBeLessThanOrEqual(scrollTop);
});

for (const { width, height, textScale, columns } of [
  { width: 1440, height: 900, textScale: 100, columns: 3 },
  { width: 1920, height: 1080, textScale: 100, columns: 3 },
  { width: 768, height: 800, textScale: 100, columns: 3 },
  { width: 600, height: 800, textScale: 100, columns: 2 },
  { width: 390, height: 844, textScale: 100, columns: 1 },
  { width: 390, height: 844, textScale: 200, columns: 1 },
]) {
  test(`help documentation links adapt at ${width}x${height} with ${textScale}% text`, async ({ page, browserName }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await page.locator("html").evaluate((element, scale) => { element.style.fontSize = `${scale}%`; }, textScale);
    await page.getByRole("button", { name: "In the browser", exact: true }).click();
    const help = page.getByRole("dialog", { name: "How it works" });
    const tabKey = browserName === "webkit" && process.platform === "darwin" ? "Alt+Tab" : "Tab";
    const dialogWidth = (await help.boundingBox())!.width;
    expect(dialogWidth).toBeLessThanOrEqual(width - 30);
    if (width >= 1440 && textScale === 100) expect(dialogWidth).toBeCloseTo(1136, 0);

    for (const [tab, count] of [["Verify observation", 2], ["Inspect evidence", 3]] as const) {
      await help.getByRole("tab", { name: tab, exact: true }).click();
      const panel = help.getByRole("tabpanel", { name: tab, exact: true });
      await panel.locator(".workflow-help-reference summary").click();
      const list = panel.locator(".workflow-help-links");
      const items = list.getByRole("listitem");
      const links = list.getByRole("link");
      await expect(links).toHaveCount(count);
      const boxes = await items.evaluateAll(nodes => nodes.map(node => {
        const rect = node.getBoundingClientRect();
        return { top: rect.top, left: rect.left };
      }));
      if (columns === 1) {
        for (let i = 1; i < boxes.length; i++) expect(boxes[i].top).toBeGreaterThan(boxes[i - 1].top);
      } else if (columns === 2 && count === 3) {
        expect(boxes[1].top).toBeCloseTo(boxes[0].top, 0);
        expect(boxes[1].left).toBeGreaterThan(boxes[0].left);
        expect(boxes[2].top).toBeGreaterThan(boxes[0].top);
        expect(boxes[2].left).toBeCloseTo(boxes[0].left, 0);
      } else {
        for (let i = 1; i < boxes.length; i++) {
          expect(boxes[i].top).toBeCloseTo(boxes[0].top, 0);
          expect(boxes[i].left).toBeGreaterThan(boxes[i - 1].left);
        }
      }
      for (const element of [help, help.getByRole("tabpanel", { name: "In the browser", exact: true }), list]) {
        expect(await element.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
      }
      await page.keyboard.press(tabKey);
      await links.first().focus();
      for (let i = 0; i < count; i++) {
        const link = links.nth(i);
        await expect(link).toBeFocused();
        await expect(link).toHaveCSS("text-decoration-line", "underline");
        await expect(link).toHaveCSS("outline-style", "solid");
        const visible = await link.evaluate(node => {
          const rect = node.getBoundingClientRect();
          const dialog = node.closest("dialog")!.getBoundingClientRect();
          const panel = node.closest(".workflow-help-content")!.getBoundingClientRect();
          const style = getComputedStyle(node);
          const outline = parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset);
          return rect.left - outline >= dialog.left && rect.right + outline <= dialog.right &&
            rect.top - outline >= Math.max(dialog.top, panel.top) &&
            rect.bottom + outline <= Math.min(dialog.bottom, panel.bottom);
        });
        expect(visible).toBe(true);
        if (i + 1 < count) await page.keyboard.press(tabKey);
      }
    }
  });
}

for (const { height, textScale, fontFamily } of [
  { height: 480, textScale: 200 },
  { height: 480, textScale: 200, fontFamily: "monospace" },
  // The layout viewport of a 1280x800 browser window at 400% zoom.
  { height: 200, textScale: 100 },
]) {
  test.describe(`help at 320x${height} with ${textScale}% text${fontFamily ? ` in ${fontFamily}` : ""}`, () => {
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
        const panel = element.closest<HTMLElement>(".workflow-help-content");
        const panelTop = panel ? panel.getBoundingClientRect().top + panel.clientTop : top;
        const panelBottom = panel ? panelTop + panel.clientHeight : top + dialog.clientHeight;
        return {
          top: bounds.top - outline,
          bottom: bounds.bottom + outline,
          viewportTop: Math.max(top, panelTop),
          viewportBottom: Math.min(top + dialog.clientHeight, panelBottom),
        };
      });
      expect(focus.top).toBeGreaterThanOrEqual(focus.viewportTop);
      expect(focus.bottom).toBeLessThanOrEqual(focus.viewportBottom);
    }
    async function wheelTo(page: Page, target: Locator, direction: number, ratio = 0) {
      // Engines may limit one wheel event to a fraction of the viewport.
      // Short steps also avoid skipping the target in very short windows.
      await expect(async () => {
        await page.mouse.wheel(0, direction * Math.min(800, height / 2));
        await expect(target).toBeInViewport({ ratio, timeout: 100 });
      }).toPass({ timeout: 10_000, intervals: [50] });
    }

    test.beforeEach(async ({ page }) => {
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
      await expect(close).toBeFocused();
      await expect(close).toBeInViewport({ ratio: 1 });
      const bounds = (await help.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.y).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(height);
    });

    test("scrolls Verify observation instructions and Close into view", async ({ page }) => {
      const trigger = page.getByRole("button", { name: "In the browser", exact: true });
      const help = page.getByRole("dialog", { name: "How it works" });
      const close = help.getByRole("button", { name: "Close", exact: true });
      const bounds = (await help.boundingBox())!;
      // Wheel input must reach content even when the header exceeds the viewport.
      // scrollIntoView() alone could conceal an overflow:hidden regression.
      await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      await wheelTo(page, help.locator(".workflow-help-reference summary").first(), 1);
      await wheelTo(page, close, -1, 1);
      await expect(help.getByRole("heading", { name: "How it works" })).toBeInViewport();
      await expect(close).toBeInViewport({ ratio: 1 });
      await close.click();
      await expect(help).toBeHidden();
      await expect(trigger).toBeFocused();
      await expect(page.getByLabel("Execution ID", { exact: true })).toHaveValue("preserved-through-scaling");
    });

    test("keeps keyboard navigation and explanations reachable", async ({ page, browserName }) => {
      const trigger = page.getByRole("button", { name: "In the browser", exact: true });
      const help = page.getByRole("dialog", { name: "How it works" });
      const close = help.getByRole("button", { name: "Close", exact: true });
      const bounds = (await help.boundingBox())!;
      const tab = browserName === "webkit" && process.platform === "darwin" ? "Alt+Tab" : "Tab";
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
      await expectFocusedTabInView(help.getByRole("tab", { name: "Verify observation", exact: true }));
      await page.keyboard.press(tab);
      const verificationPanel = help.getByRole("tabpanel", { name: "Verify observation", exact: true });
      await expect(verificationPanel).toBeFocused();
      const verificationSteps = verificationPanel.locator(":scope > ol");
      await expect(verificationSteps.getByRole("listitem")).toHaveCount(4);
      const firstStep = verificationSteps.getByRole("listitem").first();
      const stepInView = await firstStep.evaluate(element => new Promise<boolean>(resolve => {
        const observer = new IntersectionObserver(([entry]) => {
          observer.disconnect();
          resolve(entry.isIntersecting);
        });
        observer.observe(element);
      }));
      if (!stepInView) {
        const direction = await firstStep.evaluate(element => {
          const item = element.getBoundingClientRect();
          const panel = element.closest(".workflow-help-content")!.getBoundingClientRect();
          return item.bottom <= Math.max(0, panel.top) ? -1 : 1;
        });
        await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
        await wheelTo(page, firstStep, direction);
      }
      await expect(firstStep).toBeInViewport();
      await page.keyboard.press(tab);
      const summary = help.locator(".workflow-help-example summary");
      const illustration = help.locator(".workflow-help-example");
      await expect(verificationPanel.locator(".workflow-help-example")).toHaveCount(1);
      expect(await verificationPanel.evaluate(panel => panel.firstElementChild?.nextElementSibling?.matches("details.workflow-help-example"))).toBe(true);
      await expectFocusedTabInView(summary);
      await expect(illustration).not.toHaveAttribute("open", "");
      await page.keyboard.press("Enter");
      await expect(illustration).toHaveAttribute("open", "");
      expect(await illustration.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
      await page.keyboard.press(tab);
      const exampleLink = help.getByRole("link", { name: "Reproduce the stateful-target example" });
      await expectFocusedTabInView(exampleLink);
      await summary.focus();
      await page.keyboard.press("Space");
      await expect(illustration).not.toHaveAttribute("open", "");
      await summary.click();
      await expect(illustration).toHaveAttribute("open", "");
      await summary.click();
      await expect(illustration).not.toHaveAttribute("open", "");
      await summary.focus();
      await page.keyboard.press(tab);
      const reference = verificationPanel.locator(".workflow-help-reference summary");
      await expectFocusedTabInView(reference);
      await page.keyboard.press("Enter");
      for (const name of ["Supported scenarios and checks", "Execution ID and UTC time rules"]) {
        await page.keyboard.press(tab);
        const link = help.getByRole("link", { name });
        await expectFocusedTabInView(link);
      }
      await help.getByRole("tab", { name: "Verify observation", exact: true }).focus();
      await expectFocusedTabInView(help.getByRole("tab", { name: "Verify observation", exact: true }));
      await page.keyboard.press("ArrowRight");
      const inspect = help.getByRole("tab", { name: "Inspect evidence", selected: true });
      await expectFocusedTabInView(inspect);
      await expect(summary).not.toBeVisible();
      await page.keyboard.press(tab);
      await expect(help.getByRole("tabpanel", { name: "Inspect evidence", exact: true })).toBeFocused();
      expect(await help.getByRole("tabpanel", { name: "In the browser", exact: true })
        .evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
      await page.keyboard.press("Escape");
      await expect(help).toBeHidden();
      await expect(trigger).toBeFocused();
      await expect(page.getByLabel("Execution ID", { exact: true })).toHaveValue("preserved-through-scaling");
    });

    test("scrolls Inspect evidence instructions and Close into view", async ({ page }) => {
      const trigger = page.getByRole("button", { name: "In the browser", exact: true });
      const help = page.getByRole("dialog", { name: "How it works" });
      const close = help.getByRole("button", { name: "Close", exact: true });
      const bounds = (await help.boundingBox())!;
      await help.getByRole("tab", { name: "Inspect evidence", exact: true }).click();
      await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      await help.getByRole("tabpanel", { name: "Inspect evidence", exact: true }).locator(".workflow-help-reference summary").click();
      await wheelTo(page, help.getByText(/For saved verified executions and sequences/), 1);
      await wheelTo(page, close, -1, 1);
      await expect(close).toBeInViewport({ ratio: 1 });
      await close.click();
      await expect(help).toBeHidden();
      await expect(trigger).toBeFocused();
      await expect(page.getByLabel("Execution ID", { exact: true })).toHaveValue("preserved-through-scaling");
    });

    test("restores panel scrolling after resizing", async ({ page }) => {
      const trigger = page.getByRole("button", { name: "In the browser", exact: true });
      const help = page.getByRole("dialog", { name: "How it works" });
      const close = help.getByRole("button", { name: "Close", exact: true });
      await close.click();
      await expect(help).toBeHidden();
      await expect(trigger).toBeFocused();
      await expect(page.getByLabel("Execution ID", { exact: true })).toHaveValue("preserved-through-scaling");
      await page.keyboard.press("Space");
      await expect(close).toBeFocused();

      const command = help.getByRole("region", { name: "CLI verification command" });
      const readme = help.getByRole("link", { name: "CLI setup and full instructions" });
      await expect(help).toHaveAttribute("data-scroll-whole", "true");

      // Restoring space also restores the usual independently scrolling panel.
      await page.setViewportSize({ width: 320, height: 800 });
      await page.locator("html").evaluate(element => { element.style.fontSize = "100%"; });
      await help.getByRole("tab", { name: "From the command line", exact: true }).click();
      await expect(help).toHaveAttribute("data-scroll-whole", "false");
      await command.hover();
      await wheelTo(page, readme, 1);
      await expect(close).toBeInViewport({ ratio: 1 });
      expect(await help.getByRole("tabpanel", { name: "From the command line", exact: true }).evaluate(panel => panel.scrollTop)).toBeGreaterThan(0);
      expect(await help.evaluate(dialog => dialog.scrollTop)).toBe(0);
      await page.keyboard.press("Escape");
      await expect(help).toBeHidden();
      await expect(trigger).toBeFocused();
      await expect(page.getByLabel("Execution ID", { exact: true })).toHaveValue("preserved-through-scaling");
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
    });
  });
}

test("ordinary scrolling clips workflow tabs at the content boundary below the fixed header", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.goto("/");
  await page.getByRole("button", { name: "In the browser", exact: true }).click();
  const help = page.getByRole("dialog", { name: "How it works" });
  const header = help.locator(".workflow-help-header");
  const panel = help.getByRole("tabpanel", { name: "In the browser", exact: true });
  const tabs = help.getByRole("tablist", { name: "Browser instructions" });
  await help.getByRole("tabpanel", { name: "Verify observation", exact: true }).locator(".workflow-help-reference summary").click();
  const initialHeader = (await header.boundingBox())!;
  const panelBounds = (await panel.boundingBox())!;
  await page.mouse.move(panelBounds.x + panelBounds.width / 2, panelBounds.y + panelBounds.height / 2);

  // Use wheel input to observe the tabs crossing the panel's clipping edge.
  await expect(async () => {
    await page.mouse.wheel(0, 12);
    await page.evaluate(() => new Promise(requestAnimationFrame));
    const tabBounds = (await tabs.boundingBox())!;
    const contentBounds = (await panel.boundingBox())!;
    expect(tabBounds.y).toBeLessThan(contentBounds.y);
    expect(tabBounds.y + tabBounds.height).toBeGreaterThan(contentBounds.y);
  }).toPass({ timeout: 15_000, intervals: [20] });

  const headerBounds = (await header.boundingBox())!;
  const contentBounds = (await panel.boundingBox())!;
  expect(headerBounds.y).toBeCloseTo(initialHeader.y, 1);
  expect(headerBounds.y + headerBounds.height).toBeCloseTo(contentBounds.y, 1);
  const headerOwnsArea = await header.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    const hit = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.bottom - 2);
    return hit !== null && element.contains(hit);
  });
  expect(headerOwnsArea).toBe(true);

  await tabs.getByRole("tab", { name: "Verify observation" }).focus();
  await page.keyboard.press("ArrowRight");
  const selected = tabs.getByRole("tab", { name: "Inspect evidence", selected: true });
  await expect(selected).toBeFocused();
  const focusedTop = await selected.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const panel = element.closest<HTMLElement>(".workflow-help-content")!;
    return {
      top: bounds.top - parseFloat(style.outlineWidth) - parseFloat(style.outlineOffset),
      viewportTop: panel.getBoundingClientRect().top + panel.clientTop,
    };
  });
  expect(focusedTop.top).toBeGreaterThanOrEqual(focusedTop.viewportTop);
});
