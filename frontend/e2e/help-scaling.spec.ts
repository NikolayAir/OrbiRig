import { expect, test, type Locator, type Page } from "@playwright/test";

import { expectBottomClearance, expectFocusedControlFullyVisible, sectionPosition } from "./help-support";

const SECTIONS = [
  { guide: "In the browser", workflow: "Verify observation", title: "When a command returns no result" },
  { guide: "In the browser", workflow: "Verify observation", title: "Understanding results and further reading" },
  { guide: "In the browser", workflow: "Inspect evidence", title: "Understanding inspection and further reading" },
  { guide: "From the command line", workflow: null, title: "Understanding CLI results and exit codes" },
  { guide: "From the command line", workflow: null, title: "Verify a C#/.NET program" },
] as const;

for (const { width, height, textScale } of [
  { width: 1440, height: 900, textScale: 100 },
  { width: 390, height: 844, textScale: 100 },
  { width: 320, height: 480, textScale: 200 },
  // A short window, as with browser zoom at 400%, where the whole dialog scrolls.
  { width: 320, height: 200, textScale: 100 },
]) {
  for (const input of ["mouse", "keyboard"] as const) {
    test(`opening a help section by ${input} shows its heading and beginning at ${width}x${height} with ${textScale}% text`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto("/");
      await page.locator("html").evaluate((element, scale) => { element.style.fontSize = `${scale}%`; }, textScale);
      // Scroll the page behind the dialog where it can scroll, to see that it stays put.
      await page.evaluate(() => window.scrollTo(0, 100));

      for (const { guide, workflow, title } of SECTIONS) {
        await page.getByRole("button", { name: guide, exact: true }).click();
        const help = page.getByRole("dialog", { name: "How it works" });
        await expect(help).toBeVisible();
        // Playwright may scroll the page to reach the button, so measure from here.
        const pageScroll = await page.evaluate(() => window.scrollY);
        if (workflow) await help.getByRole("tab", { name: workflow, exact: true }).click();
        const summary = help.locator("summary", { hasText: title });
        const details = summary.locator("..");
        if (input === "keyboard") {
          // Switch to keyboard input before focusing a summary so its outline is drawn.
          await page.keyboard.press("Tab");
          await summary.focus();
          await page.keyboard.press("Enter");
        } else {
          await summary.click();
        }

        await expect(details).toHaveAttribute("open", "");
        const opened = await sectionPosition(details);
        // The heading is never cut off at the top; one pixel allows for rounding.
        expect(opened.above).toBeGreaterThanOrEqual(-1);
        if (opened.height <= opened.areaHeight - 2 * opened.margin) {
          // A section that fits is shown whole.
          expect(opened.below).toBeGreaterThanOrEqual(-1);
        } else {
          // A longer one starts at the top margin instead of jumping to its end.
          expect(Math.abs(opened.above - opened.margin)).toBeLessThanOrEqual(1.5);
        }
        if (input === "keyboard") {
          await expectFocusedControlFullyVisible(summary);
        } else {
          await expect(summary).toBeInViewport({ ratio: 1 });
        }
        expect(await page.evaluate(() => window.scrollY)).toBe(pageScroll);

        if (input === "keyboard") {
          await page.keyboard.press("Enter");
        } else {
          // Click the visible heading without Playwright adjusting its scroll position.
          const bounds = (await summary.boundingBox())!;
          await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
        }
        await expect(details).not.toHaveAttribute("open");
        // Closing moves nothing, apart from the limit that the shorter content imposes.
        const closed = await sectionPosition(details);
        expect(closed.scrollTop).toBe(Math.min(opened.scrollTop, closed.maxScrollTop));
        expect(await page.evaluate(() => window.scrollY)).toBe(pageScroll);
        await page.keyboard.press("Escape");
        await expect(help).toBeHidden();
      }
    });
  }
}

