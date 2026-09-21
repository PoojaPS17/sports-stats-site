// Which ranking a tennis rankings table shows. Pure, so the pages, the share images and the tests agree.
//
// ESPN's ranking resource is one object per week (`occurrence.number`) with a `lastUpdated` that is the Thursday of
// that week (Jan 1 + 7 x (week - 1), a Thursday in 2026; checked for all 26 WTA weeks). The tour publishes the ranking
// on the Monday after it, which is what the tour's own site calls the ranking's date: lastUpdated 2026-09-10T07:00Z
// is the ranking of Mon 14 Sep 2026.

const DAY_MS = 86_400_000;
const utcNoon = (day: string) => Date.parse(`${day}T12:00:00Z`);
const dayString = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** The Monday a ranking is dated, as YYYY-MM-DD, from ESPN's `lastUpdated` (a Thursday). */
export function rankingAsOf(lastUpdated: string): string {
  return dayString(utcNoon(lastUpdated.slice(0, 10)) + 4 * DAY_MS);
}

/** "Mon 14 Sep 2026". Built by hand: the runtime's short month for September varies ("Sep" or "Sept"). */
function formatMonday(day: string, withYear = true): string {
  const d = new Date(`${day}T12:00:00Z`);
  const weekday = d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
  const month = d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  return `${weekday} ${d.getUTCDate()} ${month}${withYear ? ` ${d.getUTCFullYear()}` : ""}`;
}

/** "Ranking of Mon 14 Sep 2026", or the plain description until the loader has stored a week. */
export function rankingLabel(asOf: string | null): string {
  return asOf ? `Ranking of ${formatMonday(asOf)}` : "Official world rankings";
}

/**
 * When a newer Monday than the stored ranking's has already come round, the tour has published a ranking this site
 * does not have yet (the feed serves it later). Says so, naming the newest Monday, rather than letting an old week
 * pass as current. Null when the ranking is the latest possible, or its week is unknown.
 */
export function newerRankingNote(asOf: string | null, today: string): string | null {
  if (!asOf) return null;
  const weeks = Math.floor((utcNoon(today) - utcNoon(asOf)) / (7 * DAY_MS));
  if (weeks < 1) return null;
  const newest = dayString(utcNoon(asOf) + weeks * 7 * DAY_MS);
  return `The ${formatMonday(newest, false)} ranking is published but not in our feed yet, so this is ${weeks === 1 ? "the previous week" : "an earlier week"}.`;
}
