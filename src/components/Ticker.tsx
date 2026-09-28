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
    <div className="border-b border-[var(--header-border)] bg-[var(--mast-2)] text-[var(--mast-text)]">
      <div className="container-x flex h-[52px] items-stretch gap-0 px-0 sm:px-0">
        <div className="strip-scroll flex min-w-0 flex-1 items-stretch overflow-x-auto" aria-label="Latest scores">
          {items.map((chip, i) => (
            <Link key={`${chip.href}-${i}`} href={chip.href} className="strip-chip">
              <span className="strip-chip-top">
                <span>{chip.league}</span>
                <span className={chip.live ? "strip-live" : undefined}>
                  {chip.live && (
                    <>
                      <span className="live-dot" aria-hidden />
                      <span className="sr-only">Live: </span>
                    </>
                  )}
                  {chip.status}
                </span>
              </span>
              {chip.sides.map((s) => (
                <span key={s.name} className={`strip-chip-side ${s.won ? "strip-won" : ""}`}>
                  <span className="truncate">{s.name}</span>
                  {s.score !== null && <span className="tabular-nums">{s.score}</span>}
                </span>
              ))}
            </Link>
          ))}
          {items.length === 0 && <span className="strip-chip strip-chip-empty" aria-hidden />}
        </div>
        <Link href="/top-games" className="hidden shrink-0 items-center px-4 text-xs font-bold text-[var(--sig)] sm:flex">
          All scores →
        </Link>
        {updatedAt && (
          <span className="hidden shrink-0 items-center pr-4 text-[11px] text-[var(--mast-muted)] lg:flex">
            <LastUpdated iso={updatedAt} />
          </span>
        )}
      </div>
    </div>
  );
}