test("collapsed browser and command-line help have the same bottom spacing", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "In the browser", exact: true }).click();
  const help = page.getByRole("dialog", { name: "How it works" });
  for (const tab of ["In the browser", "From the command line"]) {
    await help.getByRole("tab", { name: tab, exact: true }).click();
    const panel = help.getByRole("tabpanel", { name: tab });
    await expect(panel.locator("details[open]")).toHaveCount(0);
    const lastSection = await sectionPosition(panel.locator("details:visible").last());
    expect(lastSection.maxScrollTop).toBe(0);
    expect(lastSection.below).toBeCloseTo(28, 0);
  }
});

test("compact help keeps visual and keyboard order aligned", async ({ page, browserName }) => {
  await page.goto("/");
  const summary = page.getByRole("list", { name: "How a check works" });
  const section = page.getByRole("region", { name: "How it works", exact: true });
  const heading = section.getByRole("heading", { name: "How it works", exact: true });
  const browser = section.getByRole("button", { name: "In the browser", exact: true });
  const cli = section.getByRole("button", { name: "From the command line", exact: true });
  const documentation = section.getByRole("link", { name: "Documentation (opens in a new tab)", exact: true });
  const macWebKit = browserName === "webkit" && process.platform === "darwin";
  const next = macWebKit ? "Alt+Tab" : "Tab";
  const previous = macWebKit ? "Alt+Shift+Tab" : "Shift+Tab";

  const widths = [320, 375, 393, 430, 480, 1440];
  const sizes = widths.flatMap(width => [100, 200].map(scale => ({ width, scale })));
  for (const { width, scale } of sizes) {
    await test.step(`at ${width}px with ${scale}% text`, async () => {
      await page.setViewportSize({ width, height: 852 });
      await page.locator("html").evaluate((element, scale) => { element.style.fontSize = `${scale}%`; }, scale);
      await expect(documentation).toHaveCount(1);
      const compact = width <= 640;
      // Use DOMRect dimensions to avoid rounding the 44px touch targets in Firefox.
      const [flow, help, title, link, browserButton, cliButton] = await Promise.all(
        [summary, section, heading, documentation, browser, cli].map(element => element.evaluate(node => {
          const { x, y, width, height } = node.getBoundingClientRect();
          const fitsContent = node.scrollWidth <= node.clientWidth && node.scrollHeight <= node.clientHeight;
          return { x, y, width, height, fitsContent };
        })),
      );
      const rem = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
      const gapAbove = help.y - (flow.y + flow.height);
      expect(gapAbove).toBeGreaterThanOrEqual(0);
      expect(gapAbove).toBeLessThanOrEqual(rem / 2);
      const desktopRow = !compact && scale === 100;
      const visualOrder = compact
        ? [title, link, browserButton, cliButton]
        : [title, browserButton, cliButton, link];
      expect(title.x).toBeCloseTo(help.x, 0);
      expect(link.x + link.width).toBeCloseTo(help.x + help.width, 0);
      for (const [index, second] of visualOrder.slice(1).entries()) {
        const first = visualOrder[index];
        const sameRow = first.y < second.y + second.height && second.y < first.y + first.height;
        if (sameRow) {
          expect(second.x).toBeGreaterThanOrEqual(first.x + first.width);
        } else {
          expect(second.y).toBeGreaterThanOrEqual(first.y + first.height);
        }
        if (desktopRow) expect(sameRow).toBe(true);
      }
      if (desktopRow) {
        expect(browserButton.x - (title.x + title.width)).toBeLessThanOrEqual(1.5 * rem + 0.5);
      }
      if (compact) {
        if (scale === 100) expect(link.y).toBeLessThan(title.y + title.height);
        const gapBeforeButtons = browserButton.y - Math.max(title.y + title.height, link.y + link.height);
        expect(gapBeforeButtons).toBeGreaterThanOrEqual(0);
        expect(gapBeforeButtons).toBeLessThanOrEqual(rem / 2);
      }
      for (const bounds of [link, browserButton, cliButton]) {
        expect(bounds.width).toBeGreaterThanOrEqual(44);
        expect(bounds.height).toBeGreaterThanOrEqual(44);
        expect(bounds.x).toBeGreaterThanOrEqual(0);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
        expect(bounds.fitsContent).toBe(true);
      }
      if (width >= 480 && scale === 100) expect(cliButton.y).toBeCloseTo(browserButton.y, 0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);

      const [first, second, last] = compact ? [documentation, browser, cli] : [browser, cli, documentation];
      await first.focus();
      for (const [key, control] of [[next, second], [next, last], [previous, second], [previous, first]] as const) {
        await page.keyboard.press(key);
        await expect(control).toBeFocused();
        if (control === documentation) await expect(documentation).toHaveCSS("outline-offset", "4px");
      }
    });
  }
});

