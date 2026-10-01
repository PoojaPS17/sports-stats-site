"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { LastUpdated } from "./LastUpdated";
import type { TickerChip } from "@/lib/ticker";

const REFRESH_MS = 120_000;
// How fast the line moves when it moves: pixels of chip width per second.
const SPEED_PX_PER_S = 40;

function Chips({ items, hidden = false }: { items: TickerChip[]; hidden?: boolean }) {
  return (
    <>
      {items.map((chip, i) => (
        <Link key={`${chip.href}-${i}`} href={chip.href} className="strip-chip" tabIndex={hidden ? -1 : undefined}>
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
          {(chip.sides ?? []).map((s) => (
            <span key={s.name} className={`strip-chip-side ${s.won ? "strip-won" : ""}`}>
              <span className="truncate">{s.name}</span>
              {s.score !== null && <span className="tabular-nums">{s.score}</span>}
            </span>
          ))}
        </Link>
      ))}
    </>
  );
}

// Fetched in the browser (see src/lib/ticker.ts for why). The bar keeps its height
// while the first fetch is in flight, so nothing below it moves. When the chips are
// wider than the bar the line scrolls continuously, like the old marquee: a second,
// aria-hidden copy follows the first so the loop never gaps. It holds while you hover
// or focus a chip, and stays still for reduced-motion settings or when the chips fit.
export function Ticker() {
  const [data, setData] = useState<{ items: TickerChip[]; updatedAt: string | null }>({ items: [], updatedAt: null });
  const [moving, setMoving] = useState<{ duration: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const setRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    const scroll = scrollRef.current;
    const set = setRef.current;
    if (!scroll || !set || items.length === 0) {
      setMoving(null);
      return;
    }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const measure = () => {
      const width = set.scrollWidth;
      const fits = width <= scroll.clientWidth;
      setMoving(fits || reduced.matches ? null : { duration: Math.max(20, Math.round(width / SPEED_PX_PER_S)) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(scroll);
    ro.observe(set);
    reduced.addEventListener("change", measure);
    return () => {
      ro.disconnect();
      reduced.removeEventListener("change", measure);
    };
  }, [items]);

  return (
    <div className="band-deep border-b border-[var(--band-deep-line)]">
      <div className="container-x flex h-[52px] items-stretch gap-0 px-0! sm:px-0!">
        <div
          ref={scrollRef}
          className={`strip-scroll flex min-w-0 flex-1 items-stretch ${moving ? "strip-moving" : "overflow-x-auto"}`}
          style={moving ? ({ "--strip-duration": `${moving.duration}s` } as CSSProperties) : undefined}
          role="region"
          aria-label="Latest scores"
        >
          <div className="strip-track">
            <div ref={setRef} className="flex items-stretch">
              <Chips items={items} />
              {items.length === 0 && <span className="strip-chip strip-chip-empty" aria-hidden />}
            </div>
            {moving && (
              <div className="flex items-stretch" aria-hidden>
                <Chips items={items} hidden />
              </div>
            )}
          </div>
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
