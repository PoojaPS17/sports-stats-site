// The daily top-up of cricket player figures: every completed ESPN-fed game with no
// player_game_stats rows gets its scorecard read from ESPN and stored, so the leaders
// boards (which sum those rows) and the match page's stored report never lag a game.
//
// Only games with zero player rows are touched, so a re-run never rewrites anything and
// a game already loaded (from ESPN or from Cricsheet) is left exactly as it is. A run is
// capped (default 40 games, newest first) so a bad ESPN day cannot run long; the rest wait
// for the next run. Failures are collected and reported, not thrown, so one bad game
// does not stop the others; the caller exits non-zero on any.
import type { PoolClient } from "pg";
import { pool } from "./db";
import { SPORT_PATH, fetchCricketSummary, type League } from "./espn";
import { extractCricketMatchStats } from "./cricket-career";
import { isScorecardOverdue, overdueWarning, scorecardHasRowsSql, storeCricketDetailsIfMissing, writeCricketPlayerRows } from "./cricket-player-rows";
import { CRICSHEET_REPORT_SQL } from "./cricsheet-report";
import { cricketSummaryPaths, type CricketSummaryOptions } from "../../src/lib/cricketSummary";
import { extractGameDetails } from "../../src/lib/matchDetail";

/**
 * Competitions ESPN feeds directly, plus the international formats and the IPL/BBL, which
 * Cricsheet also fills (a match whose stored report is Cricsheet's is never touched: see
 * CRICSHEET_REPORT_SQL). Tests, women's ODIs and T20Is are ESPN's alone.
 */
export const TOPUP_LEAGUES = ["wpl", "wbbl", "cwc", "t20wc", "wcwc", "wt20wc", "ipl", "bbl", "odi", "t20i", "wodi", "wt20i", "test"] as const;
export const DEFAULT_TOPUP_CAP = 40;
/** A game whose report was fetched this long after it was played and still has no scorecard has none to give. */
const SETTLED_AFTER_DAYS = 3;

// A Cricsheet report's batting rows carry no `dismissal` (ESPN's parser writes one), and Cricsheet
// only feeds the leagues in CRICSHEET_LEAGUES, so anywhere else a stored report is ESPN's by
// definition. That rule lives once, in ./cricsheet-report, shared with the Cricsheet importer and
// the card refresh so the three keep their hands off each other's matches; the fragment aliases
// game_details as `d`, which is how this query names it.
const EMPTY_SCORECARD_SQL = `not ${scorecardHasRowsSql("d.details")}`;

export interface TopUpCandidate {
  league: string;
  espn_id: string;
  home_team_espn_id: string;
  away_team_espn_id: string;
  series_id: string | null;
  date: Date | string;
}

export async function findTopUpCandidates(cap: number, leagues: readonly string[] = TOPUP_LEAGUES): Promise<{ total: number; games: TopUpCandidate[] }> {
  const where = `g.league = any($1::text[]) and g.completed = true
       and not exists (select 1 from player_game_stats s where s.league = g.league and s.game_espn_id = g.espn_id)
       and not exists (
         select 1 from game_details d where d.league = g.league and d.game_espn_id = g.espn_id
           and ((${CRICSHEET_REPORT_SQL})
                or (${EMPTY_SCORECARD_SQL} and d.fetched_at > g.date + interval '${SETTLED_AFTER_DAYS} days')))`;
  const [{ rows: games }, { rows: count }] = await Promise.all([
    pool.query(
      `select g.league, g.espn_id, g.home_team_espn_id, g.away_team_espn_id, g.date,
              (select split_part(m.series_espn_id, '-', 1) from cricket_series_matches m where m.espn_id = g.espn_id) as series_id
       from games g where ${where} order by g.date desc limit $2`,
      [leagues, cap]
    ),
    pool.query(`select count(*)::int as n from games g where ${where}`, [leagues]),
  ]);
  return { total: count[0].n, games };
}

/** Reads a candidate's summary; a thrown error is that game's failure. */
export type SummaryFetcher = (game: TopUpCandidate) => Promise<any>;

