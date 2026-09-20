// Derived views over the games/standings archive: computed league tables (home,
// away, form), Elo power ratings, head-to-head history, season-by-season team
// history, and record books. Everything here is pure aggregation of data the
// scrapers already store — nothing is fetched from ESPN.
import { pool } from "./db";
import { isCricketLeague, SOCCER_LEAGUES, type League } from "./leagues";
import type { GameStage } from "./gameStage";
import { CALLED_OFF, isCalledOff } from "./gameStatus";
import type { GameRow } from "./queries";

/* ------------------------------------------------------------------------ */
/* Shared                                                                    */
/* ------------------------------------------------------------------------ */

export interface ResultRow {
  espn_id: string;
  date: string;
  season_year: number | null;
  round: string | null;
  /** games.stage; absent on a result built from a query that does not select it. */
  stage?: GameStage | null;
  home_team_espn_id: string;
  away_team_espn_id: string;
  home_score: number;
  away_score: number;
}

export interface TeamRef {
  espn_id: string;
  name: string;
  slug: string;
  abbreviation: string | null;
  logo_url: string | null;
  color: string | null;
}

export function isSoccer(league: League): boolean {
  return (SOCCER_LEAGUES as League[]).includes(league);
}

/** Leagues where scores are plain integers, so margin-based analysis makes sense. */
export function supportsScoreAnalytics(league: League): boolean {
  return !isCricketLeague(league);
}

export function supportsInjuryTracker(league: League): boolean {
  return league === "nfl" || league === "nba";
}

// Regular-season only: stage = 'regular' (see db/schema.sql). Playoff rounds, the NBA
// play-in, preseason and cup finals are other stages, as are a knockout league's round
// games. Computed tables should match the official league table, which never includes
// them. Cricket keeps every game: its "Match N"/"Final" labels are rounds too.
async function getSeasonResults(league: League, season: number, regularSeasonOnly: boolean): Promise<ResultRow[]> {
  const { rows } = await pool.query(
    `select espn_id, date, season_year, round, stage, home_team_espn_id, away_team_espn_id, home_score, away_score
     from games
     where league = $1 and season_year = $2 and completed = true
       and home_score is not null and away_score is not null
       ${regularSeasonOnly && !isCricketLeague(league) ? "and stage = 'regular'" : ""}
     order by date asc`,
    [league, season]
  );
  return rows;
}

// Every result Elo and the records read: playoffs and the play-in stay, but a game that
// says nothing about strength (preseason, All-Star, the NBA Cup final) is skipped.
async function getAllResults(league: League): Promise<ResultRow[]> {
  const { rows } = await pool.query(
    `select espn_id, date, season_year, round, stage, home_team_espn_id, away_team_espn_id, home_score, away_score
     from games
     where league = $1 and completed = true and home_score is not null and away_score is not null
       and stage <> 'excluded'
     order by date asc`,
    [league]
  );
  return rows;
}

export async function getTeamMap(league: League): Promise<Map<string, TeamRef>> {
  const { rows } = await pool.query(
    `select espn_id, name, slug, abbreviation, logo_url, color from teams where league = $1`,
    [league]
  );
  return new Map(rows.map((r) => [r.espn_id as string, r as TeamRef]));
}

export async function getCurrentSeason(league: League): Promise<number | null> {
  const { rows } = await pool.query(
    `select max(season_year) as season from games where league = $1 and completed = true`,
    [league]
  );
  return rows[0]?.season ?? null;
}

/* ------------------------------------------------------------------------ */
/* Computed league tables (overall / home / away / form)                     */
/* ------------------------------------------------------------------------ */

export type TableScope = "overall" | "home" | "away" | "form";

export interface ComputedTableRow {
  team: TeamRef;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  /** Most recent first, at most five results. */
  form: ("W" | "D" | "L")[];
}

