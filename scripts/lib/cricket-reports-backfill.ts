// Stores the match report (game_details) for completed cricket games that have none at all.
// Those games already carry their player figures (player_game_stats), so the daily top-up, which
// only visits games with no player rows, never reaches them; and the proxy day-caches a finished
// game only when its report is stored (src/lib/gameCache.ts), so each of them renders from ESPN's
// live summary on every request. This writes the report and nothing else: no player row, no
// game, no team is touched, and a game that already has any report is never selected.
//
// A summary with no scorecard (ESPN has none for the match) is left alone rather than stored as
// an empty report: an empty report would mark the game final and cache a page with no scorecard.
// See scripts/backfill-cricket-reports.ts.
import { pool } from "./db";
import { extractCricketMatchStats } from "./cricket-career";
import { storeCricketDetailsIfMissing } from "./cricket-player-rows";
import { defaultSummaryFetcher, type SummaryFetcher, type TopUpCandidate } from "./cricket-topup";
import { extractGameDetails } from "../../src/lib/matchDetail";

/** The ESPN-fed competitions whose finished games were found with player figures but no report. */
export const REPORT_BACKFILL_LEAGUES = ["wpl", "wbbl", "wcwc", "wt20wc"] as const;
export const DEFAULT_REPORT_CAP = 100;

export async function findReportless(cap: number, leagues: readonly string[] = REPORT_BACKFILL_LEAGUES): Promise<{ total: number; games: TopUpCandidate[] }> {
  const where = `g.league = any($1::text[]) and g.completed = true
       and not exists (select 1 from game_details d where d.league = g.league and d.game_espn_id = g.espn_id)`;
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

const hasScorecardRows = (details: { scorecard?: { battingRows?: unknown[]; bowlingRows?: unknown[] }[] }) =>
  (details.scorecard ?? []).some((c) => (c.battingRows?.length ?? 0) > 0 || (c.bowlingRows?.length ?? 0) > 0);

export interface ReportBackfillResult {
  eligible: number;
  attempted: number;
  /** Reports stored (or, in a dry run, that would be). */
  written: number;
  /** Games ESPN answered for but has no scorecard for: nothing stored. */
  noScorecard: string[];
  failed: { league: string; id: string; error: string }[];
}

export async function backfillCricketReports(options: { cap?: number; leagues?: readonly string[]; fetchSummary?: SummaryFetcher; delayMs?: number; dryRun?: boolean } = {}): Promise<ReportBackfillResult> {
  const cap = options.cap ?? DEFAULT_REPORT_CAP;
  const fetchSummary = options.fetchSummary ?? defaultSummaryFetcher();
  const { total, games } = await findReportless(cap, options.leagues);
  const result: ReportBackfillResult = { eligible: total, attempted: games.length, written: 0, noScorecard: [], failed: [] };
  for (const game of games) {
    try {
      const summary = await fetchSummary(game);
      const details = extractGameDetails("cricket", summary, game.home_team_espn_id, game.away_team_espn_id);
      if (extractCricketMatchStats(summary).players.length === 0 || !hasScorecardRows(details as any)) {
        result.noScorecard.push(`${game.league}/${game.espn_id}`);
      } else {
        if (!options.dryRun) await storeCricketDetailsIfMissing(pool, game.league, game.espn_id, details);
        result.written++;
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      result.failed.push({ league: game.league, id: game.espn_id, error });
      console.error(`[backfill-cricket-reports] ${game.league} ${game.espn_id} failed: ${error}`);
    }
    if (options.delayMs) await new Promise((r) => setTimeout(r, options.delayMs));
  }
  return result;
}

export function reportSummaryLine(r: ReportBackfillResult, cap: number, dryRun: boolean): string {
  const waiting = r.eligible - r.attempted;
  return (
    `[backfill-cricket-reports] ${r.eligible} completed game(s) without a stored report; attempted ${r.attempted} (cap ${cap}), ` +
    `${dryRun ? "would store" : "stored"} ${r.written}, ${r.noScorecard.length} with no scorecard on ESPN, ${r.failed.length} failed` +
    (waiting > 0 ? `, ${waiting} left for the next run` : "") +
    (r.noScorecard.length > 0 ? `; no scorecard: ${r.noScorecard.join(", ")}` : "") +
    (r.failed.length > 0 ? `; failed: ${r.failed.map((f) => `${f.league}/${f.id}`).join(", ")}` : "")
  );
}
