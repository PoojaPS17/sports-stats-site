// The per-match step of refresh-cricket-cards.ts, apart from the script's fetching and
// looping so it can run against a test database. `db` is the pool (or any client).
import type { Pool } from "pg";
import { parseCricketScorecard } from "../../src/lib/matchDetail";
import { CARD_VERSION, extractCricketMatchStats } from "./cricket-career";

export interface RefreshResult {
  /** Card rows the match did not have (a player in the XI with no figures, before CARD_VERSION 3). */
  inserted: number;
  updated: number;
  /** Batting rows in the stored report before and after; null when the report is left alone. */
  battingRows: { before: number; after: number } | null;
}

const battingRowCount = (scorecard: any): number => (Array.isArray(scorecard) ? scorecard.reduce((n, t) => n + (t?.battingRows?.length ?? 0), 0) : 0);

export async function refreshMatchCards(
  db: Pick<Pool, "query">,
  league: string,
  gameId: string,
  summary: any,
  opts: { rewriteScorecard: boolean; dryRun: boolean }
): Promise<RefreshResult> {
  const { players } = extractCricketMatchStats(summary);
  // An empty read is a bad response, not a match nobody played in: leave the rows be.
  if (players.length === 0) throw new Error("summary has no player figures");

  const { rows: have } = await db.query(`select player_espn_id from player_game_stats where league = $1 and game_espn_id = $2`, [league, gameId]);
  const existing = new Set(have.map((r) => r.player_espn_id as string));
  const result: RefreshResult = { inserted: players.filter((p) => !existing.has(p.athleteId)).length, updated: players.filter((p) => existing.has(p.athleteId)).length, battingRows: null };

  // The report goes first: the card rows' version stamp is what marks a match done, so a
  // failure here leaves the match to be picked up again rather than half-refreshed.
  const scorecard = opts.rewriteScorecard ? parseCricketScorecard(summary) : [];
  if (scorecard.length > 0) {
    const { rows } = await db.query(`select details -> 'scorecard' as scorecard from game_details where league = $1 and game_espn_id = $2`, [league, gameId]);
    // No stored report to merge into: nothing to rebuild.
    if (rows[0]) {
      result.battingRows = { before: battingRowCount(rows[0].scorecard), after: battingRowCount(scorecard) };
      if (!opts.dryRun) {
        await db.query(`update game_details set details = details || jsonb_build_object('scorecard', $3::jsonb) where league = $1 and game_espn_id = $2`, [league, gameId, JSON.stringify(scorecard)]);
      }
    }
  }

  if (!opts.dryRun) {
    // An existing row keeps the side it was filed under.
    await db.query(
      `insert into player_game_stats (league, game_espn_id, player_espn_id, team_espn_id, stats, updated_at)
       select $1, $2, r.id, r.team, r.stats::jsonb, now()
       from unnest($3::text[], $4::text[], $5::text[]) as r(id, team, stats)
       on conflict (league, game_espn_id, player_espn_id) do update set stats = excluded.stats, updated_at = now()`,
      [
        league,
        gameId,
        players.map((p) => p.athleteId),
        players.map((p) => p.teamId),
        players.map((p) => JSON.stringify({ batting: p.batting, bowling: p.bowling, catches: p.catches, innings: p.innings, v: CARD_VERSION })),
      ]
    );
  }
  return result;
}
