"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";

/**
 * The split a `?split=` query asks for, or the first one when it names nothing the page has — the
 * same fallback the page applied when the split was a server-rendered query parameter.
 */
export function splitFromQuery(search: string, keys: string[]): string {
  const asked = new URLSearchParams(search).get("split");
  return asked !== null && keys.includes(asked) ? asked : keys[0];
}

// The address bar as an external store: read after hydration, never during the render on the
// server, so the HTML is the same for every visitor (which is what lets the page be cached).
function subscribe(onChange: () => void): () => void {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
}
const clientSearch = () => window.location.search;
const serverSearch = () => "";

/**
 * Career splits as tabs over one page. Every panel is server-rendered into the HTML, so a crawler
 * (and a reader) finds all of them at the player's own address; the tabs only choose which is on
 * show. Links made before the tabs carry `?split=`, so that value picks the opening tab.
 */
export function CricketSplitTabs({ tabs }: { tabs: { key: string; label: string; panel: ReactNode }[] }) {
  const keys = tabs.map((t) => t.key);
  const search = useSyncExternalStore(subscribe, clientSearch, serverSearch);
  const [picked, setPicked] = useState<string | null>(null);
  const active = picked ?? splitFromQuery(search, keys);

  return (
    <>
      <div className="mb-3 flex gap-1.5">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setPicked(t.key)}
            aria-pressed={active === t.key}
            className={`nav-pill text-sm ${active === t.key ? "nav-pill-active" : "text-[var(--text-muted)]"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.key} data-split={t.key} hidden={active !== t.key}>
          {t.panel}
        </div>
      ))}
    </>
  );
}