test("the command-line tab uses the spare width beside the shorter tab", async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "In the browser", exact: true }).click();
  const tabs = page.getByRole("tablist", { name: "Help sections", exact: true });
  const columns = () => tabs.evaluate(list => {
    const rowTop = list.getBoundingClientRect().top;
    return Array.from(list.querySelectorAll("button"), button => {
      const bounds = button.getBoundingClientRect();
      const label = document.createRange();
      label.selectNodeContents(button.querySelector("span")!);
      const lines = Array.from(label.getClientRects());
      return {
        width: bounds.width,
        height: bounds.height,
        top: bounds.top - rowTop,
        lines: lines.length,
        labelFits: lines.length > 0 && lines.every(line =>
          line.left >= bounds.left && line.right <= bounds.right
          && line.top >= bounds.top && line.bottom <= bounds.bottom),
      };
    });
  });

  const before = await columns();
  const [browser, cli] = before;
  expect(browser.width).toBeLessThan(cli.width);
  expect(browser.labelFits).toBe(true);
  expect(cli.labelFits).toBe(true);
  expect(cli.height).toBeCloseTo(browser.height, 1);
  expect(cli.top).toBeCloseTo(browser.top, 1);

  await tabs.getByRole("tab", { name: "In the browser", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  const cliTab = tabs.getByRole("tab", { name: "From the command line", exact: true });
  await expect(cliTab).toBeFocused();
  await expect(cliTab).toHaveAttribute("aria-selected", "true");
  expect(await columns()).toEqual(before);

  await page.setViewportSize({ width: 600, height: 900 });
  const [, widerCli] = await columns();
  expect(widerCli.labelFits).toBe(true);
  expect(widerCli.lines).toBe(1);
});

test("a one-pixel increase in a short window keeps the help header visible", async ({ page }) => {
  const width = 390;
  await page.setViewportSize({ width, height: 480 });
  await page.goto("/");
  await page.getByRole("button", { name: "From the command line", exact: true }).click();
  const help = page.getByRole("dialog", { name: "How it works" });
  const heading = help.locator("summary", { hasText: "Verify a C#/.NET program" });

  // Leave just enough room for one line and the collapsed panel's padding.
  const height = await heading.evaluate(node => {
    const panel = node.closest(".workflow-help-content")!;
    const { paddingTop, paddingBottom } = getComputedStyle(panel);
    const outsidePanel = window.innerHeight - panel.getBoundingClientRect().height;
    return Math.ceil(outsidePanel + node.getBoundingClientRect().height +
      parseFloat(paddingTop) + parseFloat(paddingBottom)) + 1;
  });
  await page.setViewportSize({ width, height });
  await expect(help).toHaveAttribute("data-scroll-whole", "false");
  await page.keyboard.press("Tab");
  await heading.press("Enter");
  await expect(heading.locator("..")).toHaveAttribute("open", "");
  await expectFocusedControlFullyVisible(heading);

  await page.setViewportSize({ width, height: height + 1 });
  // Let the resize observer run before checking which area scrolls.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(help).toHaveAttribute("data-scroll-whole", "false");
  await expect(help.getByRole("button", { name: "Close", exact: true })).toBeInViewport({ ratio: 1 });
  await expectFocusedControlFullyVisible(heading);
});

