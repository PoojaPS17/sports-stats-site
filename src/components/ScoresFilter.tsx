"use client";

import { useState } from "react";

export interface ScoresFilterItem {
  key: string;
  label: string;
}

// League chips for /scores. Without JavaScript each chip is a plain link to that league's block further
// down the page; with it, a chip shows only that block (every block carries data-scores-block).
export function ScoresFilter({ items }: { items: ScoresFilterItem[] }) {
  const [active, setActive] = useState("all");
  const pick = (key: string) => {
    setActive(key);
    for (const el of document.querySelectorAll<HTMLElement>("[data-scores-block]")) {
      const k = el.dataset.scoresBlock;
      el.hidden = key !== "all" && k !== key;
    }
  };
  const chips = [{ key: "all", label: "All" }, ...items];
  return (
    <nav aria-label="Filter by league" className="scores-filter">
      {chips.map((c) => (
        <a
          key={c.key}
          href={c.key === "all" ? "#scores-top" : `#scores-${c.key}`}
          className="scores-chip"
          aria-current={active === c.key ? "true" : undefined}
          data-active={active === c.key ? "true" : undefined}
          onClick={(e) => {
            e.preventDefault();
            pick(c.key);
          }}
        >
          {c.label}
        </a>
      ))}
    </nav>
  );
}
