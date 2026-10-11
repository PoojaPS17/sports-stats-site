// The days fetch-cricket-series.ts reads in `--league-days <league>` mode: one listing request per distinct start
// date of the matches already stored for a league (the pre-2000 Tests, ~1,480 days, instead of a century of empty ones).
// and how fast it reads them. Pure, so a test can pin the day list and the pacing without a database or a network.

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

/**
 * Milliseconds to wait between one listing request and the next: `--delay <ms>`, or `fallback` when the flag is
 * absent. `{error}` when the value is not a number of milliseconds.
 *
 * ESPN's header feed throttles under a sustained sweep. Sweeping 2019 on 2026-10-11 failed 22% of its 365 days at
 * the nightly pace; a second pass started straight afterwards failed 55% of them, returning 2,428 match rows where
 * the first had returned 5,306. The days that failed were not the same days, so this is the feed shedding load, not
 * dates it has nothing for. A year is one request per calendar day, so the pace IS the load: history is swept with
 * a larger delay, while the nightly top-up, which reads a dozen days, keeps the default.
 */
export function parseRequestDelay(argv: string[], fallback: number): number | { error: string } {
  const i = argv.indexOf("--delay");
  if (i < 0) return fallback;
  const ms = Number(argv[i + 1]);
  return Number.isFinite(ms) && ms >= 0 ? ms : { error: "--delay needs a number of milliseconds (e.g. 500)" };
}

/** The first retry's wait after a failed listing request; each further attempt doubles it. */
export const RETRY_BACKOFF_MS = 1200;
/** No single retry waits longer than this, however many attempts a run allows. */
export const RETRY_BACKOFF_CAP_MS = 15_000;

/**
 * What each retry of a failed listing request waits, in order — doubling, where this was flat multiples of the base
 * (1.2s, 2.4s, 3.6s) until 2026-10-12. A request that has already failed twice is asking a feed that wants to be
 * left alone, so the third wait is 4.8s rather than 3.6s. The wait after the LAST attempt is never taken (the run
 * gives up on that day instead), so a day that fails every attempt costs 8.4s against the old 7.2s and the nightly
 * top-up is unaffected in any way that shows. The delay between days is the lever that matters, not this one.
 */
export function retryBackoffs(retries: number, baseMs = RETRY_BACKOFF_MS, capMs = RETRY_BACKOFF_CAP_MS): number[] {
  return Array.from({ length: Math.max(0, retries) }, (_, attempt) => Math.min(baseMs * 2 ** attempt, capMs));
}
