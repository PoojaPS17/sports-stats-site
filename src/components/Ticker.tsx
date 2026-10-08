"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LastUpdated } from "./LastUpdated";
import type { TickerChip } from "@/lib/ticker";

const REFRESH_MS = 120_000;

// Fetched in the browser (see src/lib/ticker.ts for why). The bar keeps its height
// while the first fetch is in flight, so nothing below it moves.
export function Ticker() {
  const [data, setData] = useState<{ items: TickerChip[]; updatedAt: string | null }>({ items: [], updatedAt: null });

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetch("/api/ticker")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d && !cancelled) setData(d);
        })
        .catch(() => {});
    };
    load();
    // Background tabs don't keep polling.
    const id = window.setInterval(() => document.visibilityState === "visible" && load(), REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const { items, updatedAt } = data;

  return (
    <div className="home-strip">
      <div className="container-x flex h-10 items-stretch gap-0 px-0">
        <div className="strip-scroll flex min-w-0 flex-1 items-stretch overflow-x-auto" role="region" aria-label="Latest scores">
          {items.map((chip, i) => (
            <Link key={`${chip.href}-${i}`} href={chip.href} className="strip-chip">
              <span className="strip-lg">{chip.league}</span>
              {chip.live && (
                <>
                  <span className="live-dot" aria-hidden />
                  <span className="sr-only">Live: </span>
                </>
              )}
              {(chip.sides ?? []).map((s, k) => (
                <span key={s.name} className={`strip-side ${s.won ? "strip-won" : ""}`}>
                  {k > 0 && <span className="strip-v"> v </span>}
                  {s.name}
                  {s.score !== null && <span className="tabular-nums"> {s.score}</span>}
                </span>
              ))}
              <span className={chip.live ? "strip-live" : "strip-st"}>{chip.status}</span>
            </Link>
          ))}
          {items.length === 0 && <span className="strip-chip strip-chip-empty" aria-hidden />}
        </div>
        <Link href="/scores" className="strip-all hidden shrink-0 items-center px-4 text-xs font-bold sm:flex">
          All scores →
        </Link>
        {updatedAt && (
          <span className="hidden shrink-0 items-center pr-4 text-[11px] text-[var(--text-muted)] lg:flex">
            <LastUpdated iso={updatedAt} />
          </span>
        )}
      </div>
    </div>
  );
}
