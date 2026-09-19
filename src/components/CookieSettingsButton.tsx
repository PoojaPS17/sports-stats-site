"use client";

import { COOKIE_SETTINGS_EVENT } from "@/lib/consent";

// Reopens the analytics cookie choice, so a visitor can change their mind at any time.
export function CookieSettingsButton() {
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event(COOKIE_SETTINGS_EVENT))} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-semibold hover:bg-[var(--surface-muted)]">
      Change my analytics cookie choice
    </button>
  );
}
