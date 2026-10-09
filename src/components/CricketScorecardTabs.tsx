"use client";

import { useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useSlideIndicator } from "./motion/useSlideIndicator";
import { inningsFromQuery } from "@/lib/cricketScorecardView";

// The address bar as an external store (see CricketSplitTabs): read after hydration, never on the server.
function subscribe(onChange: () => void): () => void {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
}
const clientSearch = () => window.location.search;
const serverSearch = () => "";

export interface ScorecardTab {
  key: string;
  label: string;
  colour: string | null;
  panel: ReactNode;
}

/**
 * The scorecard's innings as tabs. Every panel is server-rendered into the HTML (crawlers and the share card
 * see all of them); the pills only choose which is on show, and `?innings=<period>` picks the opening one.
 */
export function CricketScorecardTabs({ tabs }: { tabs: ScorecardTab[] }) {
  const keys = tabs.map((t) => t.key);
  const search = useSyncExternalStore(subscribe, clientSearch, serverSearch);
  const [picked, setPicked] = useState<string | null>(null);
  const active = picked ?? inningsFromQuery(search, keys);
  const rowRef = useRef<HTMLDivElement>(null);
  useSlideIndicator(rowRef, active);
  if (tabs.length === 0) return null;
  return (
    <>
      <div ref={rowRef} role="tablist" aria-label="Innings" className="slide-host mb-3 flex gap-1.5 overflow-x-auto pb-1">
        {tabs.map((t) => (
          <button key={t.key} type="button" onClick={() => setPicked(t.key)} aria-pressed={active === t.key} className={`nav-pill shrink-0 text-sm ${active === t.key ? "nav-pill-active" : "text-[var(--text-muted)]"}`}>
            <span aria-hidden className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-[var(--border-strong)] align-middle" style={t.colour ? { backgroundColor: t.colour } : undefined} />
            {t.label}
          </button>
        ))}
        <span className="slide-ind" aria-hidden="true" />
      </div>
      {tabs.map((t) => (
        <div key={t.key} data-innings={t.key} hidden={active !== t.key}>
          {t.panel}
        </div>
      ))}
    </>
  );
}
