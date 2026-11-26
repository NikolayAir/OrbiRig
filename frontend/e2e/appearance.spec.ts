import { expect, test, type Locator } from "@playwright/test";

import { chooseExample } from "./example-support";

test("uses System and Medium before React loads when stored choices are invalid", async ({ page }) => {
  await page.route("**/src/main.tsx", route => route.abort());
  await page.addInitScript(() => {
    localStorage.setItem("orbirig-color-theme", "invalid");
    localStorage.setItem("orbirig-text-size", "invalid");
  });

  const root = page.locator("html");
  for (const [system, theme, background] of [
    ["light", "day", "rgb(236, 242, 247)"],
    ["dark", "night", "rgb(14, 25, 40)"],
  ] as const) {
    await page.emulateMedia({ colorScheme: system });
    await page.goto("/");
    await expect(root).toHaveAttribute("data-theme", theme);
    await expect(root).toHaveCSS("color-scheme", system);
    await expect(root).toHaveCSS("background-color", background);
    await expect(root).toHaveCSS("font-size", "16px");
    await expect(page.getByRole("combobox", { name: "Color theme" })).toHaveCount(0);
  }

  await page.unroute("**/src/main.tsx");
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Color theme" })).toHaveValue("system");
  await expect(page.getByRole("combobox", { name: "Text size" })).toHaveValue("medium");
});

test("tracks OS changes only while System is selected", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  const root = page.locator("html");
  const theme = page.getByRole("combobox", { name: "Color theme" });
  await expect(theme).toHaveValue("system");

  await page.emulateMedia({ colorScheme: "dark" });
  await expect(root).toHaveCSS("color-scheme", "dark");
  await theme.selectOption("day");
  await expect(root).toHaveCSS("color-scheme", "light");
  await page.reload();
  await expect(theme).toHaveValue("day");
  await expect(root).toHaveCSS("color-scheme", "light");

  await theme.selectOption("night");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(root).toHaveCSS("color-scheme", "dark");
  await page.route("**/src/main.tsx", route => route.abort());
  await page.reload();
  await expect(root).toHaveCSS("background-color", "rgb(14, 25, 40)");
  await expect(theme).toHaveCount(0);
  await page.unroute("**/src/main.tsx");

  await page.reload();
  await expect(theme).toHaveValue("night");
  await theme.selectOption("system");
  await expect(root).toHaveCSS("color-scheme", "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(root).toHaveCSS("color-scheme", "dark");
});

test("applies appearance choices on the current page when browser storage is blocked", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() { throw new DOMException("Storage denied", "SecurityError"); },
    });
  });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  const root = page.locator("html");
  const theme = page.getByRole("combobox", { name: "Color theme" });

  const size = page.getByRole("combobox", { name: "Text size" });
  await expect(theme).toHaveValue("system");
  await expect(size).toHaveValue("medium");
  await expect(root).toHaveCSS("color-scheme", "dark");
  await theme.selectOption("day");
  await size.selectOption("large");
  await expect(root).toHaveCSS("color-scheme", "light");
  await expect(root).toHaveCSS("font-size", "18px");

  await page.reload();
  await expect(theme).toHaveValue("system");
  await expect(size).toHaveValue("medium");
  await expect(root).toHaveCSS("color-scheme", "dark");
  await expect(root).toHaveCSS("font-size", "16px");
});

