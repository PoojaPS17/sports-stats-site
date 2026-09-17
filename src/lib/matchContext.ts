// Pre-match and post-match context for a single game, computed from the results
// already stored: Elo ratings going in and the win probability they imply, each
// side's form, and where the game left both teams (table position for football,
// win-loss record for the NFL and NBA). Nothing here needs the feed.
import { pool } from "./db";
import { computeElo, computeTable, getTeamMap, isSoccer, type ResultRow } from "./analytics";
import { matchProbabilities } from "./simulator";
import { buildMatchweeks, getSeasonGames, supportsMatchweeks, weekPath } from "./matchweeks";
import { isCricketLeague, isCupCompetition, UCL_LEAGUE_PHASE_FROM, type GameRow, type League } from "./queries";

export type FormResult = "W" | "D" | "L";

export interface SideContext {
  elo: number | null;
  eloAfter: number | null;
  form: FormResult[];
  position: { before: number | null; after: number | null } | null;
  record: { before: string; after: string | null } | null;
}

export interface MatchContext {
  home: SideContext;
  away: SideContext;
  probabilities: { homeWin: number; draw: number; awayWin: number } | null;
  /** Teams in the table the positions refer to. */
  tableSize: number | null;
  week: { label: string; href: string } | null;
  /** The other games of that round, for "more from this matchweek". */
  weekGames: GameRow[];
}

function sideForm(results: ResultRow[], teamId: string, n = 5): FormResult[] {
  const out: FormResult[] = [];
  for (let i = results.length - 1; i >= 0 && out.length < n; i--) {
    const g = results[i];
    if (g.home_team_espn_id !== teamId && g.away_team_espn_id !== teamId) continue;
    const gf = g.home_team_espn_id === teamId ? g.home_score : g.away_score;
    const ga = g.home_team_espn_id === teamId ? g.away_score : g.home_score;
    out.push(gf > ga ? "W" : gf < ga ? "L" : "D");
  }
  return out;
}

function record(results: ResultRow[], teamId: string): string {
  let w = 0;
  let l = 0;
  let t = 0;
  for (const g of results) {
    if (g.home_team_espn_id !== teamId && g.away_team_espn_id !== teamId) continue;
    const gf = g.home_team_espn_id === teamId ? g.home_score : g.away_score;
    const ga = g.home_team_espn_id === teamId ? g.away_score : g.home_score;
    if (gf > ga) w++;
    else if (gf < ga) l++;
    else t++;
  }
  return t > 0 ? `${w}-${l}-${t}` : `${w}-${l}`;
}

export async function getMatchContext(league: League, game: GameRow): Promise<MatchContext | null> {
  if (isCricketLeague(league)) return null;
  const [{ rows: upTo }, teams] = await Promise.all([
    pool.query<ResultRow>(
      `select espn_id, date, season_year, round, home_team_espn_id, away_team_espn_id, home_score, away_score
       from games
       where league = $1 and completed = true and home_score is not null and away_score is not null and date <= $2
       order by date asc`,
      [league, game.date]
    ),
    getTeamMap(league),
  ]);
  const before = upTo.filter((g) => g.espn_id !== game.espn_id);
  const played = game.completed && game.home_score != null && game.away_score != null;
  const thisGame: ResultRow | null = played
    ? { espn_id: game.espn_id, date: game.date, season_year: game.season_year, round: game.round, home_team_espn_id: game.home_team_espn_id, away_team_espn_id: game.away_team_espn_id, home_score: game.home_score!, away_score: game.away_score! }
    : null;
  const after = thisGame ? [...before, thisGame] : null;

  const eloBefore = computeElo(league, before, teams).ratings;
  const eloAfter = after ? computeElo(league, after, teams).ratings : null;
  const hasHistory = (id: string) => before.some((g) => g.home_team_espn_id === id || g.away_team_espn_id === id);
  const h = game.home_team_espn_id;
  const a = game.away_team_espn_id;
  const probabilities = hasHistory(h) && hasHistory(a) ? matchProbabilities(league, eloBefore.get(h)!, eloBefore.get(a)!) : null;

  // Regular-season games only: playoff rounds and cup knockouts sit outside the table.
  const inTable = game.round == null && game.season_year != null && (!isCupCompetition(league) || game.season_year >= UCL_LEAGUE_PHASE_FROM);
  const seasonBefore = inTable ? before.filter((g) => g.season_year === game.season_year && g.round == null) : [];
  const seasonAfter = inTable && thisGame ? [...seasonBefore, thisGame] : null;
  let tableSize: number | null = null;
  const position = (id: string) => {
    if (!inTable || !isSoccer(league)) return null;
    const pos = (results: ResultRow[]) => {
      const table = computeTable(league, results, teams, "overall");
      tableSize = Math.max(tableSize ?? 0, table.length);
      const i = table.findIndex((r) => r.team.espn_id === id);
      return i >= 0 ? i + 1 : null;
    };
    return { before: pos(seasonBefore), after: seasonAfter ? pos(seasonAfter) : null };
  };
  const rec = (id: string) => (inTable && !isSoccer(league) ? { before: record(seasonBefore, id), after: seasonAfter ? record(seasonAfter, id) : null } : null);

  const side = (id: string): SideContext => ({
    elo: hasHistory(id) ? Math.round(eloBefore.get(id)!) : null,
    eloAfter: eloAfter && hasHistory(id) ? Math.round(eloAfter.get(id)!) : null,
    form: sideForm(before, id),
    position: position(id),
    record: rec(id),
  });

  let week: MatchContext["week"] = null;
  let weekGames: GameRow[] = [];
  if (supportsMatchweeks(league) && game.season_year != null) {
    const weeks = buildMatchweeks(league, await getSeasonGames(league, game.season_year));
    const w = weeks.find((x) => x.games.some((g) => g.espn_id === game.espn_id));
    if (w) {
      week = { label: w.label, href: weekPath(league, w.index, game.season_year) };
      weekGames = w.games.filter((g) => g.espn_id !== game.espn_id);
    }
  }

  return { home: side(h), away: side(a), probabilities, tableSize, week, weekGames };
}
