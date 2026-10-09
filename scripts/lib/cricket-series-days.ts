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

/** Days after a match's start the --unfiled pass also reads. ESPN's historical listing names a Test on only some of its days (1990 NZ tour of England, the Lord's Test starting 21 June: listed 24-26 June only; 1994 Kingston Test starting 19 Feb: 22 Feb only), so the next day is not enough. */
export const UNFILED_EXTRA_DAYS = 7;

/**
 * Distinct UTC calendar days of the given instants, ascending, each pinned to noon UTC like the --since/--until days.
 * `extraDays` adds that many following days too (`true` is one): ESPN's listing files a match under its local day, which
 * for a ground east of the stored instant (a New Zealand Test stored at 18:30 UTC) is the next UTC day, and an old Test is
 * often listed on only some of its days.
 */
export function distinctDays(dates: Iterable<Date | string>, extraDays: boolean | number = false): Date[] {
  const extra = typeof extraDays === "number" ? Math.max(0, Math.floor(extraDays)) : extraDays ? 1 : 0;
  const days = new Set<string>();
  for (const d of dates) {
    const t = new Date(d);
    if (Number.isNaN(t.getTime())) continue;
    for (let i = 0; i <= extra; i++) days.add(new Date(t.getTime() + i * 86_400_000).toISOString().slice(0, 10));
  }
  return [...days].sort().map((day) => new Date(`${day}T12:00:00Z`));
}