for (const { guide, width, height, textScale, scrollWhole, fit, largeTitle, atEnd } of [
  { guide: "browser", width: 1440, height: 880, textScale: 100, scrollWhole: false, fit: "both" },
  { guide: "browser", width: 390, height: 960, textScale: 100, scrollWhole: false, fit: "both", atEnd: true },
  { guide: "cli", width: 390, height: 680, textScale: 100, scrollWhole: false, fit: "both", atEnd: true },
  { guide: "cli", width: 1440, height: 1000, textScale: 200, scrollWhole: false, fit: "both" },
  { guide: "cli", width: 1440, height: 260, textScale: 100, scrollWhole: true, fit: "both", largeTitle: true },
  { guide: "cli", width: 1440, height: 200, textScale: 100, scrollWhole: true, fit: "section" },
  { guide: "browser", width: 375, height: 667, textScale: 100, scrollWhole: false, fit: "beginning" },
  { guide: "browser", width: 320, height: 480, textScale: 200, scrollWhole: true, fit: "beginning" },
]) {
  test(`following help heading respects available space in ${guide} guidance at ${width}x${height} with ${textScale}% text`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await page.locator("html").evaluate((element, scale) => { element.style.fontSize = `${scale}%`; }, textScale);
    if (largeTitle) {
      // A taller header makes the whole dialog scroll with room for the next heading.
      await page.addStyleTag({ content: ".workflow-help-heading h2 { font-size: 3rem; }" });
    }
    await page.getByRole("button", { name: guide === "browser" ? "In the browser" : "From the command line", exact: true }).click();
    const help = page.getByRole("dialog", { name: "How it works" });
    const heading = help.locator("summary", { hasText: guide === "browser" ? "When a command returns no result" : "Understanding CLI results and exit codes" });
    const following = help.locator("summary", { hasText: guide === "browser" ? "Understanding results and further reading" : "Verify a C#/.NET program" });
    const details = heading.locator("..");
    await expect(help).toHaveAttribute("data-scroll-whole", String(scrollWhole));

    // Use keyboard input to check that the whole outline still fits after scrolling.
    await page.keyboard.press("Tab");
    await heading.focus();
    await page.keyboard.press("Enter");
    await expect(details).toHaveAttribute("open", "");
    await expectFocusedControlFullyVisible(heading);
    const opened = await sectionPosition(details);

    if (fit === "both") {
      expect(opened.below).toBeGreaterThanOrEqual(-1);
      await expect(following).toBeInViewport({ ratio: 1 });
      await expectBottomClearance(following.locator(".."), atEnd);
    } else if (fit === "section") {
      // The open section gets clearance even when the following heading cannot fit.
      await expectBottomClearance(details);
      await expect(following).not.toBeInViewport({ ratio: 1 });
    } else {
      expect(Math.abs(opened.above - opened.margin)).toBeLessThanOrEqual(1.5);
      await expect(following).not.toBeInViewport();
    }
  });
}

test("opening a help section by mouse leaves space below the following heading", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 880 });
  await page.goto("/");
  await page.getByRole("button", { name: "In the browser", exact: true }).click();
  const help = page.getByRole("dialog", { name: "How it works" });
  const heading = help.locator("summary", { hasText: "When a command returns no result" });
  const details = heading.locator("..");
  const following = help.locator("summary", { hasText: "Understanding results and further reading" });

  await heading.click();

  await expect(details).toHaveAttribute("open", "");
  await expect(details).toBeInViewport({ ratio: 1 });
  await expect(following).toBeInViewport({ ratio: 1 });
  await expectBottomClearance(following.locator(".."));
});

