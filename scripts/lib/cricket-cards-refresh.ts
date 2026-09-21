// The per-match step of refresh-cricket-cards.ts, apart from the script's fetching and
// looping so it can run against a test database. `db` is the pool (or any client).
import type { Pool } from "pg";
import { isCricketLeague, isFirstClassCricket, type League } from "../../src/lib/leagues";
import { parseCricketScorecard } from "../../src/lib/matchDetail";
import { CARD_VERSION, extractCricketMatchStats } from "./cricket-career";
import { isCricsheetReport, isEspnReport } from "./cricsheet-report";

export interface RefreshResult {
  /** Why the match was left entirely alone (nothing written), or null when it was refreshed. */
  skipped: string | null;
  /** Card rows the match did not have (a player in the XI with no figures, before CARD_VERSION 3). */
  inserted: number;
  updated: number;
  /** Rows not inserted because the match already has a row for the same name and side under another id. */
  duplicates: number;
  /** Of the inserted rows, how many have no `players` row, so no player page until one is created. */
  orphans: number;
  /** Batting rows in the stored report before and after; null when the report is left alone. */
  battingRows: { before: number; after: number } | null;
}

const battingRowCount = (scorecard: any): number => (Array.isArray(scorecard) ? scorecard.reduce((n, t) => n + (t?.battingRows?.length ?? 0), 0) : 0);
const inningsTotalCount = (scorecard: any): number => (Array.isArray(scorecard) ? scorecard.reduce((n, t) => n + (Array.isArray(t?.innings) ? t.innings.length : 0), 0) : 0);

export async function refreshMatchCards(db: Pick<Pool, "query">, league: string, gameId: string, summary: any, opts: { dryRun: boolean }): Promise<RefreshResult> {
  const skip = (skipped: string): RefreshResult => ({ skipped, inserted: 0, updated: 0, duplicates: 0, orphans: 0, battingRows: null });

  // Never touch a match whose stored report is Cricsheet's: those cards are computed ball by ball. (Only
  // in a league Cricsheet feeds; anywhere else a stored report is ESPN's, see cricsheet-report.ts.)
  const { rows: stored } = await db.query(`select details -> 'scorecard' as scorecard from game_details where league = $1 and game_espn_id = $2`, [league, gameId]);
  const storedScorecard = stored[0]?.scorecard;
  if (isCricsheetReport(league, storedScorecard)) return skip("its stored report is Cricsheet's");
  // With no stored report (or none that carries a scorecard) the cards are refreshed and there is
  // nothing to rebuild: a report is never created here.
  const rebuildReport = isEspnReport(league, storedScorecard);

  // A partial copy of the match (no competitors, or no class on a Test) reads wrongly rather than
  // emptily: a Test would lose its second innings. Refuse it, so the match is counted as failed and retried.
  const competition = summary?.header?.competitions?.[0];
  if (!competition?.competitors?.length) throw new Error("summary has no competitors (a partial copy of the match)");
  if (isFirstClassCricket(league as League) && !competition.class?.generalClassCard) throw new Error("summary has no match class, so a Test's innings cannot be told apart");

  const { players } = extractCricketMatchStats(summary);
  // An empty read is a bad response, not a match nobody played in: leave the rows be.
  if (players.length === 0) throw new Error("summary has no player figures");

  // A report that would lose content is a degraded response: leave the whole match as it is.
  const scorecard = rebuildReport ? parseCricketScorecard(summary) : [];
  const before = battingRowCount(storedScorecard);
  const after = battingRowCount(scorecard);
  if (rebuildReport && after < before) return skip(`the rebuilt report has fewer batting rows (${after}, was ${before})`);
  if (rebuildReport && inningsTotalCount(scorecard) === 0 && inningsTotalCount(storedScorecard) > 0) return skip("the rebuilt report has no innings totals, the stored one does");

  const { rows: have } = await db.query(
    `select s.player_espn_id, s.team_espn_id, p.name from player_game_stats s
     left join players p on p.league = s.league and p.espn_id = s.player_espn_id
     where s.league = $1 and s.game_espn_id = $2`,
    [league, gameId]
  );
  const existing = new Set(have.map((r) => r.player_espn_id as string));
  // The same person can be stored under two ids (Cricsheet's "cs-<ident>" when the register has no
  // Cricinfo id, ESPN's numeric id): a row for the same name on the same side counts as his.
  const nameKey = (side: string | null, name: string | null | undefined) => (name ? `${side}|${name.trim().toLowerCase()}` : null);
  const haveNames = new Set(have.map((r) => nameKey(r.team_espn_id, r.name)).filter(Boolean));
  const isDuplicate = (p: (typeof players)[number]) => {
    const key = nameKey(p.teamId, p.name);
    return !existing.has(p.athleteId) && key !== null && haveNames.has(key);
  };
  const duplicates = players.filter(isDuplicate);
  const rows = players.filter((p) => !isDuplicate(p));
  const insertIds = rows.filter((p) => !existing.has(p.athleteId)).map((p) => p.athleteId);
  const { rows: orphan } = await db.query(
    `select count(*)::int as n from unnest($2::text[]) as i(id) where not exists (select 1 from players where league = $1 and espn_id = i.id)`,
    [league, insertIds]
  );
  const result: RefreshResult = {
    skipped: null,
    inserted: insertIds.length,
    updated: rows.length - insertIds.length,
    duplicates: duplicates.length,
    orphans: orphan[0].n,
    battingRows: rebuildReport ? { before, after } : null,
  };
  if (opts.dryRun) return result;

  // The report goes first: the card rows' version stamp is what marks a match done, so a
  // failure here leaves the match to be picked up again rather than half-refreshed.
  if (rebuildReport) {
    await db.query(`update game_details set details = details || jsonb_build_object('scorecard', $3::jsonb) where league = $1 and game_espn_id = $2`, [league, gameId, JSON.stringify(scorecard)]);
  }
  // An existing row keeps the side it was filed under.
  await db.query(
    `insert into player_game_stats (league, game_espn_id, player_espn_id, team_espn_id, stats, updated_at)
     select $1, $2, r.id, r.team, r.stats::jsonb, now()
     from unnest($3::text[], $4::text[], $5::text[]) as r(id, team, stats)
     on conflict (league, game_espn_id, player_espn_id) do update set stats = excluded.stats, updated_at = now()`,
    [
      league,
      gameId,
      rows.map((p) => p.athleteId),
      rows.map((p) => p.teamId),
      rows.map((p) => JSON.stringify({ batting: p.batting, bowling: p.bowling, catches: p.catches, innings: p.innings, v: CARD_VERSION })),
    ]
  );
  return result;
}

