// Fills games.local_date / end_date for the international cricket rows that were imported before those
// columns existed (test, odi, t20i, wodi, wt20i). Their rows come from import-cricket-espn.ts, which
// skips a match it already holds, and `backfill:games` only reads the eight scoreboard competitions, so
// neither will revisit them. The local day(s) are in the match's summary (header.description and the
// "matchdays" note), one request per game; nothing else on the row is touched.
//
// Rows Cricsheet wrote (ODI, T20I) already hold their local date as noon UTC; those are left for the
// owner's one-line UPDATE and are skipped here. A row whose feed text has no date gets the UTC day of
// its start, which marks it done so the next run does not fetch it again.
import { pool } from "./db";
import { storeCricketDates } from "./games";

export const DATE_BACKFILL_LEAGUES = ["test", "wodi", "wt20i", "odi", "t20i"] as const;

const FALLBACK_SERIES = "8048"; // any competition id resolves any cricket event; IPL's serves every international
const RETRIES = 4;
const REQUEST_TIMEOUT_MS = 20_000;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface DateBackfillDeps {
  fetchSummary: (espnId: string) => Promise<any>;
  sleep: (ms: number) => Promise<void>;
}

/** A summary is usable only with a header: ESPN's 502 body is valid JSON and would otherwise pass for one. */
async function fetchSummary(espnId: string): Promise<any> {
  const url = `https://site.api.espn.com/apis/site/v2/sports/cricket/${FALLBACK_SERIES}/summary?event=${espnId}`;
  let last: unknown;
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    try {
      const res = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      const json = JSON.parse(await res.text());
      if (json?.header?.competitions?.[0]) return json;
      last = new Error(`ESPN ${res.status} without a header: ${url}`);
    } catch (err) {
      last = err;
    }
    await sleep(1000 * (attempt + 1));
  }
  throw last;
}
const liveDeps: DateBackfillDeps = { fetchSummary, sleep };

export interface DateBackfillResult {
  candidates: number;
  /** Rows given a date read from the feed's text. */
  dated: number;
  /** Rows whose feed text had none: given the UTC day of their start. */
  fallback: number;
  failed: number;
}

export async function backfillCricketDates(
  leagues: readonly string[] = DATE_BACKFILL_LEAGUES,
  options: { limit?: number; delayMs?: number } = {},
  deps: DateBackfillDeps = liveDeps,
): Promise<DateBackfillResult> {
  const { rows } = await pool.query(
    `select league, espn_id, date from games
     where league = any($1::text[]) and local_date is null
       and not (league in ('odi', 't20i') and (date at time zone 'UTC')::time = '12:00:00')
     order by date desc
     limit $2`,
    [leagues, options.limit ?? 1_000_000]
  );
  const out: DateBackfillResult = { candidates: rows.length, dated: 0, fallback: 0, failed: 0 };
  for (const [i, row] of rows.entries()) {
    try {
      const summary = await deps.fetchSummary(row.espn_id);
      const source = await storeCricketDates(row.league, row.espn_id, summary.header.description, summary.notes, new Date(row.date).toISOString());
      // The UTC fallback is what the row would have had anyway; count it apart so the owner sees how many had real dates.
      if (source === "description" || source === "notes") out.dated++;
      else out.fallback++;
    } catch (err) {
      out.failed++;
      console.error(`[backfill-cricket-dates] ${row.league} ${row.espn_id} failed: ${err instanceof Error ? err.message : err}`);
    }
    if ((i + 1) % 200 === 0) console.log(`[backfill-cricket-dates] ${i + 1}/${rows.length}`);
    await deps.sleep(options.delayMs ?? 150);
  }
  return out;
}

/**
 * The command line of scripts/backfill-cricket-dates.ts: `[league ...] [--limit N]`. Pure, so it can be
 * tested. `ok` is false for an unknown league, a missing or non-positive limit, or any other flag.
 * With no league given, every league in DATE_BACKFILL_LEAGUES.
 */
export function parseDateBackfillArgs(args: string[]): { ok: boolean; leagues: string[]; limit: number | undefined } {
  const limitAt = args.indexOf("--limit");
  // The value after --limit is not a league; with no --limit nothing is skipped (index -1 would skip arg 0).
  const skip = limitAt >= 0 ? limitAt + 1 : -1;
  const limit = limitAt >= 0 ? Number(args[limitAt + 1]) : undefined;
  const flags = args.filter((a, i) => a.startsWith("--") && i !== limitAt);
  const named = args.filter((a, i) => !a.startsWith("--") && i !== skip);
  const known = new Set<string>(DATE_BACKFILL_LEAGUES);
  const valid = flags.length === 0 && named.every((l) => known.has(l)) && (limit === undefined || (Number.isInteger(limit) && limit > 0));
  return { ok: valid, leagues: named.length > 0 ? named : [...DATE_BACKFILL_LEAGUES], limit };
}
