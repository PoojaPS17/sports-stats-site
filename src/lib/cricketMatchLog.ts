// The per-match line of a cricketer's page: what he scored and took in each match, newest first. One match can hold
// several innings (a Test has two a side), so a row carries them all and the cells join them with " & ".

export interface CricketMatchLogInnings {
  runs: number | null;
  notOut: boolean | null;
  wickets: number | null;
  conceded: number | null;
  overs: number | null;
}

export interface CricketMatchLogRow {
  game_espn_id: string;
  date: string;
  local_date: string | null;
  opponent: string | null;
  /** The match result as the games row stores it ("India won by 5 wickets"). */
  result: string | null;
  innings: CricketMatchLogInnings[];
}

/** Overs as the scorecard writes them: "4" for four full overs, "3.2" for three and two balls. */
function overText(overs: number): string {
  return Number.isInteger(overs) ? String(overs) : overs.toFixed(1);
}

/**
 * The batting and bowling cells of one match. Batting reads "45", "45*" for not out, "12 & 87*" over two innings; bowling
 * reads wickets/runs ("2/28"), or "3/50 & 2/40". A match he only batted in has no bowling ("—"), and one he only fielded in
 * has neither: the player was in the side, which is still a match played.
 */
export function cricketMatchLogCells(innings: CricketMatchLogInnings[]): { batting: string; bowling: string } {
  const batting = innings.filter((i) => i.runs !== null).map((i) => `${i.runs}${i.notOut ? "*" : ""}`);
  const bowling = innings.filter((i) => i.wickets !== null && i.conceded !== null).map((i) => `${i.wickets}/${i.conceded}`);
  return { batting: batting.length > 0 ? batting.join(" & ") : "—", bowling: bowling.length > 0 ? bowling.join(" & ") : "—" };
}

/** The overs bowled, for a tooltip on the bowling cell ("4 ov & 3.2 ov"); empty when none were recorded. */
export function cricketMatchLogOvers(innings: CricketMatchLogInnings[]): string {
  return innings
    .filter((i) => i.overs !== null && i.wickets !== null)
    .map((i) => `${overText(i.overs as number)} ov`)
    .join(" & ");
}

/** Folds the query's one-row-per-innings result into one row per match, keeping the query's newest-first order. */
export function groupMatchLog(rows: (Omit<CricketMatchLogRow, "innings"> & CricketMatchLogInnings)[]): CricketMatchLogRow[] {
  const out: CricketMatchLogRow[] = [];
  const byGame = new Map<string, CricketMatchLogRow>();
  for (const r of rows) {
    let match = byGame.get(r.game_espn_id);
    if (!match) {
      match = { game_espn_id: r.game_espn_id, date: r.date, local_date: r.local_date, opponent: r.opponent, result: r.result, innings: [] };
      byGame.set(r.game_espn_id, match);
      out.push(match);
    }
    if (r.runs !== null || r.wickets !== null) match.innings.push({ runs: r.runs, notOut: r.notOut, wickets: r.wickets, conceded: r.conceded, overs: r.overs });
  }
  return out;
}
