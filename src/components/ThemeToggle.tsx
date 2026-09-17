"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("theme", theme);
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    // Reads the theme a pre-hydration inline script already applied to <html>, falling
    // back to the OS preference when the visitor has never chosen one — otherwise the
    // first click on a system-dark machine would "switch to dark" and change nothing.
    const explicit = document.documentElement.dataset.theme as Theme | undefined;
    const system: Theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(explicit ?? system);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
  }

  const label = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--header-text)] transition hover:bg-[var(--header-hover-bg)]"
    >
      {theme === "dark" ? (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 1020.354 15.354z" />
        </svg>
      )}
    </button>
  );
}
