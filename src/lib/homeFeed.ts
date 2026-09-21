// The home page's cross-sport feed: what is in play right now and the biggest
// fixtures of the coming week, across every competition SportsDB covers.
import { pool } from "./db";
import { GAME_SELECT, type GameRow, type League } from "./queries";
import { ALL_LEAGUES } from "./leagues";
import { CALLED_OFF } from "./gameStatus";
import { displayF1Event, type F1EventRow } from "./f1";

// Which competitions lead the upcoming list when fixtures fall on the same day.
const LEAGUE_PRIORITY: League[] = ["ucl", "nfl", "nba", "epl", "cwc", "t20wc", "wcwc", "wt20wc", "ipl", "test", "odi", "laliga", "bundesliga", "seriea", "t20i", "wodi", "wt20i", "bbl", "wpl", "wbbl"];

// pg hands `date` back as a Date object; compare on the timestamp.
const at = (g: GameRow) => new Date(g.date).getTime();

function priority(g: GameRow): number {
  const stage = g.round ?? "";
  if (/final|semi|qualifier|eliminator|playoff|super bowl|championship/i.test(stage)) return -1;
  const i = LEAGUE_PRIORITY.indexOf(g.league);
  return i === -1 ? LEAGUE_PRIORITY.length : i;
}

/**
 * Games stored as in play, plus any whose start has passed without a result (the scrape may not have seen
 * them start). A postponed or cancelled game has no result either, but it is not in play: only the second
 * arm, which guesses from the start time, leaves it out.
 */
export async function getLiveGames(): Promise<GameRow[]> {
  const { rows } = await pool.query(
    `${GAME_SELECT}
     where g.league = any($1::text[]) and g.completed = false
       and ((g.status_state = 'in' and g.date > now() - interval '12 hours')
         or (g.date <= now() + interval '15 minutes' and g.date > now() - interval '9 hours' and coalesce(g.status_detail, '') !~* $2))
     order by g.date`,
    [ALL_LEAGUES, CALLED_OFF.source]
  );
  return rows;
}

type Ranked = GameRow & { table_rank: number | null };

/**
 * The week's fixtures, biggest competitions and knockout stages first, then games
 * involving the teams highest in their table, at most `perLeague` from any one competition.
 */
export async function getUpcomingGames(limit = 6, perLeague = 2, withinDays = 7): Promise<GameRow[]> {
  const { rows } = await pool.query(
    `with ranked as (
       select league, team_espn_id,
              rank() over (partition by league, season, coalesce(conference, '') order by points desc nulls last, win_percent desc nulls last, wins desc) as pos
       from standings s
       where season = (select max(season) from standings x where x.league = s.league and (x.wins + x.losses + coalesce(x.draws, 0)) > 0)
     ),
     -- A team in two stage tables (group, then Super Eights) counts by its best place.
     pos as (select league, team_espn_id, min(pos) as pos from ranked group by 1, 2)
     ${GAME_SELECT.replace("from games g", ", least(ph.pos, pa.pos)::int as table_rank from games g")}
     left join pos ph on ph.league = g.league and ph.team_espn_id = g.home_team_espn_id
     left join pos pa on pa.league = g.league and pa.team_espn_id = g.away_team_espn_id
     where g.league = any($1::text[]) and g.completed = false and coalesce(g.status_state, 'pre') = 'pre'
       and g.date > now() + interval '15 minutes' and g.date < now() + ($2 || ' days')::interval
     order by g.date`,
    [ALL_LEAGUES, withinDays]
  );
  // A knockout stage or the top competitions lead; within a competition, the game
  // with the better-placed team; then the earlier start.
  const games = (rows as Ranked[]).sort((a, b) => priority(a) - priority(b) || (a.table_rank ?? 99) - (b.table_rank ?? 99) || at(a) - at(b));
  const taken = new Map<League, number>();
  const out: GameRow[] = [];
  for (const g of games) {
    const n = taken.get(g.league) ?? 0;
    if (n >= perLeague) continue;
    taken.set(g.league, n + 1);
    out.push(g);
    if (out.length >= limit) break;
  }
  return out.sort((a, b) => at(a) - at(b));
}

/** The next Grand Prix weekend when one starts within `withinDays`, or is under way. */
export async function getNextF1Event(withinDays = 7): Promise<F1EventRow | null> {
  const { rows } = await pool.query(
    `select e.espn_id, e.name, e.short_name,
            to_char(e.date at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as date,
            to_char(e.end_date at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as end_date,
            e.season_year, e.circuit_name, initcap(e.circuit_city) as circuit_city, initcap(e.circuit_country) as circuit_country,
            null::text as winner_name, null::text as winner_slug, null::text as race_status_state, null::text as race_status_detail, null::boolean as race_completed
     from f1_events e
     where coalesce(e.end_date, e.date + interval '2 days') >= now() and e.date < now() + ($1 || ' days')::interval
       -- a Grand Prix ESPN cancelled or postponed is not a race weekend to look forward to
       and not exists (select 1 from f1_sessions s where s.event_espn_id = e.espn_id and s.session_type = 'Race'
                       and not s.completed and s.status_state is distinct from 'in' and coalesce(s.status_detail, '') ~* $2)
     order by e.date limit 1`,
    [withinDays, CALLED_OFF.source]
  );
  return rows[0] ? displayF1Event(rows[0]) : null;
}
