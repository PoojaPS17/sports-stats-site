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

function resultFor(game: GameRow, teamEspnId: string): ResultLetter | null {
  if (!game.completed) return null;
  const isHome = game.home_team_espn_id === teamEspnId;
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

// The record and form are the regular season's. Only the NBA and NFL split a season into stages
// (playoffs, play-in, preseason and other games that do not count), so those are what is left out;
// every other league's games count as they always have, round labels or not (a cricket "Match 5"
// or "Final", a cup knockout is a game the team played).
function countsTowardRecord(g: GameRow): boolean {
  return g.stage !== "playoffs" && g.stage !== "playin" && g.stage !== "excluded";
}

// Record, recent form and next fixture derived from a team's season game list
// (which getTeamGamesBySeason returns newest first). The next fixture comes from every game,
// since the schedule lists them all; the record and form count regular-season games only.
export function summarizeTeamSeason(games: GameRow[], teamEspnId: string): TeamSeasonSummary {
  let wins = 0;
  let losses = 0;
  let draws = 0;
  const form: ResultLetter[] = [];
  for (const g of games) {
    if (!countsTowardRecord(g)) continue;
    const r = resultFor(g, teamEspnId);
    if (!r) continue;
    if (r === "W") wins++;
    else if (r === "L") losses++;
    else draws++;
    if (form.length < 5) form.push(r);
  }
  const upcoming = games.filter((g) => !g.completed && g.status_state !== "in");
  const nextGame = upcoming.length > 0 ? upcoming.reduce((a, b) => (new Date(a.date) < new Date(b.date) ? a : b)) : null;
  return { wins, losses, draws, form, nextGame };
}
