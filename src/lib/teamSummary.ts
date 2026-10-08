import { isCalledOff } from "./gameStatus";
import { cricketResult } from "./h2hOutcome";
import { isCricketLeague, isFirstClassCricket } from "./leagues";
import type { GameRow } from "./queries";

export type ResultLetter = "W" | "L" | "D";

export interface TeamSeasonSummary {
  wins: number;
  losses: number;
  draws: number;
  /** Most recent result first, at most five. */
  form: ResultLetter[];
  nextGame: GameRow | null;
}

/** "7-9-1", or "7-9" when there are no ties: the way American leagues write a record. */
export function formatWinLossTie(wins: number, losses: number, ties: number | null | undefined): string {
  return `${wins}-${losses}${ties ? `-${ties}` : ""}`;
}

function resultFor(game: GameRow, teamEspnId: string): ResultLetter | null {
  if (!game.completed) return null;
  const isHome = game.home_team_espn_id === teamEspnId;
  // Cricket: the stored winner flags are missing on thousands of finished internationals, and the runs are only a
  // first innings (a Test) or a total that a rain-shortened chase (DLS) can reverse. The result line ESPN stored
  // names the winner, so it decides first (the same reading as the head-to-head pages, h2hOutcome.ts).
  if (isCricketLeague(game.league)) {
    const r = cricketResult(game);
    if (r === "home" || r === "away") return (r === "home") === isHome ? "W" : "L";
    if (r === "draw" || r === "tie") return "D";
    if (r === "noResult") return null;
    // "unknown": the line names no team and the flags are empty. A Test's runs say nothing about who won it.
    if (isFirstClassCricket(game.league)) return null;
  }
  const won = isHome ? game.home_winner : game.away_winner;
  const lost = isHome ? game.away_winner : game.home_winner;
  if (won === true) return "W";
  if (lost === true) return "L";
  // A washed-out or abandoned match is not a result at all, and a tie is not a
  // win for whoever scored more in a rain-shortened chase.
  if (/no result|abandon|cancel|postpon/i.test(game.status_summary ?? game.status_detail ?? "")) return null;
  if (won === false && lost === false) return "D";
  const mine = isHome ? game.home_score : game.away_score;
  const theirs = isHome ? game.away_score : game.home_score;
  if (mine == null || theirs == null) return null;
  if (mine > theirs) return "W";
  if (mine < theirs) return "L";
  return "D";
}

/** Every result in the season list, most recent first (the list is newest first): games that do not count and games with no result are left out, as for recent form. */
export function seasonResults(games: GameRow[], teamEspnId: string): ResultLetter[] {
  const out: ResultLetter[] = [];
  for (const g of games) {
    if (g.stage === "excluded") continue;
    const r = resultFor(g, teamEspnId);
    if (r) out.push(r);
  }
  return out;
}

/** When the team's latest counted result was played, or null when it has none. */
export function lastResultDate(games: GameRow[], teamEspnId: string): Date | null {
  for (const g of games) {
    if (g.stage === "excluded") continue;
    if (resultFor(g, teamEspnId)) return new Date(g.date);
  }
  return null;
}

// The record is the regular season's. Only the NBA and NFL split a season into stages (playoffs,
// play-in, preseason and other games that do not count), so those are what is left out; every
// other league's games count as they always have, round labels or not (a cricket "Match 5" or
// "Final", a cup knockout is a game the team played).
function countsTowardRecord(g: GameRow): boolean {
  return g.stage !== "playoffs" && g.stage !== "playin" && g.stage !== "excluded";
}

// Record, recent form and next fixture derived from a team's season game list
// (which getTeamGamesBySeason returns newest first). The next fixture comes from every game,
// since the schedule lists them all. The record counts regular-season games only; recent form is a
// trajectory, so it also takes playoff and play-in results and skips only games that do not count.
export function summarizeTeamSeason(games: GameRow[], teamEspnId: string): TeamSeasonSummary {
  let wins = 0;
  let losses = 0;
  let draws = 0;
  const form: ResultLetter[] = [];
  for (const g of games) {
    if (g.stage === "excluded") continue;
    const r = resultFor(g, teamEspnId);
    if (!r) continue;
    if (countsTowardRecord(g)) {
      if (r === "W") wins++;
      else if (r === "L") losses++;
      else draws++;
    }
    if (form.length < 5) form.push(r);
  }
  // A postponed or cancelled game keeps its original event (0-0, not completed); it is not the next fixture.
  const upcoming = games.filter((g) => !g.completed && g.status_state !== "in" && !isCalledOff(g.status_detail));
  const nextGame = upcoming.length > 0 ? upcoming.reduce((a, b) => (new Date(a.date) < new Date(b.date) ? a : b)) : null;
  return { wins, losses, draws, form, nextGame };
}