test("reveals the following help heading when there is room for the outline but not the usual margin", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "In the browser", exact: true }).click();
  const help = page.getByRole("dialog", { name: "How it works" });
  const heading = help.locator("summary", { hasText: "When a command returns no result" });
  const following = help.locator("summary", { hasText: "Understanding results and further reading" });
  const details = heading.locator("..");
  await page.keyboard.press("Tab");
  await heading.press("Enter");
  await expect(details).toHaveAttribute("open", "");

  // Size the panel to the rendered headings and focus outline, plus a pixel for rounding.
  const height = await heading.evaluate(node => {
    const panel = node.closest(".workflow-help-content")!;
    const next = node.closest("details")!.nextElementSibling!.querySelector("summary")!;
    const style = getComputedStyle(node);
    const outline = parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset);
    const span = next.getBoundingClientRect().bottom - node.getBoundingClientRect().top;
    const spaceOutsidePanel = window.innerHeight - panel.getBoundingClientRect().height;
    return Math.ceil(spaceOutsidePanel + span + outline) + 1;
  });

  await heading.press("Enter");
  await expect(details).not.toHaveAttribute("open");
  await page.setViewportSize({ width: 1440, height });
  await expect(help).toHaveAttribute("data-scroll-whole", "false");
  await heading.press("Enter");
  await expect(details).toHaveAttribute("open", "");
  await expectFocusedControlFullyVisible(heading);
  await expect(following).toBeInViewport({ ratio: 1 });
  expect((await sectionPosition(following.locator(".."))).below).toBeLessThan(16);
});

test.describe("on a touch screen", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test("help sections open, switch and close by touch", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "In the browser", exact: true }).tap();
    const help = page.getByRole("dialog", { name: "How it works" });
    const example = help.locator("summary", { hasText: "When a command returns no result" });
    const results = help.locator("summary", { hasText: "Understanding results and further reading" });
    const exampleText = help.getByText("Example from a local run using the Python API.");
    const resultsText = help.getByText(/^PASS means the recorded behaviour matches/);

    await example.tap();
    await expect(exampleText).toBeVisible();
    await expect(exampleText).toBeInViewport();
    await results.tap();
    await expect(resultsText).toBeVisible();
    await expect(exampleText).toBeHidden();
    expect((await sectionPosition(results.locator(".."))).above).toBeGreaterThanOrEqual(-1);
    await results.tap();
    await expect(resultsText).toBeHidden();
    await help.getByRole("button", { name: "Close", exact: true }).tap();
    await expect(help).toBeHidden();
  });
});

for (const { width, height, textScale, scrollWhole } of [
  { width: 390, height: 844, textScale: 100, scrollWhole: false },
  { width: 320, height: 480, textScale: 200, scrollWhole: true },
]) {
  test(`text that the browser finds in a closed section keeps its position at ${width}x${height} with ${textScale}% text`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await page.locator("html").evaluate((element, scale) => { element.style.fontSize = `${scale}%`; }, textScale);
    await page.getByRole("button", { name: "In the browser", exact: true }).click();
    const help = page.getByRole("dialog", { name: "How it works" });
    await expect(help).toHaveAttribute("data-scroll-whole", String(scrollWhole));
    const example = help.locator("summary", { hasText: "When a command returns no result" }).locator("..");
    const results = help.locator("summary", { hasText: "Understanding results and further reading" }).locator("..");
    const found = results.getByRole("link", { name: /^Execution ID and UTC time rules/, includeHidden: true });
    await example.locator("summary").click();
    await expect(example).toHaveAttribute("open", "");

    // Reproduce a match in a closed section without driving the native search UI.
    const browserTop = await found.evaluate(match => {
      match.closest("details")!.open = true;
      match.scrollIntoView({ block: "center" });
      // Measure before the queued toggle closes the previously open section.
      return match.getBoundingClientRect().top;
    });

    await expect(example).not.toHaveAttribute("open");
    await expect(found).toBeInViewport({ ratio: 1 });
    await expect.poll(async () => Math.abs(
      await found.evaluate(match => match.getBoundingClientRect().top) - browserTop,
    )).toBeLessThanOrEqual(1.5);
  });
}

