import { useLayoutEffect, useState } from "react";

// index.html reads these preferences before the app renders.
const THEME_KEY = "orbirig-color-theme";
const TEXT_SIZE_KEY = "orbirig-text-size";

type Theme = "system" | "day" | "night";
type TextSize = "small" | "medium" | "large";

function initialTheme(): Theme {
  const preference = document.documentElement.dataset.themePreference;
  return preference === "day" || preference === "night" ? preference : "system";
}

function initialTextSize(): TextSize {
  const size = document.documentElement.dataset.textSize;
  return size === "small" || size === "large" ? size : "medium";
}

function savePreference(key: string, value: Theme | TextSize) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // The current page can still apply the choice.
  }
}

export function AppearanceSettings() {
  const [theme, setTheme] = useState(initialTheme);
  const [textSize, setTextSize] = useState(initialTextSize);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const system = window.matchMedia?.("(prefers-color-scheme: dark)");
    const apply = () => {
      root.dataset.theme = theme === "system" ? (system?.matches ? "night" : "day") : theme;
    };

    root.dataset.themePreference = theme;
    apply();
    if (theme === "system") {
      system?.addEventListener?.("change", apply);
      return () => system?.removeEventListener?.("change", apply);
    }
  }, [theme]);

  useLayoutEffect(() => {
    document.documentElement.dataset.textSize = textSize;
  }, [textSize]);

  function chooseTheme(next: Theme) {
    setTheme(next);
    savePreference(THEME_KEY, next);
  }

  function chooseTextSize(next: TextSize) {
    setTextSize(next);
    savePreference(TEXT_SIZE_KEY, next);
  }

  return (
    <div className="appearance-settings">
      <label className="appearance-control">
        <span className="visually-hidden">Color theme</span>
        <svg className="appearance-icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
          <circle cx="10" cy="10" r="7" />
          <path d="M10 3a7 7 0 0 0 0 14Z" fill="currentColor" stroke="none" />
        </svg>
        <select value={theme} onChange={event => chooseTheme(event.currentTarget.value as Theme)}>
          <option value="system">System</option>
          <option value="day">Day</option>
          <option value="night">Night</option>
        </select>
      </label>
      <label className="appearance-control">
        <span className="visually-hidden">Text size</span>
        <svg className="appearance-icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false"
          strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 14l3.5-8L9 14M3.4 11h4.2M17.5 9v5m0-2.5a2.5 2.5 0 1 0-5 0 2.5 2.5 0 1 0 5 0" />
        </svg>
        <select value={textSize} onChange={event => chooseTextSize(event.currentTarget.value as TextSize)}>
          <option value="small">Small</option>
          <option value="medium">Medium</option>
          <option value="large">Large</option>
        </select>
      </label>
    </div>
  );
}