/* ------------------------------------------------------------------------ */
/* Arguments                                                                 */
/* ------------------------------------------------------------------------ */

export const REFRESH_USAGE = "usage: refresh-cricket-cards.ts <league> [--espn-cards-only] [--since-year YYYY] [--dry-run]";

export type RefreshArgs = { league: League; dryRun: boolean; sinceYear: number | null } | { error: string };

/**
 * Strict: exactly one known cricket league and only the known flags. `--espn-cards-only` is accepted
 * and does nothing (the refresh only ever touches ESPN-fed matches). Anything else, a misspelt flag
 * included, is an error rather than silently a real write.
 */
export function parseRefreshArgs(args: string[]): RefreshArgs {
  let league: string | null = null;
  let dryRun = false;
  let sinceYear: number | null = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--dry-run") dryRun = true;
    else if (a === "--espn-cards-only") continue;
    else if (a === "--since-year") {
      const value = args[++i];
      if (sinceYear !== null) return { error: "--since-year given twice" };
      if (value === undefined || !/^\d{4}$/.test(value)) return { error: `--since-year needs a 4-digit year, got ${value === undefined ? "nothing" : `"${value}"`}` };
      sinceYear = Number(value);
    } else if (a.startsWith("-")) return { error: `unknown option "${a}"` };
    else if (league !== null) return { error: `more than one league ("${league}" and "${a}")` };
    else if (!isCricketLeague(a as League)) return { error: `"${a}" is not a cricket league` };
    else league = a;
  }
  if (league === null) return { error: "no league given" };
  return { league: league as League, dryRun, sinceYear };
}
