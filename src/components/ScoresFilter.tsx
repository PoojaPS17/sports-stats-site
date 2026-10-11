"use client";

import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useSlideIndicator } from "./motion/useSlideIndicator";
import { SPORT_HUB, type SportCounts } from "@/lib/sportFilter";
import { SPORT_PICK_LABEL, type SportPick } from "@/lib/sportPicks";

// Sport chips for /scores, wrapped around the whole page. Every block carries data-has (the sports it holds) and every
// card data-sport; the chosen sport only sets data-filter on the wrapper and the stylesheet hides what does not belong
// (see "Sport filter" in globals.css). Nothing is hidden by script, so a block can never be left hidden by a refresh, and
// the live matches stay on the page whichever sport is chosen. Without JavaScript a chip is a plain link to that sport's page.
export function ScoresFilter({ intro, sports, live, children }: { intro: ReactNode; sports: SportPick[]; live: SportCounts; children?: ReactNode }) {
  const [active, setActive] = useState<SportPick | "all">("all");
  const navRef = useRef<HTMLElement>(null);
  useSlideIndicator(navRef, active);
  const shown = active !== "all" && sports.includes(active) ? active : "all";
  const inPlay = shown === "all" ? 0 : (live[shown] ?? 0);
  return (
    <div id="scores-top" className="scores-page flex flex-col gap-10" data-filter={shown}>
      <header>
        {intro}
        <nav ref={navRef} aria-label="Filter by sport" className="scores-filter slide-host">
          {[{ key: "all" as const, label: "All" }, ...sports.map((s) => ({ key: s, label: SPORT_PICK_LABEL[s] }))].map((c) => (
            <a
              key={c.key}
              href={c.key === "all" ? "#scores-top" : SPORT_HUB[c.key]}
              className="scores-chip"
              aria-current={shown === c.key ? "true" : undefined}
              data-active={shown === c.key ? "true" : undefined}
              onClick={(e) => {
                e.preventDefault();
                setActive(c.key);
              }}
            >
              {c.label}
              {c.key !== "all" && (live[c.key] ?? 0) > 0 && <b className="scores-chip-n">{live[c.key]}</b>}
            </a>
          ))}
          <span className="slide-ind" aria-hidden="true" />
        </nav>
        {shown !== "all" && (
          <p className="sport-more">
            {inPlay === 0 && <span>No {SPORT_PICK_LABEL[shown]} in play right now. </span>}
            {SPORT_HUB[shown] !== "/scores" && (
              <Link href={SPORT_HUB[shown]} prefetch={false}>
                All {SPORT_PICK_LABEL[shown]} fixtures, results and tables →
              </Link>
            )}
          </p>
        )}
      </header>
      {children}
    </div>
  );
}
