// Turns the stored figures behind "Today in three lines" into candidate facts (see threeLines.ts for the
// rules that choose among them). Pure: the database reads are in threeLinesData.ts.
//
// Every sentence is built from a claim the site already prints on the page it links to: a team's streak is the
// line in its page header (heroClaims.ts teamClaims), a hundred or a five-wicket innings is a row of the
// match's scorecard. A claim this file does not recognise is dropped, never reworded by guesswork.
import { leagueNameWithArticle, type League } from "./leagues";
import { factWeight, sportOf, type LineFact } from "./threeLines";
import { teamDisplayName } from "./teamName";

/**
 * What a team's stored games for the season amount to, which decides how a whole-season claim ("won all 4") may
 * be worded. "season": the list holds regular-season games, so the claim is about the season so far. "playoffs":
 * it holds only postseason games (the site stores MLB's October games and not its 162), so "all 3" is about the
 * playoffs and must say so. "unknown": no way to tell what the list covers, so a whole-season claim is left out.
 * A run ("5 straight wins") is true whatever the list covers and needs no scope.
 */
export type GameScope = "season" | "playoffs" | "unknown";

export function gameScope(games: { stage?: string | null }[]): GameScope {
  const counted = games.filter((g) => g.stage !== "excluded");
  if (counted.some((g) => g.stage === "regular")) return "season";
  if (counted.length > 0 && counted.every((g) => g.stage === "playoffs" || g.stage === "playin")) return "playoffs";
  return "unknown";
}

/** A team's header claims turned into lines. `lastPlayed` is when the run's latest result was played. */
export function teamStreakFacts(args: { league: League; teamEspnId: string; teamName: string; teamSlug: string; claims: string[]; lastPlayed: Date | null; scope: GameScope }): LineFact[] {
  const { league, teamEspnId, claims, lastPlayed, scope } = args;
  if (!lastPlayed) return [];
  const name = teamDisplayName(args.teamName);
  const where = leagueNameWithArticle(league);
  const href = `/${league}/teams/${args.teamSlug}`;
  const base = { sport: sportOf(league), league, href, at: lastPlayed.toISOString() };
  const id = (kind: string) => `team:${league}:${teamEspnId}:${kind}`;
  const out: LineFact[] = [];
  for (const claim of claims) {
    let m: RegExpMatchArray | null;
    if ((m = claim.match(/^Won all (\d+) games this season$/))) {
      if (scope === "unknown") continue;
      const n = Number(m[1]);
      out.push({ ...base, id: id("season-perfect"), kind: "season-perfect", figure: `all ${n}`, text: `${name} have won all ${n} of their ${scope === "playoffs" ? "playoff games" : "games"} in ${where}${scope === "playoffs" ? "" : " this season"}.`, weight: factWeight("season-perfect", n) });
    } else if ((m = claim.match(/^(\d+) straight wins$/))) {
      const n = Number(m[1]);
      out.push({ ...base, id: id("win-streak"), kind: "win-streak", figure: `${n} games in a row`, text: `${name} have won ${n} games in a row in ${where}.`, weight: factWeight("win-streak", n) });
    } else if ((m = claim.match(/^Unbeaten in (\d+) games this season$/))) {
      if (scope === "unknown") continue;
      const n = Number(m[1]);
      out.push({ ...base, id: id("unbeaten"), kind: "unbeaten", figure: `all ${n}`, text: `${name} are unbeaten in all ${n} of their ${scope === "playoffs" ? "playoff games" : "games"} in ${where}${scope === "playoffs" ? "" : " this season"}.`, weight: factWeight("unbeaten", n) });
    } else if ((m = claim.match(/^Unbeaten in (\d+)$/))) {
      const n = Number(m[1]);
      out.push({ ...base, id: id("unbeaten"), kind: "unbeaten", figure: `unbeaten in ${n}`, text: `${name} are unbeaten in ${n} games in ${where}.`, weight: factWeight("unbeaten", n) });
    }
  }
  return out;
}

/** One innings by one player, as read from a stored scorecard row. Null where the scorecard did not record it. */
export interface CricketInningsRow {
  /** Where the scorecard lives: a league key for the archived competitions, "cricket" for a series match. */
  league: string;
  matchId: string;
  /** Distinguishes two innings of one player in one match (a Test). */
  inningsNo: number;
  playerId: string;
  playerName: string;
  teamName: string;
  opponentName: string;
  runs: number | null;
  ballsFaced: number | null;
  notOut: boolean;
  wickets: number | null;
  conceded: number | null;
  /** When the match ended (a one-day match: when it started). */
  at: Date;
}

export const HUNDRED = 100;
export const FIVE_FOR = 5;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function cricketFacts(rows: CricketInningsRow[]): LineFact[] {
  const out: LineFact[] = [];
  for (const r of rows) {
    const href = r.league === "cricket" ? `/cricket/matches/${r.matchId}` : `/${r.league}/games/${r.matchId}`;
    const base = { sport: "cricket", league: r.league, href, at: r.at.toISOString() };
    const who = `${r.playerName}`;
    const side = `${teamDisplayName(r.teamName)} against ${teamDisplayName(r.opponentName)}`;
    if (r.runs !== null && r.runs >= HUNDRED) {
      const figure = `${r.runs}${r.notOut ? "*" : ""}`;
      const off = r.ballsFaced !== null && r.ballsFaced > 0 ? ` off ${plural(r.ballsFaced, "ball")}` : "";
      out.push({ ...base, id: `cricket:bat:${r.matchId}:${r.playerId}:${r.inningsNo}`, kind: "hundred", figure, text: `${who} made ${figure}${off} for ${side}.`, weight: factWeight("hundred", r.runs) });
    }
    if (r.wickets !== null && r.conceded !== null && r.wickets >= FIVE_FOR) {
      const figure = `${r.wickets}/${r.conceded}`;
      out.push({ ...base, id: `cricket:bowl:${r.matchId}:${r.playerId}:${r.inningsNo}`, kind: "five-for", figure, text: `${who} took ${figure} for ${side}.`, weight: factWeight("five-for", r.wickets) });
    }
  }
  return out;
}
