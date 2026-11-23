import { useLayoutEffect, useState } from "react";

// index.html reads this preference before the app renders.
const THEME_KEY = "orbirig-color-theme";

type Theme = "system" | "day" | "night";

function initialTheme(): Theme {
  const preference = document.documentElement.dataset.themePreference;
  return preference === "day" || preference === "night" ? preference : "system";
}

export function AppearanceSettings() {
  const [theme, setTheme] = useState(initialTheme);

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

  function chooseTheme(next: Theme) {
    setTheme(next);
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      // The current page can still apply the choice.
    }
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
    </div>
  );
}