/** ESPN's own path for the competition, then (for internationals) the series the listing filed the match under, then the IPL path that serves any cricket event. */
export function defaultSummaryFetcher(options?: CricketSummaryOptions): SummaryFetcher {
  return (game) => {
    const own = SPORT_PATH[game.league as League] ?? (game.series_id ? `cricket/${game.series_id}` : undefined);
    return fetchCricketSummary(game.espn_id, cricketSummaryPaths(own), {
      ...options,
      // A summary that is a header alone (a half-rendered copy) is worth another path; one with no scorecard anywhere is returned as it is.
      accept: (summary) => extractCricketMatchStats(summary).players.length > 0,
    });
  };
}

export interface TopUpResult {
  /** Games with no player rows that were eligible when the run started. */
  eligible: number;
  /** Eligible games this run attempted (at most the cap). */
  attempted: number;
  /** Games whose scorecard was stored. */
  written: number;
  playerRows: number;
  /** Games ESPN answered for but has no scorecard for (yet): retried on later runs until settled. */
  noScorecard: number;
  /** The no-scorecard games (league/id) that are more than three days past their match date: ESPN is not going to publish one soon, and the job exits 0 for them. */
  overdue: string[];
  failed: { league: string; id: string; error: string }[];
}

export async function topUpCricketPlayerStats(options: { cap?: number; leagues?: readonly string[]; fetchSummary?: SummaryFetcher; delayMs?: number } = {}): Promise<TopUpResult> {
  const cap = options.cap ?? DEFAULT_TOPUP_CAP;
  const fetchSummary = options.fetchSummary ?? defaultSummaryFetcher();
  const { total, games } = await findTopUpCandidates(cap, options.leagues);
  const result: TopUpResult = { eligible: total, attempted: games.length, written: 0, playerRows: 0, noScorecard: 0, overdue: [], failed: [] };

  for (const game of games) {
    try {
      const summary = await fetchSummary(game);
      const { venue, players } = extractCricketMatchStats(summary);
      const details = extractGameDetails("cricket", summary, game.home_team_espn_id, game.away_team_espn_id);
      // One transaction per game, so a failure part-way never leaves a game with some of its
      // rows (it would stop being a candidate and undercount its players for good).
      const client: PoolClient = await pool.connect();
      let rows = 0;
      try {
        await client.query("begin");
        await storeCricketDetailsIfMissing(client, game.league, game.espn_id, details);
        if (players.length > 0) {
          if (venue) await client.query(`update games set venue = $3 where league = $1 and espn_id = $2 and venue is null`, [game.league, game.espn_id, venue]);
          rows = await writeCricketPlayerRows(client, game.league, game.espn_id, players, true);
        }
        await client.query("commit");
      } catch (err) {
        await client.query("rollback").catch(() => {});
        throw err;
      } finally {
        client.release();
      }
      result.playerRows += rows;
      if (players.length > 0) result.written++;
      else {
        result.noScorecard++;
        if (isScorecardOverdue(game.date)) result.overdue.push(`${game.league}/${game.espn_id}`);
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      result.failed.push({ league: game.league, id: game.espn_id, error });
      console.error(`[topup-cricket-player-stats] ${game.league} ${game.espn_id} failed: ${error}`);
    }
    if (options.delayMs) await new Promise((r) => setTimeout(r, options.delayMs));
  }
  return result;
}

/** The job's exit status: 1 when any game could not be read or stored, so the scrape run records the failure. */
export const topUpExitCode = (r: TopUpResult): number => (r.failed.length > 0 ? 1 : 0);

/** The one line the daily job logs; failures are also listed one per line above it. */
export function summaryLine(r: TopUpResult, cap: number): string {
  const waiting = r.eligible - r.attempted;
  return (
    `[topup-cricket-player-stats] ${r.eligible} game(s) without player rows; attempted ${r.attempted} (cap ${cap}), ` +
    `stored ${r.written} (${r.playerRows} player rows), ${r.noScorecard} with no scorecard on ESPN yet, ${r.failed.length} failed` +
    (waiting > 0 ? `, ${waiting} left for the next run` : "") +
    (r.failed.length > 0 ? `; failed: ${r.failed.map((f) => `${f.league}/${f.id}`).join(", ")}` : "") +
    overdueWarning(r.overdue)
  );
}