export function computeTable(league: League, results: ResultRow[], teams: Map<string, TeamRef>, scope: TableScope, lastN = 5): ComputedTableRow[] {
  const soccer = isSoccer(league);
  const rows = new Map<string, ComputedTableRow>();
  const perTeam = new Map<string, { gf: number; ga: number; r: "W" | "D" | "L" }[]>();

  function bump(id: string) {
    const t = teams.get(id);
    if (!t) return null;
    if (!rows.has(id)) rows.set(id, { team: t, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, points: 0, form: [] });
    if (!perTeam.has(id)) perTeam.set(id, []);
    return rows.get(id)!;
  }

  for (const g of results) {
    const sides: { id: string; gf: number; ga: number; home: boolean }[] = [
      { id: g.home_team_espn_id, gf: g.home_score, ga: g.away_score, home: true },
      { id: g.away_team_espn_id, gf: g.away_score, ga: g.home_score, home: false },
    ];
    for (const s of sides) {
      if (scope === "home" && !s.home) continue;
      if (scope === "away" && s.home) continue;
      if (!bump(s.id)) continue;
      const r: "W" | "D" | "L" = s.gf > s.ga ? "W" : s.gf < s.ga ? "L" : "D";
      perTeam.get(s.id)!.push({ gf: s.gf, ga: s.ga, r });
    }
  }

  for (const [id, list] of perTeam) {
    const row = rows.get(id)!;
    const counted = scope === "form" ? list.slice(-lastN) : list;
    for (const g of counted) {
      row.played++;
      row.goalsFor += g.gf;
      row.goalsAgainst += g.ga;
      if (g.r === "W") row.wins++;
      else if (g.r === "L") row.losses++;
      else row.draws++;
    }
    row.points = soccer ? row.wins * 3 + row.draws : row.wins;
    row.form = list.slice(-5).reverse().map((g) => g.r);
  }

  const out = [...rows.values()];
  out.sort((a, b) => {
    if (soccer) {
      return (
        b.points - a.points ||
        b.goalsFor - b.goalsAgainst - (a.goalsFor - a.goalsAgainst) ||
        b.goalsFor - a.goalsFor ||
        a.team.name.localeCompare(b.team.name)
      );
    }
    const pa = a.played ? a.wins / a.played : 0;
    const pb = b.played ? b.wins / b.played : 0;
    return pb - pa || b.wins - a.wins || b.goalsFor - b.goalsAgainst - (a.goalsFor - a.goalsAgainst) || a.team.name.localeCompare(b.team.name);
  });
  return out;
}

export async function getComputedTable(league: League, season: number, scope: TableScope): Promise<ComputedTableRow[]> {
  const [results, teams] = await Promise.all([getSeasonResults(league, season, true), getTeamMap(league)]);
  return computeTable(league, results, teams, scope);
}

/* ------------------------------------------------------------------------ */
/* Elo power ratings                                                         */
/* ------------------------------------------------------------------------ */

export interface EloRow {
  team: TeamRef;
  rating: number;
  /** Rating change over the team's last five games. */
  trend: number;
  played: number;
  peak: number;
}

const ELO_BASE = 1500;

// Per-sport tuning. K controls how fast ratings react; homeAdvantage is the rating
// bonus a home side gets when predicting; seasonCarry is how much of a team's
// deviation from average survives the off-season (rosters churn, so ratings regress).
export const ELO_PARAMS: Record<string, { k: number; homeAdvantage: number; seasonCarry: number; marginScale: number }> = {
  nba: { k: 20, homeAdvantage: 90, seasonCarry: 0.75, marginScale: 10 },
  nfl: { k: 24, homeAdvantage: 55, seasonCarry: 0.67, marginScale: 7 },
  epl: { k: 22, homeAdvantage: 60, seasonCarry: 0.8, marginScale: 1 },
  laliga: { k: 22, homeAdvantage: 60, seasonCarry: 0.8, marginScale: 1 },
  bundesliga: { k: 22, homeAdvantage: 60, seasonCarry: 0.8, marginScale: 1 },
  seriea: { k: 22, homeAdvantage: 60, seasonCarry: 0.8, marginScale: 1 },
  // Few games per club per season, so ratings lean a little more on the previous season.
  ucl: { k: 24, homeAdvantage: 60, seasonCarry: 0.85, marginScale: 1 },
  default: { k: 20, homeAdvantage: 50, seasonCarry: 0.75, marginScale: 1 },
};

export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

/** Current Elo rating per team id, computed from every result on record. */
export async function getEloRatings(league: League): Promise<{ ratings: Map<string, number>; teams: Map<string, TeamRef>; lastResult: string | null }> {
  const [results, teams] = await Promise.all([getAllResults(league), getTeamMap(league)]);
  const { ratings } = computeElo(league, results, teams);
  return { ratings, teams, lastResult: results.length ? results[results.length - 1].date : null };
}

/** Probability the home side wins (draws excluded), given both ratings. */
export function homeWinProbability(league: League, homeRating: number, awayRating: number): number {
  const p = ELO_PARAMS[league] ?? ELO_PARAMS.default;
  return expectedScore(homeRating + p.homeAdvantage, awayRating);
}

