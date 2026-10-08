// The stored results behind "Today in three lines". Two families of candidate fact, both read from rows the
// site already shows on the page each line links to:
//   - a team's run of results (the claim in its page header), for every league that is not cricket;
//   - a cricket hundred or five-wicket innings from a match that ended in the last two days, from the
//     archived competitions' per-match rows and from the series matches' rows (a match held in both, as the
//     big internationals are, is read from the archive only: its page is the league's game page).
// The facts are cached for two minutes as plain data; which of them are fresh enough, and which three are
// shown, is decided at render time by selectLines (threeLines.ts), so a cached fact still ages out on time.
import { unstable_cache } from "next/cache";
import { pool } from "./db";
import { teamClaims } from "./heroClaims";
import { ALL_LEAGUES, SOCCER_LEAGUES, CRICKET_LEAGUES, isCricketLeague, type League } from "./leagues";
import { GAME_SELECT, type GameRow } from "./queries";
import { lastResultDate, seasonResults } from "./teamSummary";
import { FRESH_HOURS, selectLines, type LineFact } from "./threeLines";
import { cricketFacts, gameScope, teamStreakFacts, type CricketInningsRow } from "./threeLinesFacts";

const NON_CRICKET = ALL_LEAGUES.filter((l) => !isCricketLeague(l));

/** Streaks for the teams that played a counted game in the last FRESH_HOURS. */
export async function readTeamStreakFacts(): Promise<LineFact[]> {
  const { rows: recent } = await pool.query<{ league: League; season_year: number; team: string }>(
    `select distinct g.league, g.season_year, t.team
     from games g
     cross join lateral (values (g.home_team_espn_id), (g.away_team_espn_id)) as t(team)
     where g.league = any($1) and g.completed and g.season_year is not null
       and g.date > now() - make_interval(hours => $2) and g.date <= now()`,
    [NON_CRICKET, FRESH_HOURS]
  );
  const groups = new Map<string, { league: League; season: number; teams: string[] }>();
  for (const r of recent) {
    const key = `${r.league}:${r.season_year}`;
    const g = groups.get(key) ?? { league: r.league, season: r.season_year, teams: [] };
    g.teams.push(r.team);
    groups.set(key, g);
  }
  const facts: LineFact[] = [];
  const perGroup = await Promise.all(
    [...groups.values()].map(async (g) => {
      // The same season list the team page reads (newest first), for every team of the group in one query.
      const { rows } = await pool.query<GameRow>(
        `${GAME_SELECT}
         where g.league = $1 and g.season_year = $2 and (g.home_team_espn_id = any($3) or g.away_team_espn_id = any($3))
         order by g.date desc`,
        [g.league, g.season, g.teams]
      );
      return { g, rows };
    })
  );
  for (const { g, rows } of perGroup) {
    const isSoccer = (SOCCER_LEAGUES as string[]).includes(g.league);
    for (const team of g.teams) {
      const games = rows.filter((r) => r.home_team_espn_id === team || r.away_team_espn_id === team);
      const sample = games[0];
      if (!sample) continue;
      const mine = sample.home_team_espn_id === team ? { name: sample.home_name, slug: sample.home_slug } : { name: sample.away_name, slug: sample.away_slug };
      const lastPlayed = lastResultDate(games, team);
      const claims = teamClaims(seasonResults(games, team), { soccer: isSoccer, lastPlayed });
      facts.push(...teamStreakFacts({ league: g.league, teamEspnId: team, teamName: mine.name, teamSlug: mine.slug, claims, lastPlayed, scope: gameScope(games) }));
    }
  }
  return facts;
}

// A one-day match is dated by its start; a match that ran past its first day (a Test) by the end of its last.
const ENDED_AT = `coalesce((g.end_date::timestamp + interval '12 hours') at time zone 'UTC', g.date)`;
const INNINGS = `cross join lateral jsonb_array_elements(coalesce(pgs.stats->'innings', jsonb_build_array(pgs.stats))) with ordinality as inn(j, n)`;

interface RawInnings {
  league: string;
  match_id: string;
  innings_no: string | number;
  player_id: string;
  player_name: string;
  team_name: string;
  opponent_name: string;
  runs: number | null;
  balls: number | null;
  not_out: boolean | null;
  wickets: number | null;
  conceded: number | null;
  at: Date;
}