async function expectReadable(control: Locator) {
  await expect(control).toBeVisible();
  const ratio = await control.evaluate(element => {
    const { color, backgroundColor } = getComputedStyle(element);
    // These checks use each element's own opaque background.
    const luminance = (rgb: string) => {
      const channels = /^rgb\((\d+), (\d+), (\d+)\)$/.exec(rgb);
      if (!channels) throw new Error("Expected an opaque RGB colour, got " + rgb);
      const [red, green, blue] = channels.slice(1).map(component => {
        const value = Number(component) / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    };
    const light = luminance(color);
    const dark = luminance(backgroundColor);
    return (Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05);
  });
  expect(ratio).toBeGreaterThanOrEqual(4.5);
}

for (const palette of ["day", "night"]) {
  test(`keeps forms, help and evidence feedback readable in ${palette}`, async ({ page, browserName }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const theme = page.getByRole("combobox", { name: "Color theme" });
    await theme.selectOption(palette);

    await expectReadable(theme);
    await expectReadable(page.getByRole("combobox", { name: "Scenario" }));
    const editor = page.getByRole("textbox", { name: "Observation evidence JSON" });
    await expectReadable(editor);
    const fieldHelp = page.getByRole("button", { name: "About Execution ID" });
    await fieldHelp.focus();
    await expectReadable(page.getByRole("tooltip"));
    await page.keyboard.press("Escape");
    await expect(page.getByRole("tooltip")).toHaveCount(0);
    await expect(fieldHelp).toBeFocused();

    const load = page.getByRole("button", { name: "Load example", exact: true });
    await load.click();
    await expectReadable(page.getByRole("button", { name: "Standard example" }));
    const failing = page.getByRole("button", { name: "Failing example" });
    await expectReadable(failing);
    const tab = browserName === "webkit" && process.platform === "darwin" ? "Alt+Tab" : "Tab";
    await page.keyboard.press(tab);
    await expect(page.getByRole("button", { name: "Standard example" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(load).toBeFocused();
    await expect(load).toHaveAttribute("aria-expanded", "false");

    await chooseExample(page);
    const verify = page.getByRole("button", { name: "Verify observation", exact: true });
    await expectReadable(verify);
    await verify.click();
    const result = page.getByRole("region", { name: "Verified execution", exact: true });
    await expectReadable(result.locator(".result-heading .outcome-badge[data-outcome=PASS]"));
    await expectReadable(verify);

    await chooseExample(page, "Failing example");
    await verify.click();
    await expectReadable(result.locator(".result-heading .outcome-badge[data-outcome=FAIL]"));
    const observed = await editor.inputValue();
    await theme.selectOption(palette === "day" ? "night" : "day");
    await expect(result.locator(".result-heading .outcome-badge")).toHaveAttribute("data-outcome", "FAIL");
    await expect(editor).toHaveValue(observed);
    await theme.selectOption(palette);

    const browserHelp = page.getByRole("button", { name: "In the browser" });
    await browserHelp.click();
    await expectReadable(page.getByRole("dialog", { name: "How it works" }));
    await page.keyboard.press("Escape");
    await expect(browserHelp).toBeFocused();

    await page.getByRole("button", { name: "Show Inspect evidence" }).click();
    await page.getByRole("radio", { name: "Verified execution", exact: true }).check();
    const inspect = page.getByRole("button", { name: "Inspect evidence", exact: true });
    await chooseExample(page, "Failing example");
    await inspect.click();
    await expectReadable(result.locator(".result-heading .outcome-badge[data-outcome=FAIL]"));
    await expect(page.getByRole("alert")).toHaveCount(0);

    await chooseExample(page, "Altered example");
    await inspect.click();
    await expectReadable(page.getByRole("alert").filter({ hasText: "Invalid evidence" }));
    await expect(result).toHaveCount(0);
  });
}

const fontSize = (locator: Locator) => locator.evaluate(element => parseFloat(getComputedStyle(element).fontSize));

test("scales the heading, fields, examples and help with a persistent text size", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 800 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const size = page.getByRole("combobox", { name: "Text size" });
  const theme = page.getByRole("combobox", { name: "Color theme" });
  await expect(size).toHaveValue("medium");
  await theme.selectOption("night");

  const heading = page.getByRole("heading", { name: "Check recorded command results" });
  const scenario = page.getByRole("combobox", { name: "Scenario" });
  const editor = page.getByRole("textbox", { name: "Observation evidence JSON" });
  const examples = page.getByRole("button", { name: "Load example", exact: true });
  const helpTrigger = page.getByRole("button", { name: "In the browser" });
  const help = page.getByRole("dialog", { name: "How it works" });
  let previous: number[] = [];
  for (const [choice, pixels] of [["small", 15], ["medium", 16], ["large", 18]] as const) {
    await size.selectOption(choice);
    await expect(page.locator("html")).toHaveCSS("font-size", pixels + "px");
    await expect(theme).toHaveValue("night");
    await examples.click();
    const option = page.getByRole("button", { name: "Standard example" });
    const fields = await Promise.all([heading, scenario, editor, option].map(fontSize));
    await page.keyboard.press("Escape");
    await helpTrigger.click();
    const computedSizes = [...fields, await fontSize(help)];
    for (const [index, priorSize] of previous.entries()) {
      expect(computedSizes[index]).toBeGreaterThan(priorSize);
    }
    previous = computedSizes;
    await page.keyboard.press("Escape");
    await expect(helpTrigger).toBeFocused();
  }

  await page.route("**/src/main.tsx", route => route.abort());
  await page.reload();
  await expect(page.locator("html")).toHaveCSS("font-size", "18px");
  await expect(size).toHaveCount(0);
  await page.unroute("**/src/main.tsx");
  await page.reload();
  await expect(size).toHaveValue("large");
  await expect(theme).toHaveValue("night");
  await size.selectOption("small");
  await page.reload();
  await expect(size).toHaveValue("small");
  await expect(page.locator("html")).toHaveCSS("font-size", "15px");
});

test("keeps edited observations and open sequence details when appearance changes", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await chooseExample(page);
  const draft = page.getByRole("textbox", { name: "Execution ID", exact: true });
  await draft.fill("local-draft");

  const inspect = page.getByRole("button", { name: "Show Inspect evidence" });
  await inspect.click();
  const type = page.getByRole("radio", { name: "Verified execution sequence", exact: true });
  await type.check();
  await chooseExample(page, "Failing example");
  const editor = page.getByRole("textbox", { name: "Evidence JSON", exact: true });
  const evidence = await editor.inputValue();
  await page.getByRole("button", { name: "Inspect evidence", exact: true }).click();
  const result = page.getByRole("region", { name: "Verified execution sequence", exact: true });
  const outcome = result.locator(".result-heading .outcome-badge[data-outcome=FAIL]");
  await expect(outcome).toBeVisible();
  const before = await fontSize(outcome);
  const member = result.getByRole("article", { name: "Member 1", exact: true });
  const toggle = member.getByRole("button", { name: "Show details for member 1" });
  await toggle.click();

  await page.getByRole("combobox", { name: "Color theme" }).selectOption("night");
  await page.getByRole("combobox", { name: "Text size" }).selectOption("large");
  await expect(outcome).toBeVisible();
  expect(await fontSize(outcome)).toBeGreaterThan(before);
  await expect(inspect).toHaveAttribute("aria-pressed", "true");
  await expect(type).toBeChecked();
  await expect(editor).toHaveValue(evidence);
  await expect(member.getByRole("button", { name: "Hide details for member 1" })).toHaveAttribute("aria-expanded", "true");

  await page.getByRole("button", { name: "Show Verify observation" }).click();
  await expect(draft).toHaveValue("local-draft");
});

test("keeps the active help tab, disclosure and focus through a System palette change", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "From the command line" });
  await trigger.click();
  const help = page.getByRole("dialog", { name: "How it works" });
  const section = help.locator("summary", { hasText: "Understanding CLI results and exit codes" });
  await section.press("Enter");
  await expect(section.locator("..")).toHaveAttribute("open", "");

  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await expect(help).toHaveCSS("color-scheme", "dark");
  await expect(help.getByRole("tab", { name: "From the command line" })).toHaveAttribute("aria-selected", "true");
  await expect(section.locator("..")).toHaveAttribute("open", "");
  await expect(section).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
});