export function computeElo(league: League, results: ResultRow[], teams: Map<string, TeamRef>): { rows: EloRow[]; ratings: Map<string, number> } {
  const p = ELO_PARAMS[league] ?? ELO_PARAMS.default;
  const ratings = new Map<string, number>();
  const history = new Map<string, number[]>();
  const played = new Map<string, number>();
  const peak = new Map<string, number>();
  let currentSeason: number | null = null;

  const get = (id: string) => ratings.get(id) ?? ELO_BASE;

  for (const g of results) {
    if (g.season_year !== null && currentSeason !== null && g.season_year !== currentSeason) {
      // New season: regress everyone toward the mean.
      for (const [id, r] of ratings) ratings.set(id, ELO_BASE + (r - ELO_BASE) * p.seasonCarry);
    }
    if (g.season_year !== null) currentSeason = g.season_year;

    const h = get(g.home_team_espn_id);
    const a = get(g.away_team_espn_id);
    const expHome = expectedScore(h + p.homeAdvantage, a);
    const margin = Math.abs(g.home_score - g.away_score);
    const actualHome = g.home_score > g.away_score ? 1 : g.home_score < g.away_score ? 0 : 0.5;
    // Margin-of-victory multiplier, damped so blowouts don't swing ratings wildly.
    const mov = Math.log(1 + margin / p.marginScale) + 1;
    const delta = p.k * mov * (actualHome - expHome);

    ratings.set(g.home_team_espn_id, h + delta);
    ratings.set(g.away_team_espn_id, a - delta);
    for (const id of [g.home_team_espn_id, g.away_team_espn_id]) {
      const r = ratings.get(id)!;
      if (!history.has(id)) history.set(id, []);
      history.get(id)!.push(r);
      played.set(id, (played.get(id) ?? 0) + 1);
      peak.set(id, Math.max(peak.get(id) ?? 0, r));
    }
  }

  const rows: EloRow[] = [];
  for (const [id, r] of ratings) {
    const t = teams.get(id);
    if (!t) continue;
    const hist = history.get(id) ?? [];
    const before = hist.length > 5 ? hist[hist.length - 6] : ELO_BASE;
    rows.push({ team: t, rating: r, trend: r - before, played: played.get(id) ?? 0, peak: peak.get(id) ?? r });
  }
  rows.sort((a, b) => b.rating - a.rating);
  return { rows, ratings };
}

export interface FixtureDifficultyRow {
  team: TeamRef;
  opponents: { team: TeamRef; home: boolean; rating: number; date: string; espn_id: string }[];
  averageOpponentRating: number;
}

export interface PowerRankings {
  season: number | null;
  /** Only teams that played in the most recent season. */
  rows: EloRow[];
  hardestRuns: FixtureDifficultyRow[];
  easiestRuns: FixtureDifficultyRow[];
  lastUpdated: string | null;
}

export async function getPowerRankings(league: League, nextN = 5): Promise<PowerRankings> {
  const [results, teams, season] = await Promise.all([getAllResults(league), getTeamMap(league), getCurrentSeason(league)]);
  const { rows, ratings } = computeElo(league, results, teams);

  // Restrict the published ranking to clubs active in the latest season so relegated
  // or defunct sides from the archive don't linger in the list.
  const active = new Set<string>();
  for (const g of results) {
    if (g.season_year === season) {
      active.add(g.home_team_espn_id);
      active.add(g.away_team_espn_id);
    }
  }
  const activeRows = rows.filter((r) => active.has(r.team.espn_id));

  // Upcoming fixtures for the difficulty run. A postponed or cancelled game is not one to play.
  const { rows: upcoming } = await pool.query(
    `select espn_id, date, home_team_espn_id, away_team_espn_id from games
     where league = $1 and completed = false and date > now() and stage = 'regular'
       and coalesce(status_detail, '') !~* $2
     order by date asc`,
    [league, CALLED_OFF.source]
  );
  const perTeam = new Map<string, FixtureDifficultyRow>();
  for (const g of upcoming) {
    for (const [id, oppId, home] of [
      [g.home_team_espn_id, g.away_team_espn_id, true],
      [g.away_team_espn_id, g.home_team_espn_id, false],
    ] as [string, string, boolean][]) {
      if (!active.has(id)) continue;
      const t = teams.get(id);
      const opp = teams.get(oppId);
      if (!t || !opp) continue;
      if (!perTeam.has(id)) perTeam.set(id, { team: t, opponents: [], averageOpponentRating: 0 });
      const row = perTeam.get(id)!;
      if (row.opponents.length >= nextN) continue;
      row.opponents.push({ team: opp, home, rating: ratings.get(oppId) ?? ELO_BASE, date: g.date, espn_id: g.espn_id });
    }
  }
  // The scrapers only hold about a week of soccer fixtures at a time, so a "run" can
  // be a single game there; the NFL and NBA have their full schedules on file.
  const runs = [...perTeam.values()].filter((r) => r.opponents.length >= 1);
  for (const r of runs) r.averageOpponentRating = r.opponents.reduce((s, o) => s + o.rating, 0) / r.opponents.length;
  runs.sort((a, b) => b.averageOpponentRating - a.averageOpponentRating);

  return {
    season,
    rows: activeRows,
    hardestRuns: runs.slice(0, 5),
    easiestRuns: [...runs].reverse().slice(0, 5),
    lastUpdated: results.length ? results[results.length - 1].date : null,
  };
}

