"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LastUpdated } from "./LastUpdated";
import type { TickerItem } from "@/lib/ticker";

const REFRESH_MS = 120_000;

// Fetched in the browser (see src/lib/ticker.ts for why). The bar keeps its height
// while the first fetch is in flight, so nothing below it moves.
export function Ticker() {
  const [data, setData] = useState<{ items: TickerItem[]; updatedAt: string | null }>({ items: [], updatedAt: null });

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
  const doubled = [...items, ...items];

  return (
    <div className="border-b border-[var(--border)] bg-[var(--surface)] text-[var(--text)]">
      <div className="container-x flex h-8 items-center gap-3">
        <span className="hidden shrink-0 text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] sm:inline">
          Latest
        </span>
        <div className="min-w-0 flex-1 overflow-hidden" aria-label="Latest results">
          {items.length > 0 && (
            <div className="flex w-max animate-marquee gap-8 whitespace-nowrap text-xs font-medium">
              {doubled.map((item, i) => (
                <Link
                  key={i}
                  href={item.href}
                  aria-hidden={i >= items.length}
                  tabIndex={i >= items.length ? -1 : undefined}
                  className="flex items-center gap-2 text-[var(--text-muted)] hover:text-[var(--accent)]"
                >
                  <span className="h-1 w-1 rounded-full bg-[var(--accent)]" />
                  {item.label}
                </Link>
              ))}
            </div>
          )}
        </div>
        {updatedAt && <LastUpdated iso={updatedAt} />}
      </div>
    </div>
  );
}