test("opening a help section moves without animation when reduced motion is requested", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "In the browser", exact: true }).click();
  const summary = page.getByRole("dialog", { name: "How it works" }).locator("summary", { hasText: "Understanding results and further reading" });
  const details = summary.locator("..");
  await summary.click();
  await expect(details).toHaveAttribute("open", "");
  const settled = (await sectionPosition(details)).scrollTop;
  expect(settled).toBeGreaterThan(0);
  // Smooth scrolling would still be moving after the click has finished.
  await page.waitForTimeout(300);
  expect((await sectionPosition(details)).scrollTop).toBe(settled);
});

for (const { before, after, scrollWhole, control } of [
  { before: 800, after: 200, scrollWhole: true, control: "section heading" },
  { before: 200, after: 800, scrollWhole: false, control: "section heading" },
  { before: 800, after: 200, scrollWhole: true, control: "Close button" },
  { before: 800, after: 200, scrollWhole: true, control: "guide link" },
  { before: 200, after: 800, scrollWhole: false, control: "guide link" },
] as const) {
  const scroller = scrollWhole ? "dialog" : "content panel";
  test(`the focused ${control} stays visible when resizing switches scrolling to the ${scroller}`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: before });
    await page.goto("/");
    await page.getByRole("button", { name: "From the command line", exact: true }).click();
    const help = page.getByRole("dialog", { name: "How it works" });
    const heading = help.locator("summary", { hasText: "Verify a C#/.NET program" });
    const details = heading.locator("..");
    const focused = {
      "section heading": heading,
      "Close button": help.getByRole("button", { name: "Close", exact: true }),
      "guide link": help.getByRole("link", { name: /^Build and verify the C#\/\.NET example/ }),
    }[control];
    await expect(help).toHaveAttribute("data-scroll-whole", String(!scrollWhole));

    // Switch to keyboard input before focusing the heading so its outline is drawn.
    await page.keyboard.press("Tab");
    await heading.focus();
    await page.keyboard.press("Enter");
    await expect(details).toHaveAttribute("open", "");
    if (control !== "section heading") await focused.focus();
    await expectFocusedControlFullyVisible(focused);

    await page.setViewportSize({ width: 320, height: after });
    await expect(help).toHaveAttribute("data-scroll-whole", String(scrollWhole));
    await expect(details).toHaveAttribute("open", "");
    await expectFocusedControlFullyVisible(focused);
  });
}

