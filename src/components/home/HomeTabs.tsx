"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import Link from "next/link";
import { useSlideIndicator } from "../motion/useSlideIndicator";
import { SPORT_HUB, sportsPresent, type SportCounts } from "@/lib/sportFilter";
import { SPORT_PICK_LABEL, type SportPick } from "@/lib/sportPicks";

// "Live now" and "Coming up" inside the Right now section: two tabs over two server-drawn panels (WAI-ARIA tabs:
// roving tabindex, arrow keys, Home and End). Only the chosen panel is shown, and the server picks which one that is
// (Live now when anything is in play, else Coming up), so the page renders the same with JavaScript off.
//
// Under the tabs, sport chips narrow both panels to one sport. The cards all stay in the server HTML (each one carries
// data-sport, each grid data-has) and the chosen sport only sets data-filter here, so a crawler or a visitor without
// JavaScript sees everything and the 10-second refresh cannot lose the choice. Each chip also links to that sport's own
// page, because the panels are a short pick of the week, not every match.
export function HomeTabs({ live, coming, liveCount, initial, sports }: { live: ReactNode; coming: ReactNode; liveCount: number; initial: "live" | "coming"; sports?: { live: SportCounts; coming: SportCounts } }) {
  const [tab, setTab] = useState<"live" | "coming">(initial);
  const [chosen, setChosen] = useState<SportPick | "all">("all");
  const present = sports ? sportsPresent(sports.live, sports.coming) : [];
  const active = chosen !== "all" && present.includes(chosen) ? chosen : "all";
  const counts = sports?.[tab] ?? {};
  const activeCount = active === "all" ? 0 : (counts[active] ?? 0);
  const id = useId();
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const order = ["live", "coming"] as const;
  const tabsRef = useRef<HTMLDivElement>(null);
  useSlideIndicator(tabsRef, tab);
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
    <div className="rn-tabs" data-filter={active}>
      <div ref={tabsRef} className="home-tabs slide-host" role="tablist" aria-label="In play now or coming up" onKeyDown={onKey}>
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
        <span className="slide-ind" aria-hidden="true" />
      </div>
      {present.length > 1 && (
        <div className="sport-chips" role="group" aria-label="Show one sport">
          <button type="button" aria-pressed={active === "all"} onClick={() => setChosen("all")}>
            All
          </button>
          {present.map((sp) => (
            <button key={sp} type="button" aria-pressed={active === sp} onClick={() => setChosen(sp)}>
              {SPORT_PICK_LABEL[sp]}
              {(counts[sp] ?? 0) > 0 && <b>{counts[sp]}</b>}
            </button>
          ))}
        </div>
      )}
      <div role="tabpanel" id={`${id}-p-live`} aria-labelledby={`${id}-live`} hidden={tab !== "live"} tabIndex={0}>
        {live}
      </div>
      <div role="tabpanel" id={`${id}-p-coming`} aria-labelledby={`${id}-coming`} hidden={tab !== "coming"} tabIndex={0}>
        {coming}
      </div>
      {active !== "all" && (
        <p className="sport-more">
          {activeCount === 0 && <span>{tab === "live" ? `No ${SPORT_PICK_LABEL[active]} in play right now.` : `No ${SPORT_PICK_LABEL[active]} in this week's picks.`} </span>}
          <Link href={SPORT_HUB[active]} prefetch={false}>
            All {SPORT_PICK_LABEL[active]} live and upcoming →
          </Link>
        </p>
      )}
    </div>
  );
}
