import { expect, test } from "@playwright/test";

import { expectFocusedControlFullyVisible, sectionPosition } from "./help-support";

const GUIDE = "https://github.com/NikolayAir/OrbiRig/blob/main/docs/dotnet-stateful-target.md";

for (const { width, height, textScale, clearance } of [
  { width: 1440, height: 900, textScale: 100, clearance: "panel" },
  { width: 390, height: 1150, textScale: 100, clearance: "end" },
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
    await expectFocusedControlFullyVisible(summary);
    await page.keyboard.press("Enter");
    await expect(details).toHaveAttribute("open", "");
    await expect(details).toContainText("Example outcomes from a local run");
    await expect(details).toContainText("Use the .NET 10 SDK to build and run the optional target locally.");
    await expect(details).toContainText("The example saves the stale-telemetry result as JSON for inspection in the browser.");
    if (clearance) {
      await expect(guide).toBeInViewport({ ratio: 1 });
      const opened = await sectionPosition(details);
      expect(opened.below).toBeGreaterThanOrEqual(clearance === "end" ? 19.5 : 23.5);
      expect(opened.below).toBeLessThanOrEqual(clearance === "end" ? 20.5 : 25.5);
      if (clearance === "end") expect(opened.scrollTop).toBeCloseTo(opened.maxScrollTop, 0);
    }
    await page.keyboard.press(tab);
    await expectFocusedControlFullyVisible(guide);
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
