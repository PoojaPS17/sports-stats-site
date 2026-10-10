// The top-up of per-player figures for matches in series SportsDB does not archive under a
// competition (domestic, women's domestic, associate, youth): finished matches with no rows in
// cricket_series_player_stats get their scorecard read from ESPN and stored, so the series page can
// sum them into its stats block (src/lib/cricketSeriesStats.ts). The archived competitions (IPL,
// World Cups, ...) keep their figures in player_game_stats (lib/cricket-topup.ts) and are skipped.
//
// A run is capped (newest first) so a bad ESPN day cannot run long: the tick runs it with a small
// cap, the daily job with a larger one. A result ESPN has no card for yet is marked checked and
// read again an hour later, until three days after the match; then it is left alone (ESPN
// publishes some domestic results with totals and no card). Matches older than the window are
// left to a manual backfill (`--since-days`). Failures are collected and reported, not thrown.
import type { PoolClient } from "pg";
import { pool } from "./db";
import { fetchCricketSummary } from "./espn";
import { CARD_VERSION, extractCricketMatchStats, type CricketPlayerMatchStats } from "./cricket-career";
import { isScorecardOverdue, overdueWarning } from "./cricket-player-rows";
import { cricketSummaryPaths, type CricketSummaryOptions } from "../../src/lib/cricketSummary";
import { baseSeriesId } from "../../src/lib/cricketSeriesKey";
import { CALLED_OFF } from "../../src/lib/gameStatus";

export const DEFAULT_SERIES_STATS_CAP = 15;
/** How far back a run looks for matches without figures. */
export const DEFAULT_SINCE_DAYS = 45;
/** A finished match with no card is read again this long after the last read. */
const RECHECK_HOURS = 1;
/** ...until this long after it was played. */
const SETTLED_AFTER_DAYS = 3;

export interface SeriesStatsCandidate {
  espn_id: string;
  series_espn_id: string;
  date: Date | string;
  stats_checked_at: Date | null;
}

type Queryable = Pick<PoolClient, "query">;

/**
 * Finished matches without figures, in a series with no SportsDB competition: never read first, then newest
 * first. A match read with no card is a candidate again an hour later, until three days after it was played.
 *
 * Scope is either recency (`sinceDays`, what the nightly job uses) or one competition (`series`, an ESPN
 * league id as `baseSeriesId` returns it, which a backfill uses). A series scope REPLACES the window rather
 * than narrowing it: reaching matches older than 45 days is the whole point of a backfill, and the cap still
 * bounds the run. `split_part` matches `baseSeriesId` exactly — "8836-2026-27" and a bare "24276" both reduce
 * to their league id.
 */
export async function findSeriesStatsCandidates(cap: number, sinceDays = DEFAULT_SINCE_DAYS, series?: string): Promise<{ total: number; matches: SeriesStatsCandidate[] }> {
  // CALLED_OFF is a constant pattern, not user input; $1 is the series id or the day count.
  const scope = series ? `split_part(m.series_espn_id, '-', 1) = $1` : `m.date >= now() - ($1 || ' days')::interval`;
  const where = `m.status_state = 'post'
       and coalesce(m.status_summary, '') !~* '${CALLED_OFF.source}'
       and ${scope}
       and not exists (select 1 from games g where g.espn_id = m.espn_id and g.league = any(m.league_candidates))
       and not exists (select 1 from cricket_series_player_stats s where s.match_espn_id = m.espn_id)
       and (m.stats_checked_at is null
            or (m.stats_checked_at < m.date + interval '${SETTLED_AFTER_DAYS} days' and m.stats_checked_at < now() - interval '${RECHECK_HOURS} hours'))`;
  const arg: string | number = series ?? sinceDays;
  const [{ rows: matches }, { rows: count }] = await Promise.all([
    pool.query(`select m.espn_id, m.series_espn_id, m.date, m.stats_checked_at from cricket_series_matches m where ${where} order by m.stats_checked_at nulls first, m.date desc limit $2`, [arg, cap]),
    pool.query(`select count(*)::int as n from cricket_series_matches m where ${where}`, [arg]),
  ]);
  return { total: count[0].n, matches };
}

/** Reads a candidate's summary; a thrown error is that match's failure. */
export type SeriesSummaryFetcher = (match: SeriesStatsCandidate) => Promise<any>;

/** The series' own path first (ESPN serves a summary under its league id), then the IPL path that serves any cricket event. */
export function defaultSeriesSummaryFetcher(options?: CricketSummaryOptions): SeriesSummaryFetcher {
  return (match) =>
    fetchCricketSummary(match.espn_id, cricketSummaryPaths(`cricket/${baseSeriesId(match.series_espn_id)}`), {
      ...options,
      // A header alone (a half-rendered copy) is worth another path; one with no scorecard anywhere is returned as it is.
      accept: (summary) => extractCricketMatchStats(summary).players.length > 0,
    });
}

/** Writes one match's rows and marks the match read. Returns the rows written. */
export async function writeSeriesPlayerRows(db: Queryable, match: SeriesStatsCandidate, players: CricketPlayerMatchStats[]): Promise<number> {
  for (const p of players) {
    await db.query(
      `insert into cricket_series_player_stats (match_espn_id, series_espn_id, player_espn_id, player_name, team_espn_id, stats, updated_at)
       values ($1, $2, $3, $4, $5, $6, now())
       on conflict (match_espn_id, player_espn_id) do update set
         series_espn_id = excluded.series_espn_id, player_name = excluded.player_name, team_espn_id = excluded.team_espn_id, stats = excluded.stats, updated_at = now()
       where (cricket_series_player_stats.series_espn_id, cricket_series_player_stats.player_name, cricket_series_player_stats.team_espn_id, cricket_series_player_stats.stats)
         is distinct from (excluded.series_espn_id, excluded.player_name, excluded.team_espn_id, excluded.stats)`,
      [match.espn_id, match.series_espn_id, p.athleteId, p.name, p.teamId, JSON.stringify({ batting: p.batting, bowling: p.bowling, catches: p.catches, innings: p.innings, v: CARD_VERSION })]
    );
  }
  await db.query(`update cricket_series_matches set stats_checked_at = now() where espn_id = $1`, [match.espn_id]);
  return players.length;
}

