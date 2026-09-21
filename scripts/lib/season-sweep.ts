// Self-healing daily sweep of the ESPN-fed cricket competitions' games.
//
// The scores scrape asks ESPN for today's scoreboard, and the games backfill is a one-shot run, so a
// match that neither saw stays absent for good (WBBL 2025: 43 finished matches, every game page a 404).
// ESPN's `scoreboard?season=<year>` lists a whole season in one request whatever the date, so this reads
// the previous and the current season of each competition and writes only the matches the database does
// not have, through the same upsertEvent as every other games writer. A stored game is never touched (its
// scores and status belong to the scrapes that own it); rounds missing from stored games are filled by
// `backfill:games`, not here. It creates no player rows: `player_game_stats` is the player-stats top-up's job.
import { pool } from "./db";
import { fetchScoreboardBySeason, type League } from "./espn";
import { upsertEvent } from "./games";

export const SWEEP_LEAGUES: League[] = ["ipl", "bbl", "cwc", "t20wc", "wpl", "wbbl", "wcwc", "wt20wc"];

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2_000;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface SweepDeps {
  fetchSeason: (league: League, season: number, options: { bypassCache: boolean }) => Promise<{ events?: any[] }>;
  upsert: (league: League, ev: any) => Promise<void>;
  sleep: (ms: number) => Promise<void>;
}
const liveDeps: SweepDeps = { fetchSeason: fetchScoreboardBySeason, upsert: upsertEvent, sleep };

export interface SeasonSweep {
  league: League;
  season: number;
  listed: number;
  missing: number;
  added: number;
  /** Set when the season could not be read completely (a failed request, or matches ESPN listed without content). */
  error?: string;
}

/**
 * One season of one competition. ESPN's edge cache can hold a half-hydrated copy (the right number of matches
 * but bare `{}` entries), which a cache-busting retry cures; whatever content the best attempt has is used.
 * A season with no edition (a World Cup year that has none) simply lists nothing.
 */
export async function sweepSeason(league: League, season: number, deps: SweepDeps = liveDeps): Promise<SeasonSweep> {
  let best: any[] = [];
  let listed = 0;
  let error: string | undefined;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const data = await deps.fetchSeason(league, season, { bypassCache: attempt > 1 });
      const all: any[] = Array.isArray(data.events) ? data.events : [];
      const populated = all.filter((ev) => ev?.id && ev.competitions?.[0]);
      if (populated.length >= best.length) {
        best = populated;
        listed = all.length;
      }
      error = undefined;
      if (populated.length === all.length) break;
      error = `${populated.length} of ${all.length} matches had content`;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
    if (attempt < MAX_ATTEMPTS) await deps.sleep(RETRY_DELAY_MS);
  }
  const ids = best.map((ev) => String(ev.id));
  const { rows } = ids.length ? await pool.query(`select espn_id from games where league = $1 and espn_id = any($2::text[])`, [league, ids]) : { rows: [] };
  const stored = new Set<string>(rows.map((r) => r.espn_id));
  const missing = best.filter((ev) => !stored.has(String(ev.id)));
  for (const ev of missing) {
    try {
      await deps.upsert(league, ev);
    } catch (err) {
      error = `match ${ev.id}: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
  // upsertEvent skips an event whose sides are not known yet, so count what actually landed.
  const missingIds = missing.map((ev) => String(ev.id));
  const { rows: now } = missingIds.length ? await pool.query(`select count(*)::int as n from games where league = $1 and espn_id = any($2::text[])`, [league, missingIds]) : { rows: [{ n: 0 }] };
  const added: number = now[0].n;
  return { league, season, listed, missing: missing.length, added, ...(error ? { error } : {}) };
}

/** The previous and the current season: a competition that spans a new year is listed under either. */
export const seasonsToSweep = (now: Date = new Date()) => [now.getUTCFullYear() - 1, now.getUTCFullYear()];

export async function sweepCricketSeasons(opts: { leagues?: League[]; seasons?: number[]; deps?: SweepDeps; delayMs?: number } = {}): Promise<SeasonSweep[]> {
  const deps = opts.deps ?? liveDeps;
  const results: SeasonSweep[] = [];
  for (const league of opts.leagues ?? SWEEP_LEAGUES) {
    for (const season of opts.seasons ?? seasonsToSweep()) {
      results.push(await sweepSeason(league, season, deps));
      await deps.sleep(opts.delayMs ?? 250);
    }
  }
  return results;
}