/* ------------------------------------------------------------------------ */
/* Head-to-head                                                              */
/* ------------------------------------------------------------------------ */

export interface HeadToHead {
  teamA: TeamRef;
  teamB: TeamRef;
  meetings: number;
  winsA: number;
  winsB: number;
  draws: number;
  goalsA: number;
  goalsB: number;
  /** Most recent first. */
  games: GameRow[];
  biggestWinA: GameRow | null;
  biggestWinB: GameRow | null;
  /** Current run: e.g. { team: 'A', kind: 'W', length: 3 } means A has won the last 3. */
  streak: { team: "A" | "B" | null; length: number } | null;
  upcoming: GameRow | null;
  firstSeason: number | null;
}

export async function getHeadToHead(league: League, slugA: string, slugB: string): Promise<HeadToHead | null> {
  const { rows: teamRows } = await pool.query(
    `select espn_id, name, slug, abbreviation, logo_url, color from teams where league = $1 and slug = any($2)`,
    [league, [slugA, slugB]]
  );
  const teamA = teamRows.find((t) => t.slug === slugA) as TeamRef | undefined;
  const teamB = teamRows.find((t) => t.slug === slugB) as TeamRef | undefined;
  if (!teamA || !teamB || teamA.espn_id === teamB.espn_id) return null;

  const { rows: games } = await pool.query<GameRow>(
    `select
       g.league, g.espn_id, g.date, g.name, g.short_name, g.home_score, g.away_score,
       g.home_score_display, g.away_score_display, g.home_winner, g.away_winner, g.season_year,
       g.status_state, g.status_detail, g.status_summary, g.round, g.stage, g.completed,
       g.home_team_espn_id, g.away_team_espn_id,
       ht.name as home_name, ht.slug as home_slug, ht.abbreviation as home_abbr, ht.logo_url as home_logo, ht.color as home_color,
       at.name as away_name, at.slug as away_slug, at.abbreviation as away_abbr, at.logo_url as away_logo, at.color as away_color
     from games g
     join teams ht on ht.league = g.league and ht.espn_id = g.home_team_espn_id
     join teams at on at.league = g.league and at.espn_id = g.away_team_espn_id
     where g.league = $1
       and ((g.home_team_espn_id = $2 and g.away_team_espn_id = $3) or (g.home_team_espn_id = $3 and g.away_team_espn_id = $2))
     order by g.date desc`,
    [league, teamA.espn_id, teamB.espn_id]
  );

  // Every completed meeting is listed; the tally (meetings, wins, goals, biggest wins, the current
  // run) leaves out games that say nothing about the rivalry (preseason, All-Star, the NBA Cup final)
  // and keeps playoffs and the play-in, as Elo does.
  const completed = games.filter((g) => g.completed && g.home_score != null && g.away_score != null);
  const counted = completed.filter((g) => g.stage !== "excluded");
  // The next meeting is the earliest game still to play. A postponed or cancelled game is not one:
  // ESPN keeps its original (past) event with a 0-0 score and the replay is a separate event.
  const upcoming = [...games].reverse().find((g) => !g.completed && !isCalledOff(g.status_detail)) ?? null;

  let winsA = 0;
  let winsB = 0;
  let draws = 0;
  let goalsA = 0;
  let goalsB = 0;
  let biggestWinA: GameRow | null = null;
  let biggestWinB: GameRow | null = null;
  let bestMarginA = 0;
  let bestMarginB = 0;

  function sideOf(g: GameRow, id: string) {
    const isHome = g.home_team_espn_id === id;
    return { gf: isHome ? g.home_score! : g.away_score!, ga: isHome ? g.away_score! : g.home_score! };
  }

  for (const g of counted) {
    const a = sideOf(g, teamA.espn_id);
    goalsA += a.gf;
    goalsB += a.ga;
    if (a.gf > a.ga) {
      winsA++;
      if (a.gf - a.ga > bestMarginA) {
        bestMarginA = a.gf - a.ga;
        biggestWinA = g;
      }
    } else if (a.gf < a.ga) {
      winsB++;
      if (a.ga - a.gf > bestMarginB) {
        bestMarginB = a.ga - a.gf;
        biggestWinB = g;
      }
    } else draws++;
  }

  let streak: HeadToHead["streak"] = null;
  if (counted.length > 0) {
    const first = sideOf(counted[0], teamA.espn_id);
    const kind: "A" | "B" | null = first.gf > first.ga ? "A" : first.gf < first.ga ? "B" : null;
    let length = 0;
    for (const g of counted) {
      const s = sideOf(g, teamA.espn_id);
      const k = s.gf > s.ga ? "A" : s.gf < s.ga ? "B" : null;
      if (k !== kind) break;
      length++;
    }
    streak = { team: kind, length };
  }

  const seasons = counted.map((g) => g.season_year).filter((s): s is number => s != null);

  return {
    teamA,
    teamB,
    meetings: counted.length,
    winsA,
    winsB,
    draws,
    goalsA,
    goalsB,
    games: completed,
    biggestWinA,
    biggestWinB,
    streak,
    upcoming,
    firstSeason: seasons.length ? Math.min(...seasons) : null,
  };
}