export interface SeriesStatsResult {
  /** Candidates when the run started. */
  eligible: number;
  /** Candidates this run attempted (at most the cap). */
  attempted: number;
  /** Matches whose figures were stored. */
  written: number;
  playerRows: number;
  /** Matches ESPN answered for but has no scorecard for (yet). */
  noScorecard: number;
  /** The no-scorecard matches more than three days past their date: ESPN is not going to publish one soon. */
  overdue: string[];
  failed: { id: string; error: string }[];
  /**
   * The same outcomes split by the decade a match was played in, newest first. A backfill reads it to find
   * where ESPN's scorecards stop: card counts hold up through the 2000s and fall away before that, and there
   * is no point fetching a competition's 1930s editions to learn it one match at a time.
   */
  byDecade: { decade: string; attempted: number; withCard: number; noCard: number; failed: number }[];
}

/** "2010s" for any date in 2010-2019; the bucket a match's outcome is counted under. */
function decadeOf(date: Date | string): string {
  const year = new Date(date).getUTCFullYear();
  return `${Math.floor(year / 10) * 10}s`;
}

export async function topUpCricketSeriesStats(
  options: { cap?: number; sinceDays?: number; series?: string; dryRun?: boolean; fetchSummary?: SeriesSummaryFetcher; delayMs?: number } = {}
): Promise<SeriesStatsResult> {
  const cap = options.cap ?? DEFAULT_SERIES_STATS_CAP;
  const fetchSummary = options.fetchSummary ?? defaultSeriesSummaryFetcher();
  const { total, matches } = await findSeriesStatsCandidates(cap, options.sinceDays, options.series);
  const result: SeriesStatsResult = { eligible: total, attempted: matches.length, written: 0, playerRows: 0, noScorecard: 0, overdue: [], failed: [], byDecade: [] };
  const decades = new Map<string, { decade: string; attempted: number; withCard: number; noCard: number; failed: number }>();
  const bucket = (date: Date | string) => {
    const decade = decadeOf(date);
    const b = decades.get(decade) ?? { decade, attempted: 0, withCard: 0, noCard: 0, failed: 0 };
    decades.set(decade, b);
    return b;
  };

  for (const match of matches) {
    const tally = bucket(match.date);
    tally.attempted++;
    try {
      const summary = await fetchSummary(match);
      const { players } = extractCricketMatchStats(summary);
      // A dry run writes NOTHING, stats_checked_at included: a historical match is long past the three-day
      // settle window, so marking it checked would drop it out of the candidate set for good and the real
      // run that follows would skip every match the dry run measured.
      if (options.dryRun) result.playerRows += players.length;
      else {
        // One transaction per match, so a failure part-way never leaves a match with some of its rows.
        const client = await pool.connect();
        try {
          await client.query("begin");
          result.playerRows += await writeSeriesPlayerRows(client, match, players);
          await client.query("commit");
        } catch (err) {
          await client.query("rollback").catch(() => {});
          throw err;
        } finally {
          client.release();
        }
      }
      if (players.length > 0) {
        result.written++;
        tally.withCard++;
      } else {
        result.noScorecard++;
        tally.noCard++;
        if (isScorecardOverdue(match.date)) result.overdue.push(match.espn_id);
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      result.failed.push({ id: match.espn_id, error });
      tally.failed++;
      console.error(`[topup-cricket-series-stats] ${match.series_espn_id} ${match.espn_id} failed: ${error}`);
    }
    if (options.delayMs) await new Promise((r) => setTimeout(r, options.delayMs));
  }
  result.byDecade = [...decades.values()].sort((a, b) => b.decade.localeCompare(a.decade));
  return result;
}

/** The job's exit status: 1 when any match could not be read or stored, so the scrape run records the failure. */
export const topUpExitCode = (r: SeriesStatsResult): number => (r.failed.length > 0 ? 1 : 0);

/**
 * The decade breakdown a backfill prints, one line each, newest first: what a run learned about how far back
 * ESPN's scorecards go. Empty when nothing was attempted.
 */
export function decadeTable(r: SeriesStatsResult): string[] {
  return r.byDecade.map((d) => {
    const rate = d.attempted > 0 ? Math.round((d.withCard / d.attempted) * 100) : 0;
    return `  ${d.decade}  attempted ${String(d.attempted).padStart(4)}  card ${String(d.withCard).padStart(4)} (${String(rate).padStart(3)}%)  no card ${String(d.noCard).padStart(4)}  failed ${String(d.failed).padStart(4)}`;
  });
}

/** The one line the job logs; failures are also listed one per line above it. */
export function summaryLine(r: SeriesStatsResult, cap: number): string {
  const waiting = r.eligible - r.attempted;
  return (
    `[topup-cricket-series-stats] ${r.eligible} match(es) without figures; attempted ${r.attempted} (cap ${cap}), ` +
    `stored ${r.written} (${r.playerRows} player rows), ${r.noScorecard} with no scorecard on ESPN yet, ${r.failed.length} failed` +
    (waiting > 0 ? `, ${waiting} left for the next run` : "") +
    (r.failed.length > 0 ? `; failed: ${r.failed.map((f) => f.id).join(", ")}` : "") +
    overdueWarning(r.overdue)
  );
}