const toRow = (r: RawInnings): CricketInningsRow => ({
  league: r.league,
  matchId: r.match_id,
  inningsNo: Number(r.innings_no),
  playerId: r.player_id,
  playerName: r.player_name,
  teamName: r.team_name,
  opponentName: r.opponent_name,
  runs: r.runs,
  ballsFaced: r.balls,
  notOut: r.not_out === true,
  wickets: r.wickets,
  conceded: r.conceded,
  at: new Date(r.at),
});

/** Hundreds and five-fors from matches that ended in the window. */
export async function readCricketFacts(): Promise<LineFact[]> {
  const [archived, series] = await Promise.all([
    pool.query<RawInnings>(
      `select g.league, g.espn_id as match_id, inn.n as innings_no, pgs.player_espn_id as player_id, p.name as player_name,
              t.name as team_name, ot.name as opponent_name,
              (inn.j->'batting'->>'runs')::int as runs, (inn.j->'batting'->>'ballsFaced')::int as balls,
              (inn.j->'batting'->>'notOut')::boolean as not_out,
              (inn.j->'bowling'->>'wickets')::int as wickets, (inn.j->'bowling'->>'conceded')::int as conceded,
              ${ENDED_AT} as at
       from games g
       join player_game_stats pgs on pgs.league = g.league and pgs.game_espn_id = g.espn_id
       ${INNINGS}
       join players p on p.league = g.league and p.espn_id = pgs.player_espn_id
       join teams t on t.league = g.league and t.espn_id = pgs.team_espn_id
       join teams ot on ot.league = g.league
         and ot.espn_id = (case when pgs.team_espn_id = g.home_team_espn_id then g.away_team_espn_id else g.home_team_espn_id end)
       where g.league = any($1) and g.completed
         and ${ENDED_AT} > now() - make_interval(hours => $2) and ${ENDED_AT} <= now()
         and ((inn.j->'batting'->>'runs')::int >= 100 or (inn.j->'bowling'->>'wickets')::int >= 5)
       order by at desc
       limit 30`,
      [CRICKET_LEAGUES, FRESH_HOURS]
    ),
    pool.query<RawInnings>(
      `select 'cricket' as league, m.espn_id as match_id, inn.n as innings_no, s.player_espn_id as player_id, s.player_name,
              case when m.home->>'id' = s.team_espn_id then m.home->>'name' else m.away->>'name' end as team_name,
              case when m.home->>'id' = s.team_espn_id then m.away->>'name' else m.home->>'name' end as opponent_name,
              (inn.j->'batting'->>'runs')::int as runs, (inn.j->'batting'->>'ballsFaced')::int as balls,
              (inn.j->'batting'->>'notOut')::boolean as not_out,
              (inn.j->'bowling'->>'wickets')::int as wickets, (inn.j->'bowling'->>'conceded')::int as conceded,
              m.date as at
       from cricket_series_matches m
       join cricket_series_player_stats s on s.match_espn_id = m.espn_id
       cross join lateral jsonb_array_elements(coalesce(s.stats->'innings', jsonb_build_array(s.stats))) with ordinality as inn(j, n)
       where m.status_state = 'post' and m.date > now() - make_interval(hours => $1) and m.date <= now()
         and not exists (select 1 from games g where g.league = any($2) and g.espn_id = m.espn_id)
         and (m.home->>'id' = s.team_espn_id or m.away->>'id' = s.team_espn_id)
         and ((inn.j->'batting'->>'runs')::int >= 100 or (inn.j->'bowling'->>'wickets')::int >= 5)
       order by m.date desc
       limit 30`,
      [FRESH_HOURS, CRICKET_LEAGUES]
    ),
  ]);
  return cricketFacts([...archived.rows, ...series.rows].map(toRow));
}

/** Every candidate fact. A family whose read fails contributes nothing rather than failing the page. */
export async function readThreeLineFacts(): Promise<LineFact[]> {
  const [streaks, cricket] = await Promise.all([readTeamStreakFacts().catch(() => []), readCricketFacts().catch(() => [])]);
  return [...streaks, ...cricket];
}

const cached = unstable_cache(readThreeLineFacts, ["home-three-lines"], { revalidate: 120 });

/** The lines to show now: possibly none, possibly fewer than three. */
export async function getThreeLines(now: Date = new Date()): Promise<LineFact[]> {
  try {
    return selectLines(await cached(), now);
  } catch {
    return [];
  }
}
