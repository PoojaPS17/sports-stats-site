import {
  isCricketLeague,
  isCupCompetition,
  LEADER_CATEGORIES,
  CRICKET_LEADER_CATEGORIES,
  getLeaderBoard,
  getLeadersSeason,
  getCricketLeaders,
  getCricketLeadersSeason,
  type League,
  type LeaderRow,
} from "@/lib/queries";

export interface LeaderBoardView {
  label: string;
  unit: string;
  rows: LeaderRow[];
  /** Players tied at the cutoff that the row cap left off (never any on cricket boards). */
  omitted?: number;
}

/**
 * The boards the leaders page shows for a league, the season they are for and the line of method under the title.
 * The page and its share image read the same boards here, so the picture never disagrees with the page it came from.
 */
export async function loadLeaders(league: League): Promise<{ boards: LeaderBoardView[]; season: number | null; note: string | null }> {
  let boards: LeaderBoardView[];
  let season: number | null;
  let note: string | null = null;

  if (isCricketLeague(league)) {
    season = await getCricketLeadersSeason(league);
    boards = season
      ? await Promise.all(CRICKET_LEADER_CATEGORIES.map(async (c) => ({ label: c.label, unit: c.unit, rows: await getCricketLeaders(league, c.key, season!, 10) })))
      : [];
    note = "Summed from the scorecards of the season's completed matches; a match joins the totals once its scorecard is stored.";
  } else {
    const categories = LEADER_CATEGORIES[league];
    // Season and boards are read together; a board lists everyone tied with 10th place (see leaderQueries.ts).
    const [lists, s] = await Promise.all([Promise.all(categories.map((c) => getLeaderBoard(league, c.column, { limit: 10, ties: true }))), getLeadersSeason(league)]);
    season = s;
    boards = categories.map((c, i) => ({ label: c.label, unit: c.unit, rows: lists[i].rows, omitted: lists[i].omitted }));
    if (isCupCompetition(league)) note = "Summed from the box score of every match on record for the season, knockout rounds included.";
    if (league === "nba") note = "Per-game averages, for players who have appeared in at least 70% of the games played so far (the NBA's qualifying rule).";
    if (league === "mlb")
      note = "ESPN's season figures. The batting average board needs 70% of the games played so far, and the ERA board 60% of the innings pitched, so a short season cannot top either; the ERA board reads lowest first.";
  }
  return { boards, season, note };
}
