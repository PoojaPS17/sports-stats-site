"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

// "Live now" and "Coming up" inside the Right now section: two tabs over two server-drawn panels (WAI-ARIA tabs:
// roving tabindex, arrow keys, Home and End). Only the chosen panel is shown, and the server picks which one that is
// (Live now when anything is in play, else Coming up), so the page renders the same with JavaScript off.
export function HomeTabs({ live, coming, liveCount, initial }: { live: ReactNode; coming: ReactNode; liveCount: number; initial: "live" | "coming" }) {
  const [tab, setTab] = useState<"live" | "coming">(initial);
  const id = useId();
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const order = ["live", "coming"] as const;
  const onKey = (e: KeyboardEvent) => {
    const i = order.indexOf(tab);
    const next = e.key === "ArrowRight" || e.key === "ArrowDown" ? order[(i + 1) % 2] : e.key === "ArrowLeft" || e.key === "ArrowUp" ? order[(i + 1) % 2] : e.key === "Home" ? order[0] : e.key === "End" ? order[1] : null;
    if (!next) return;
    e.preventDefault();
    setTab(next);
    refs.current[next]?.focus();
  };
  const label = { live: liveCount > 0 ? `Live now · ${liveCount}` : "Live now", coming: "Coming up" };
  return (
    <div className="rn-tabs">
      <div className="home-tabs" role="tablist" aria-label="In play now or coming up" onKeyDown={onKey}>
        {order.map((t) => (
          <button
            key={t}
            ref={(el) => {
              refs.current[t] = el;
            }}
            type="button"
            role="tab"
            id={`${id}-${t}`}
            aria-selected={tab === t}
            aria-controls={`${id}-p-${t}`}
            tabIndex={tab === t ? 0 : -1}
            onClick={() => setTab(t)}
          >
            {t === "live" && liveCount > 0 && <span className="live-dot" aria-hidden />}
            {label[t]}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${id}-p-live`} aria-labelledby={`${id}-live`} hidden={tab !== "live"} tabIndex={0}>
        {live}
      </div>
      <div role="tabpanel" id={`${id}-p-coming`} aria-labelledby={`${id}-coming`} hidden={tab !== "coming"} tabIndex={0}>
        {coming}
      </div>
    </div>
  );
}