/* ------------------------------------------------------------------------ */
/* Team season-by-season history                                             */
/* ------------------------------------------------------------------------ */

export interface TeamSeasonRow {
  season: number;
  position: number;
  teamsInSeason: number;
  wins: number;
  losses: number;
  draws: number | null;
  points: number | null;
  goals_for: number | null;
  goals_against: number | null;
  win_percent: string | null;
  conference: string | null;
  /** True when the season's standings show games played (not a preseason placeholder). */
  played: boolean;
}

export async function getTeamHistory(league: League, teamEspnId: string): Promise<TeamSeasonRow[]> {
  const { rows } = await pool.query(
    `with ranked as (
       select season, team_espn_id, conference, wins, losses, draws, points, goals_for, goals_against, win_percent,
              rank() over (
                partition by season, grp
                order by points desc nulls last, (goals_for - goals_against) desc nulls last, goals_for desc nulls last,
                         net_run_rate desc nulls last, win_percent desc nulls last, wins desc, losses asc
              ) as position,
              count(*) over (partition by season, grp) as teams_in_season,
              sum(wins + losses + coalesce(draws, 0)) over (partition by season) as season_games
       from (
         -- A cup's group-stage seasons rank within the group (finishing 2nd in Group C),
         -- not across the whole competition; league seasons rank league-wide.
         select *, case when $1 in ('ucl', 'cwc', 't20wc', 'wcwc', 'wt20wc') then coalesce(conference, '') else '' end as grp from standings
       ) s where league = $1
     )
     select season, position::int, teams_in_season::int as "teamsInSeason", wins, losses, draws, points, goals_for, goals_against, win_percent, conference,
            (season_games > 0) as played
     from ranked where team_espn_id = $2 order by season asc`,
    [league, teamEspnId]
  );
  return rows;
}

/* ------------------------------------------------------------------------ */
/* Records                                                                   */
/* ------------------------------------------------------------------------ */

export interface RecordGame {
  espn_id: string;
  date: string;
  season_year: number | null;
  home: TeamRef;
  away: TeamRef;
  home_score: number;
  away_score: number;
  value: number;
}

export interface StreakRecord {
  team: TeamRef;
  length: number;
  start: string;
  end: string;
  season_year: number | null;
}

export interface LeagueRecords {
  seasonsCovered: [number, number] | null;
  gamesCovered: number;
  highestScoring: RecordGame[];
  biggestMargins: RecordGame[];
  highestTeamScore: RecordGame[];
  biggestAwayWins: RecordGame[];
  lowestScoring: RecordGame[];
  longestWinStreaks: StreakRecord[];
  longestUnbeaten: StreakRecord[];
  longestWinless: StreakRecord[];
}

