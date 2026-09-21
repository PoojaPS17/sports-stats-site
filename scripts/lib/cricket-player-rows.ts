// The one writer of a cricket match's per-player figures (player_game_stats) and of the players
// they belong to, shared by the one-off backfill and the daily top-up so both store exactly
// the same shape. The figures come from extractCricketMatchStats (lib/cricket-career.ts).
import type { Pool, PoolClient } from "pg";
import { CARD_VERSION, type CricketPlayerMatchStats } from "./cricket-career";
import { uniqueSlugFor } from "./players";

type Queryable = Pick<Pool | PoolClient, "query">;

/**
 * Upserts each player and their figures for one match. With `keepClub` an existing player
 * keeps the club they are on: a run over older, newly added games must not move someone back
 * to a side they have since left, it only creates players we have never seen.
 * Returns the number of player-game rows written.
 */
export async function writeCricketPlayerRows(db: Queryable, league: string, gameEspnId: string, players: CricketPlayerMatchStats[], keepClub: boolean): Promise<number> {
  for (const p of players) {
    const slug = await uniqueSlugFor(league, p.athleteId, p.name);
    await db.query(
      `insert into players (league, espn_id, team_espn_id, name, slug)
       values ($1, $2, $3, $4, $5)
       on conflict (league, espn_id) do update set
         name = excluded.name,
         team_espn_id = case when $6 then players.team_espn_id else excluded.team_espn_id end`,
      [league, p.athleteId, p.teamId, p.name, slug, keepClub]
    );

    await db.query(
      `insert into player_game_stats (league, game_espn_id, player_espn_id, team_espn_id, stats, updated_at)
       values ($1, $2, $3, $4, $5, now())
       on conflict (league, game_espn_id, player_espn_id) do update set
         team_espn_id = excluded.team_espn_id, stats = excluded.stats, updated_at = now()`,
      [league, gameEspnId, p.athleteId, p.teamId, JSON.stringify({ batting: p.batting, bowling: p.bowling, catches: p.catches, innings: p.innings, v: CARD_VERSION })]
    );
  }
  return players.length;
}

/** SQL: the report in `details` (a jsonb expression) has at least one batting or bowling row on its scorecard. A report built from a summary with squads but no figures lists teams with empty rows, so the array's length says nothing. */
export const scorecardHasRowsSql = (details: string) =>
  `exists (select 1 from jsonb_array_elements(case when jsonb_typeof(${details} -> 'scorecard') = 'array' then ${details} -> 'scorecard' else '[]'::jsonb end) as sc(v)
     where (jsonb_typeof(sc.v -> 'battingRows') = 'array' and jsonb_array_length(sc.v -> 'battingRows') > 0)
        or (jsonb_typeof(sc.v -> 'bowlingRows') = 'array' and jsonb_array_length(sc.v -> 'bowlingRows') > 0))`;

/**
 * Stores the match report (game_details) only when the game has none with a scorecard, so a
 * good stored report is never replaced by a thinner one. Returns whether it wrote.
 */
export async function storeCricketDetailsIfMissing(db: Queryable, league: string, gameEspnId: string, details: unknown): Promise<boolean> {
  const { rowCount } = await db.query(
    `insert into game_details (league, game_espn_id, details, fetched_at) values ($1, $2, $3, now())
     on conflict (league, game_espn_id) do update set details = excluded.details, fetched_at = now()
       where not ${scorecardHasRowsSql("game_details.details")}`,
    [league, gameEspnId, JSON.stringify(details)]
  );
  return (rowCount ?? 0) > 0;
}
