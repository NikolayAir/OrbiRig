import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { AppearanceSettings } from "./AppearanceSettings";

const root = document.documentElement;

afterEach(() => {
  cleanup();
  localStorage.clear();
  delete root.dataset.theme;
  delete root.dataset.themePreference;
  delete root.dataset.textSize;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("starts from the theme selected before React rendered", () => {
  root.dataset.themePreference = "night";
  render(<AppearanceSettings />);

  expect(screen.getByRole("combobox", { name: "Color theme" })).toHaveValue("night");
  expect(root).toHaveAttribute("data-theme", "night");
});

it("removes the System listener on explicit selection and on unmount", () => {
  const system = Object.assign(new EventTarget(), { matches: false });
  vi.stubGlobal("matchMedia", () => system);
  const removeListener = vi.spyOn(system, "removeEventListener");
  const { unmount } = render(<AppearanceSettings />);
  const theme = screen.getByRole("combobox", { name: "Color theme" });

  fireEvent.change(theme, { target: { value: "night" } });
  expect(localStorage.getItem("orbirig-color-theme")).toBe("night");
  expect(removeListener).toHaveBeenCalledTimes(1);

  fireEvent.change(theme, { target: { value: "system" } });
  unmount();
  expect(removeListener).toHaveBeenCalledTimes(2);
});

it("applies a new theme even when saving fails", () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("Storage denied", "SecurityError");
  });

  render(<AppearanceSettings />);
  fireEvent.change(screen.getByRole("combobox", { name: "Color theme" }), { target: { value: "night" } });

  expect(root).toHaveAttribute("data-theme", "night");
});

it("defaults to Medium and saves a new text size without changing the theme", () => {
  root.dataset.themePreference = "night";
  root.dataset.textSize = "invalid";
  render(<AppearanceSettings />);
  const size = screen.getByRole("combobox", { name: "Text size" });

  expect(size).toHaveValue("medium");
  fireEvent.change(size, { target: { value: "small" } });

  expect(localStorage.getItem("orbirig-text-size")).toBe("small");
  expect(root).toHaveAttribute("data-text-size", "small");
  expect(root).toHaveAttribute("data-theme", "night");
});
