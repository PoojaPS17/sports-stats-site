import type { League } from "./espn";

// The scheduled live tick narrows the fetch scripts to the leagues the live check
// found something to update in (SCRAPE_LEAGUES, comma-separated) and marks itself
// with SCRAPE_MODE=live, where the scripts fetch only what a finished game changed.
// The daily full run, backfills and local runs leave both unset and cover everything.
export function scopedLeagues(all: League[]): League[] {
  const raw = process.env.SCRAPE_LEAGUES?.trim();
  if (!raw) return all;
  const wanted = new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));
  return all.filter((league) => wanted.has(league));
}

export function isLiveTick(): boolean {
  return process.env.SCRAPE_MODE === "live";
}