export async function getLeagueRecords(league: League, limit = 10): Promise<LeagueRecords> {
  const [results, teams] = await Promise.all([getAllResults(league), getTeamMap(league)]);
  const known = results.filter((g) => teams.has(g.home_team_espn_id) && teams.has(g.away_team_espn_id));

  const toRecord = (g: ResultRow, value: number): RecordGame => ({
    espn_id: g.espn_id,
    date: g.date,
    season_year: g.season_year,
    home: teams.get(g.home_team_espn_id)!,
    away: teams.get(g.away_team_espn_id)!,
    home_score: g.home_score,
    away_score: g.away_score,
    value,
  });

  const top = (score: (g: ResultRow) => number, asc = false) =>
    [...known]
      .map((g) => toRecord(g, score(g)))
      .sort((a, b) => (asc ? a.value - b.value : b.value - a.value) || new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, limit);

  // Streaks: walk each team's results chronologically.
  const seqs = new Map<string, { date: string; season: number | null; r: "W" | "D" | "L" }[]>();
  for (const g of known) {
    const hr: "W" | "D" | "L" = g.home_score > g.away_score ? "W" : g.home_score < g.away_score ? "L" : "D";
    const ar: "W" | "D" | "L" = hr === "W" ? "L" : hr === "L" ? "W" : "D";
    for (const [id, r] of [
      [g.home_team_espn_id, hr],
      [g.away_team_espn_id, ar],
    ] as [string, "W" | "D" | "L"][]) {
      if (!seqs.has(id)) seqs.set(id, []);
      seqs.get(id)!.push({ date: g.date, season: g.season_year, r });
    }
  }
  function streaks(pred: (r: "W" | "D" | "L") => boolean): StreakRecord[] {
    const out: StreakRecord[] = [];
    for (const [id, list] of seqs) {
      const team = teams.get(id)!;
      let run: typeof list = [];
      const flush = () => {
        if (run.length >= 3) out.push({ team, length: run.length, start: run[0].date, end: run[run.length - 1].date, season_year: run[run.length - 1].season });
        run = [];
      };
      for (const g of list) {
        if (pred(g.r)) run.push(g);
        else flush();
      }
      flush();
    }
    return out.sort((a, b) => b.length - a.length || new Date(b.end).getTime() - new Date(a.end).getTime()).slice(0, limit);
  }

  const seasons = known.map((g) => g.season_year).filter((s): s is number => s != null);

  return {
    seasonsCovered: seasons.length ? [Math.min(...seasons), Math.max(...seasons)] : null,
    gamesCovered: known.length,
    highestScoring: top((g) => g.home_score + g.away_score),
    biggestMargins: top((g) => Math.abs(g.home_score - g.away_score)),
    highestTeamScore: top((g) => Math.max(g.home_score, g.away_score)),
    biggestAwayWins: [...known]
      .filter((g) => g.away_score > g.home_score)
      .map((g) => toRecord(g, g.away_score - g.home_score))
      .sort((a, b) => b.value - a.value || new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, limit),
    lowestScoring: top((g) => g.home_score + g.away_score, true),
    longestWinStreaks: streaks((r) => r === "W"),
    longestUnbeaten: streaks((r) => r !== "L"),
    longestWinless: streaks((r) => r !== "W"),
  };
}

/* ------------------------------------------------------------------------ */
/* League-wide injuries                                                      */
/* ------------------------------------------------------------------------ */

export interface LeagueInjuryRow {
  player_espn_id: string;
  player_name: string;
  player_slug: string | null;
  position: string | null;
  status: string;
  short_comment: string | null;
  reported_date: string | null;
  team: TeamRef;
}

export async function getLeagueInjuries(league: League): Promise<LeagueInjuryRow[]> {
  const { rows } = await pool.query(
    `select i.player_espn_id, i.player_name, p.slug as player_slug, p.position, i.status, i.short_comment, i.reported_date,
            json_build_object('espn_id', t.espn_id, 'name', t.name, 'slug', t.slug, 'abbreviation', t.abbreviation,
                              'logo_url', t.logo_url, 'color', t.color) as team
     from injuries i
     join teams t on t.league = i.league and t.espn_id = i.team_espn_id
     left join players p on p.league = i.league and p.espn_id = i.player_espn_id
     where i.league = $1 and lower(i.status) <> 'active'
     order by t.name, i.reported_date desc nulls last, i.player_name`,
    [league]
  );
  return rows;
}
