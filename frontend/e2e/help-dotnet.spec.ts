import { expect, test, type Locator } from "@playwright/test";

const GUIDE = "https://github.com/NikolayAir/OrbiRig/blob/main/docs/dotnet-stateful-target.md";

// Touching the viewport is not enough: the whole control and its focus outline must lie
// inside the dialog and its scrolling panel, as in the other help layout tests.
async function expectFocusedControlFullyVisible(control: Locator) {
  await expect(control).toBeInViewport({ ratio: 1 });
  const visible = await control.evaluate(node => {
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
}

for (const { width, height, textScale } of [
  { width: 1440, height: 900, textScale: 100 },
  { width: 390, height: 844, textScale: 100 },
  { width: 320, height: 480, textScale: 200 },
]) {
  test(`optional .NET guidance stays usable at ${width}x${height} with ${textScale}% text`, async ({ page, browserName }, testInfo) => {
    const apiRequests: string[] = [];
    page.on("request", request => {
      if (new URL(request.url()).pathname.startsWith("/api/")) apiRequests.push(request.url());
    });
    // Test the new-tab action without depending on GitHub availability or a merge.
    await page.context().route(GUIDE, route => route.fulfill({ contentType: "text/html", body: "<title>.NET guide</title>" }));
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await page.locator("html").evaluate((element, scale) => { element.style.fontSize = `${scale}%`; }, textScale);
    const input = page.getByLabel("Execution ID", { exact: true });
    await input.fill("keep-during-dotnet-help");
    const trigger = page.getByRole("button", { name: "From the command line", exact: true });
    await trigger.click();
    const help = page.getByRole("dialog", { name: "How it works" });
    const panel = help.getByRole("tabpanel", { name: "From the command line", exact: true });
    const summary = panel.locator("summary", { hasText: "Verify a C#/.NET program (optional)" });
    const details = summary.locator("..");
    const guide = details.getByRole("link", { name: /^Build and verify the C#\/\.NET example/ });
    await expect(details).not.toHaveAttribute("open");
    await expect(guide).toBeHidden();
    // WebKit on macOS uses Option-Tab to include links and disclosures in keyboard navigation.
    const tab = browserName === "webkit" && process.platform === "darwin" ? "Alt+Tab" : "Tab";
    // Reach the disclosure through the dialog's real keyboard order.
    for (let index = 0; index < 8 && !await summary.evaluate(node => node === document.activeElement); index++) {
      await page.keyboard.press(tab);
    }
    await expect(summary).toBeFocused();
    await expectFocusedControlFullyVisible(summary);
    await page.keyboard.press("Enter");
    await expect(details).toHaveAttribute("open", "");
    await expect(details).toContainText("results from a program written in another language");
    await expect(details).toContainText("The .NET 10 SDK is needed only to build and run this example.");
    await expect(details).toContainText("The browser does not run the target");
    await page.keyboard.press(tab);
    await expect(guide).toBeFocused();
    await expectFocusedControlFullyVisible(guide);
    await expect(guide).toHaveCSS("outline-style", "solid");
    for (const element of [help, panel, details]) {
      expect(await element.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    }
    await page.screenshot({ path: testInfo.outputPath("dotnet-guidance.png") });
    const popupPromise = page.waitForEvent("popup");
    await page.keyboard.press("Enter");
    const popup = await popupPromise;
    await expect(popup).toHaveURL(GUIDE);
    await popup.close();
    await page.keyboard.press("Escape");
    await expect(help).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(input).toHaveValue("keep-during-dotnet-help");
    expect(apiRequests).toEqual([]);
  });
}
