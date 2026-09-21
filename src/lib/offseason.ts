import {
  getMostRecentPlayedSeason,
  getSeasonPlayoffGames,
  getSeasonLastResults,
  getStandingsBySeason,
  getLeaders,
  getCricketLeaders,
  LEADER_CATEGORIES,
  CRICKET_LEADER_CATEGORIES,
  isCricketLeague,
  isSoccerLeague,
  isCupCompetition,
  formatSeasonLabel,
  type League,
  type GameRow,
  type StandingRow,
  type LeaderRow,
} from "./queries";
import { summarizePlayoffs, type PlayoffResult } from "./seasonSummary";
import { tableComplete } from "./standingsOrder";
import { pool } from "./db";
import { isGameCalledOff } from "./gameStatus";

// What a league hub shows while nothing is scheduled: the season just played, in
// three glances — how it ended (the final or the last round), the final table, and
// the season's leading players. Everything is pinned to that season, so the empty
// rows the feed creates for the upcoming one never leak in.
export interface OffseasonRecap {
  season: number;
  seasonLabel: string;
  /**
   * False while the season still has fixtures to play: the league page then says when the next matchday is instead of
   * "season ended". See seasonIsOver.
   */
  seasonOver: boolean;
  /** Kickoff of the season's next fixture; set exactly when the season is not over. */
  nextFixtureOn: string | null;
  /** Date of the season's last completed game. */
  endedOn: string | null;
  champion: { name: string; slug: string } | null;
  /** The closing games, most recent first: the final and the rounds before it, or the last matchday. */
  closingGames: GameRow[];
  playoffs: PlayoffResult[];
  /** Top of the final table, for competitions decided by a single table. */
  table: StandingRow[];
  tableSize: number;
  leaders: { label: string; unit: string; rows: LeaderRow[] }[];
}

/**
 * A season is over when a cup competition's final has been played, when a domestic league's table is complete, or
 * when nothing is left to play: no fixture in the database for that season that is unfinished, in the future and not
 * called off. Anything else is a season between matchdays (the Champions League between its league-phase rounds),
 * which must not be announced as ended.
 */
export function seasonIsOver(s: { cup: boolean; finalPlayed: boolean; domesticTableComplete: boolean; hasFutureFixture: boolean }): boolean {
  return (s.cup && s.finalPlayed) || s.domesticTableComplete || !s.hasFutureFixture;
}

/**
 * Kickoff of the earliest fixture of a season still to be played: unfinished, in the future and not called off. "Called
 * off" is the site's one definition (isGameCalledOff, on the stored status), applied here rather than restated in SQL,
 * so a game the cards and pills show as postponed never keeps the hub saying the season is in progress.
 */
async function getNextFixtureDate(league: League, season: number): Promise<string | null> {
  const { rows } = await pool.query(
    `select date, completed, status_state, status_detail from games
     where league = $1 and season_year = $2 and completed = false and date > now()
     order by date asc`,
    [league, season]
  );
  const next = rows.find((g) => !isGameCalledOff(g));
  return next ? new Date(next.date).toISOString() : null;
}

export async function getOffseasonRecap(league: League): Promise<OffseasonRecap | null> {
  const season = await getMostRecentPlayedSeason(league);
  if (season === null) return null;

  const cricket = isCricketLeague(league);
  const leaderCategories = cricket ? CRICKET_LEADER_CATEGORIES.map((c) => ({ label: c.label, unit: c.unit, key: c.key })) : LEADER_CATEGORIES[league].slice(0, 3);
  const [nextFixture, playoffGames, lastResults, standings, leaderBoards] = await Promise.all([
    getNextFixtureDate(league, season),
    getSeasonPlayoffGames(league, season),
    getSeasonLastResults(league, season, 6),
    getStandingsBySeason(league, season),
    Promise.all(
      leaderCategories.map(async (c) => ({
        label: c.label,
        unit: c.unit,
        rows: "key" in c ? await getCricketLeaders(league, c.key, season, 3) : await getLeaders(league, c.column, 3, season),
      }))
    ),
  ]);

  const playoffs = summarizePlayoffs(playoffGames);
  const closingGames = (playoffGames.length > 0 ? [...playoffGames].reverse() : lastResults).slice(0, 3);

  // Playoff competitions crown the winner of the last knockout result; a league
  // season's champion is the top of a finished table.
  const decider = [...playoffs].reverse().find((r) => /final/i.test(r.round) && !/semi|quarter/i.test(r.round));
  const domesticTableComplete = isSoccerLeague(league) && !isCupCompetition(league) && tableComplete(standings);
  const seasonOver = seasonIsOver({ cup: isCupCompetition(league), finalPlayed: decider !== undefined, domesticTableComplete, hasFutureFixture: nextFixture !== null });
  let champion: OffseasonRecap["champion"] = null;
  if (seasonOver) {
    const closing = decider ?? playoffs[playoffs.length - 1];
    if (closing) champion = { name: closing.winnerName, slug: closing.winnerSlug };
    else if (domesticTableComplete) champion = { name: standings[0].name, slug: standings[0].slug };
  }

  // Group-stage competitions (World Cups, the old Champions League groups) have no
  // single table worth previewing; leagues and the IPL/BBL do.
  const singleTable = new Set(standings.map((r) => r.conference ?? "")).size <= 1;
  const table = singleTable && !isCupCompetition(league) && (isSoccerLeague(league) || cricket) ? standings.slice(0, 5) : [];

  return {
    season,
    seasonLabel: formatSeasonLabel(league, season) ?? String(season),
    seasonOver,
    nextFixtureOn: seasonOver ? null : nextFixture,
    endedOn: lastResults[0]?.date ?? null,
    champion,
    closingGames,
    playoffs,
    table,
    tableSize: standings.length,
    leaders: leaderBoards.filter((b) => b.rows.length > 0 && b.rows[0].value > 0),
  };
}
