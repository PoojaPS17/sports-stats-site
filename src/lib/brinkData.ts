// What "On the brink" reads: for each league that can carry a milestone, the season's leaders over their stored
// box scores, but only while that season is a total we hold completely and is still being played.
//   * in progress: the latest season has a finished regular-season game in the last 30 days AND games still to come
//     (a season that is over has no "brink"; a league on a long break has nothing to say today);
//   * complete: every finished regular-season game of the season has stored player rows. One game without a box
//     score (or a club missing from `teams`, which drops that game's rows from every board) means some player's total is short, so the league says nothing until it is whole.
// The totals are the leaders page's own (getLeaderBoard), so the figure printed here is the figure on /<league>/leaders.
import { unstable_cache } from "next/cache";
import { pool } from "./db";
import type { League } from "./leagues";
import { getLeaderBoard, getLeadersSeason } from "./leaderQueries";
import { BRINK_LEAGUES, BRINK_RULES, selectBrink, type BrinkCandidate, type BrinkItem } from "./brink";

/** The window in which a finished game counts as the season "being played now". */
export const ACTIVE_DAYS = 30;
/** How many of a board's top rows are looked at (the leaders page lists the same many). */
const BOARD_ROWS = 15;

/** The season to read for `league`, or null when it is over, has not started, is not whole, or has gone quiet. */
export async function activeSeason(league: League): Promise<number | null> {
  const season = await getLeadersSeason(league);
  if (season === null) return null;
  const { rows } = await pool.query<{ done: number; missing: number; remaining: number; recent: number }>(
    `select count(*) filter (where g.completed)::int as done,
            count(*) filter (where g.completed and (
              not exists (select 1 from player_game_stats s where s.league = g.league and s.game_espn_id = g.espn_id)
              or not exists (select 1 from teams t where t.league = g.league and t.espn_id = g.home_team_espn_id)
              or not exists (select 1 from teams t where t.league = g.league and t.espn_id = g.away_team_espn_id)))::int as missing,
            count(*) filter (where not g.completed and g.date > now())::int as remaining,
            count(*) filter (where g.completed and g.date > now() - make_interval(days => $3))::int as recent
     from games g
     where g.league = $1 and g.season_year = $2 and g.stage in ('regular', 'other')`,
    [league, season, ACTIVE_DAYS]
  );
  const r = rows[0];
  if (!r || r.done === 0 || r.missing > 0 || r.remaining === 0 || r.recent === 0) return null;
  return season;
}

/** Every leader-board row of every league that can carry a milestone. A league whose read fails contributes nothing. */
export async function readBrinkCandidates(): Promise<BrinkCandidate[]> {
  const perLeague = await Promise.all(
    BRINK_LEAGUES.map(async (league): Promise<BrinkCandidate[]> => {
      try {
        const season = await activeSeason(league);
        if (season === null) return [];
        const boards = await Promise.all(
          (BRINK_RULES[league] ?? []).map(async (rule) => {
            const board = await getLeaderBoard(league, rule.stat, { limit: BOARD_ROWS, season, ties: true });
            return board.rows.map((r): BrinkCandidate => ({ league, season, stat: rule.stat, playerId: r.player_espn_id, name: r.name, slug: r.slug, teamName: r.team_name, value: Number(r.value) }));
          })
        );
        return boards.flat();
      } catch {
        return [];
      }
    })
  );
  return perLeague.flat();
}

const cached = unstable_cache(readBrinkCandidates, ["home-on-the-brink"], { revalidate: 120 });

/** The milestones to show now: possibly none. */
export async function getBrink(): Promise<BrinkItem[]> {
  try {
    return selectBrink(await cached());
  } catch {
    return [];
  }
}
