// The days fetch-cricket-series.ts reads in `--league-days <league>` mode: one listing request per distinct start
// date of the matches already stored for a league (the pre-2000 Tests, ~1,480 days, instead of a century of empty ones).
// Pure, so a test can pin the day list without a database.

/** The league named after `--league-days`, or null when the flag is absent; `{error}` when it has no value. */
export function parseLeagueDays(argv: string[]): string | null | { error: string } {
  const i = argv.indexOf("--league-days");
  if (i < 0) return null;
  const v = argv[i + 1];
  return v && !v.startsWith("--") ? v : { error: "--league-days needs a league (e.g. test)" };
}

/**
 * Distinct UTC calendar days of the given instants, ascending, each pinned to noon UTC like the --since/--until days.
 * `alsoNextDay` adds the following day too: ESPN's listing files a match under its local day, which for a ground east
 * of the stored instant (a New Zealand Test stored at 18:30 UTC) is the next UTC day.
 */
export function distinctDays(dates: Iterable<Date | string>, alsoNextDay = false): Date[] {
  const days = new Set<string>();
  for (const d of dates) {
    const t = new Date(d);
    if (Number.isNaN(t.getTime())) continue;
    days.add(t.toISOString().slice(0, 10));
    if (alsoNextDay) days.add(new Date(t.getTime() + 86_400_000).toISOString().slice(0, 10));
  }
  return [...days].sort().map((day) => new Date(`${day}T12:00:00Z`));
}
