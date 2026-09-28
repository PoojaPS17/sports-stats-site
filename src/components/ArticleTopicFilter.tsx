"use client";

import { useEffect, useState } from "react";
import type { ArtPalette } from "@/lib/beyondTheScoreline";
import type { Topic } from "@/lib/articleTopics";

// The topic pills on the index band. Filtering hides cards in place (every card is in the
// server HTML, so search engines and the pages test see all of them); the chosen topic is
// pushed onto <html data-topic> and the cards' CSS does the hiding.
export function ArticleTopicFilter({ topics }: { topics: Topic[] }) {
  const [active, setActive] = useState<ArtPalette | "all">("all");
  // The attribute lives on <html>, outside React, so it must start clean on every visit and
  // be cleared when the page is left; otherwise a filter chosen earlier hides cards after
  // client-side navigation back to the index.
  useEffect(() => {
    delete document.documentElement.dataset.topic;
    return () => {
      delete document.documentElement.dataset.topic;
    };
  }, []);
  function choose(key: ArtPalette | "all") {
    setActive(key);
    document.documentElement.dataset.topic = key;
  }
  const pill = (on: boolean) =>
    `rounded-full border px-3 py-1.5 text-xs font-bold transition ${on ? "border-[var(--sig)] bg-[var(--sig)] text-[var(--sig-on)]" : "border-[var(--mast-line)] text-[var(--mast-text)] hover:border-[var(--sig)] hover:text-[var(--sig)]"}`;
  return (
    <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="Filter by sport">
      <button type="button" className={pill(active === "all")} aria-pressed={active === "all"} onClick={() => choose("all")}>
        All
      </button>
      {topics.map((t) => (
        <button key={t.key} type="button" className={pill(active === t.key)} aria-pressed={active === t.key} onClick={() => choose(t.key)}>
          {t.label} <span className="opacity-70">{t.count}</span>
        </button>
      ))}
    </div>
  );
}