test("only one help section stays open across workflows and command-line guidance", async ({ page }) => {
  const apiRequests: string[] = [];
  page.on("request", request => {
    if (new URL(request.url()).pathname.startsWith("/api/")) apiRequests.push(request.url());
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const input = page.getByLabel("Execution ID", { exact: true });
  await input.fill("keep-during-sections");
  const trigger = page.getByRole("button", { name: "In the browser", exact: true });
  await trigger.click();
  const help = page.getByRole("dialog", { name: "How it works" });
  const summary = (title: string) => help.locator("summary", { hasText: title });
  const example = { summary: summary("When a command returns no result"), text: help.getByText("Example from a local run using the Python API.") };
  const results = { summary: summary("Understanding results and further reading"), text: help.getByText(/^PASS means the recorded behaviour matches/) };
  const inspection = { summary: summary("Understanding inspection and further reading"), text: help.getByText(/^Inspecting an observation validates/) };
  const cliResults = { summary: summary("Understanding CLI results and exit codes"), text: help.getByText(/^Exit code/) };
  const dotnet = { summary: summary("Verify a C#/.NET program"), text: help.getByText("Example outcomes from a local run", { exact: true }) };
  const tab = (name: string) => help.getByRole("tab", { name, exact: true });

  await example.summary.click();
  await expect(example.text).toBeVisible();
  await results.summary.click();
  await expect(results.text).toBeVisible();
  await expect(example.text).toBeHidden();

  // The keyboard behaves like the pointer: Enter and Space open and close a section.
  await results.summary.focus();
  await page.keyboard.press("Enter");
  await expect(results.text).toBeHidden();
  await page.keyboard.press("Space");
  await expect(results.text).toBeVisible();
  await example.summary.focus();
  await page.keyboard.press("Enter");
  await expect(example.text).toBeVisible();
  await expect(results.text).toBeHidden();

  // Another workflow starts closed, and so does the first one when the reader returns.
  await tab("Inspect evidence").click();
  await expect(example.text).toBeHidden();
  await inspection.summary.click();
  await expect(inspection.text).toBeVisible();
  await tab("Verify observation").click();
  await expect(example.text).toBeHidden();
  await tab("Inspect evidence").click();
  await expect(inspection.text).toBeHidden();

  await tab("From the command line").click();
  await cliResults.summary.click();
  await expect(cliResults.text).toBeVisible();
  await dotnet.summary.click();
  await expect(dotnet.text).toBeVisible();
  await expect(cliResults.text).toBeHidden();
  await tab("In the browser").click();
  await tab("From the command line").click();
  await expect(dotnet.text).toBeHidden();

  await dotnet.summary.click();
  await expect(dotnet.text).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(help).toBeHidden();
  await trigger.click();
  await expect(help).toBeVisible();
  await expect(example.text).toBeHidden();
  await expect(input).toHaveValue("keep-during-sections");
  expect(apiRequests).toEqual([]);
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
    if (width >= 1440 && textScale === 100) expect(dialogWidth).toBeCloseTo(1281, 0);

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
        await expectFocusedControlFullyVisible(link);
        await expect(link).toHaveCSS("text-decoration-line", "underline");
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
    async function wheelTo(page: Page, target: Locator, direction: number, ratio = 0) {
      const step = await target.evaluate(element => {
        const dialog = element.closest("dialog")!;
        const panel = element.closest(".workflow-help-content");
        const scroller = dialog.dataset.scrollWhole === "true" ? dialog : panel ?? dialog;
        // Keep each scroll shorter than the visible area so successive views overlap.
        return Math.floor(scroller.clientHeight * 0.75);
      });
      await expect(async () => {
        await page.mouse.wheel(0, direction * step);
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
      // Close can scroll into view before the title when the header wraps.
      await wheelTo(page, help.getByRole("heading", { name: "How it works" }), -1);
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
      await expectFocusedControlFullyVisible(help.getByRole("tab", { name: "In the browser", exact: true }));
      await page.keyboard.press("ArrowRight");
      const cliTab = help.getByRole("tab", { name: "From the command line", exact: true });
      await expectFocusedControlFullyVisible(cliTab);
      await page.keyboard.press(tab);
      await expect(help.getByRole("tabpanel", { name: "From the command line", exact: true })).toBeFocused();
      await page.keyboard.press(tab);
      const command = help.getByRole("region", { name: "CLI verification command" });
      await expect(command).toBeFocused();
      await expect(command).toBeInViewport();
      await page.keyboard.press(tab);
      // The exit codes and the documentation link wait in a section that starts closed.
      const cliResults = help.locator("summary", { hasText: "Understanding CLI results and exit codes" });
      await expectFocusedControlFullyVisible(cliResults);
      await page.keyboard.press("Enter");
      await page.keyboard.press(tab);
      const readme = help.getByRole("link", { name: "CLI setup and full instructions" });
      await expectFocusedControlFullyVisible(readme);

      for (const element of [help, help.getByRole("tabpanel", { name: "From the command line", exact: true }), command]) {
        expect(await element.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
      }
      await cliTab.click();
      await page.keyboard.press("ArrowLeft");
      const browserTab = help.getByRole("tab", { name: "In the browser", exact: true });
      await expectFocusedControlFullyVisible(browserTab);
      await page.keyboard.press(tab);
      await expect(help.getByRole("tabpanel", { name: "In the browser", exact: true })).toBeFocused();
      await page.keyboard.press(tab);
      await expectFocusedControlFullyVisible(help.getByRole("tab", { name: "Verify observation", exact: true }));
      await page.keyboard.press(tab);
      const verificationPanel = help.getByRole("tabpanel", { name: "Verify observation", exact: true });
      await expect(verificationPanel).toBeFocused();
      const verificationSteps = verificationPanel.locator(":scope > ol");
      await expect(verificationSteps.getByRole("listitem")).toHaveCount(5);
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
      await expect(verificationPanel.locator(":scope > ol + details.workflow-help-example")).toHaveCount(1);
      await expectFocusedControlFullyVisible(summary);
      await expect(illustration).not.toHaveAttribute("open", "");
      await page.keyboard.press("Enter");
      await expect(illustration).toHaveAttribute("open", "");
      expect(await illustration.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
      await page.keyboard.press(tab);
      const exampleLink = help.getByRole("link", { name: "Run the Python example" });
      await expectFocusedControlFullyVisible(exampleLink);
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
      await expectFocusedControlFullyVisible(reference);
      await page.keyboard.press("Enter");
      for (const name of ["Supported scenarios and checks", "Execution ID and UTC time rules"]) {
        await page.keyboard.press(tab);
        const link = help.getByRole("link", { name });
        await expectFocusedControlFullyVisible(link);
      }
      await help.getByRole("tab", { name: "Verify observation", exact: true }).focus();
      await expectFocusedControlFullyVisible(help.getByRole("tab", { name: "Verify observation", exact: true }));
      await page.keyboard.press("ArrowRight");
      const inspect = help.getByRole("tab", { name: "Inspect evidence", selected: true });
      await expectFocusedControlFullyVisible(inspect);
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
      await wheelTo(page, help.getByText(/^For verified evidence/), 1);
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

      await expect(help).toHaveAttribute("data-scroll-whole", "true");

      // Restoring space also restores the usual independently scrolling panel.
      await page.setViewportSize({ width: 320, height: 800 });
      await page.locator("html").evaluate(element => { element.style.fontSize = "100%"; });
      await help.getByRole("tab", { name: "From the command line", exact: true }).click();
      await expect(help).toHaveAttribute("data-scroll-whole", "false");

      const panel = help.getByRole("tabpanel", { name: "From the command line", exact: true });
      const command = panel.getByRole("region", { name: "CLI verification command" });
      const example = panel.locator("summary", { hasText: "Verify a C#/.NET program" });
      // The closed sections may already fit after resizing. Open the example so
      // there is content to scroll back through to reach the command.
      await example.click();
      await expect(example.locator("..")).toHaveAttribute("open", "");
      await example.hover();
      await expect(command).not.toBeInViewport({ ratio: 1 });
      const scrollBeforeWheel = await panel.evaluate(node => node.scrollTop);
      await wheelTo(page, command, -1, 1);
      await expect(close).toBeInViewport({ ratio: 1 });
      expect(await panel.evaluate(node => node.scrollTop)).toBeLessThan(scrollBeforeWheel);
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
  // An open section gives the panel room to scroll. Opening it moves the content to the
  // section, so return to the start and let ordinary wheel scrolling bring the tabs to the edge.
  await help.getByRole("tabpanel", { name: "Verify observation", exact: true }).locator(".workflow-help-reference summary").click();
  await panel.evaluate(node => { node.scrollTop = 0; });
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
  await expectFocusedControlFullyVisible(selected);
});
