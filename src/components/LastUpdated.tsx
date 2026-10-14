"use client";

import { useEffect, useState } from "react";

// The scrapers land every 15 minutes, so two missed ticks is the point where "Updated" stops being a
// promise the site is keeping and the dot must stop reading as healthy.
export const STALE_AFTER_MINUTES = 30;

export function isStale(iso: string, nowMs: number = Date.now()): boolean {
  return (nowMs - new Date(iso).getTime()) / 60000 > STALE_AFTER_MINUTES;
}

export function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

// Like LocalTime: formatRelative depends on the moment it's called, so the server's
// render time and the client's hydration time legitimately disagree whenever real
// time passes between the two — suppressHydrationWarning on just this text node
// covers that expected mismatch, same as there.
export function LastUpdated({ iso }: { iso: string }) {
  const [label, setLabel] = useState<string | null>(null);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    const update = () => {
      setLabel(formatRelative(iso));
      setStale(isStale(iso));
    };
    update();
    const id = setInterval(update, 30_000);
    return () => clearInterval(id);
  }, [iso]);

  return (
    <span
      className="flex shrink-0 items-center gap-1.5 whitespace-nowrap border-l border-[var(--mast-line)] pl-3 text-[11px] text-[var(--mast-muted)]"
      title={`Stored results last refreshed ${iso}. Scores of games in play update every 10 seconds.`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${stale ? "bg-[var(--draw-fill)]" : "bg-[var(--win)]"}`} />
      <span className="hidden sm:inline">Updated </span>
      <span suppressHydrationWarning>{label ?? formatRelative(iso)}</span>
    </span>
  );
}
