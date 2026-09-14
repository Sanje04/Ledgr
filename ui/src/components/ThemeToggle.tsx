import { useState } from "react";
import { getEffectiveTheme, setStoredTheme, type Theme } from "../utils/theme";
import "../styles/ThemeToggle.css";

function ThemeToggle(): JSX.Element {
  const [theme, setTheme] = useState<Theme>(() => getEffectiveTheme());

  function toggle(): void {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    setStoredTheme(next);
  }

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      aria-pressed={theme === "dark"}
    >
      <span className="theme-toggle__icon-wrap">
        <svg
          className={`theme-toggle__icon ${theme === "dark" ? "theme-toggle__icon--visible" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
        </svg>
        <svg
          className={`theme-toggle__icon ${theme === "light" ? "theme-toggle__icon--visible" : ""}`}
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      </span>
    </button>
  );
}

export default ThemeToggle;
