// Who won a meeting between two teams, and the tally of a pair's meetings.
//
// Most leagues decide a meeting from the score: more goals or points wins, level is a draw (a tie in the NFL).
// That is wrong for cricket, where the stored home_score and away_score are only a side's FIRST innings (a Test)
// or the innings total of a match that Duckworth-Lewis-Stern, a tie or a super over can decide the other way.
// A Test that ends level on first innings, or one the side with fewer first-innings runs wins, is not a draw or a
// win for the higher score. So for cricket the result comes from what ESPN stored as the result, in this order:
//   1. the match's own result line (status_summary): "<team> won by ..." matched to the two teams conservatively,
//      then "Match drawn", "Match tied", "No result";
//   2. otherwise the winner flags (home_winner / away_winner), when exactly one side is flagged;
//   3. otherwise the meeting has no determinable result and is counted as "unknown", never guessed.
import { isCricketLeague, type League } from "./leagues";

/** One meeting seen from the first team's side. "unknown": no flag and no result line that names a team. */
export type MeetingResult = "A" | "B" | "draw" | "tie" | "noResult" | "unknown";

export interface OutcomeGame {
  home_team_espn_id: string;
  away_team_espn_id: string;
  home_score: number | null;
  away_score: number | null;
  home_winner: boolean | null;
  away_winner: boolean | null;
  status_summary: string | null;
  home_name: string;
  home_abbr: string | null;
  away_name: string;
  away_abbr: string | null;
}

type Side = "home" | "away";
type Raw = Side | "draw" | "tie" | "noResult" | "unknown";

/** A team's name as it appears in a result line, folded to letters and digits: "P.N.G." and "PNG" meet, "AUS Women" is "aus". */
function fold(s: string): string {
  return s
    .toLowerCase()
    .replace(/\(w\)|\bwomen\b|\bwmn\b|-w\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** True when the result line's team text is this team: equal to its name or abbreviation, or (3+ letters) a prefix of its name ("Cayman" of Cayman Islands, "GRE" of Greece). */
function namesTeam(pref: string, name: string, abbr: string | null): boolean {
  const p = fold(pref).replace(/ /g, "");
  if (!p) return false;
  const n = fold(name).replace(/ /g, "");
  const a = abbr ? fold(abbr).replace(/ /g, "") : "";
  if (p === n || (a && p === a)) return true;
  return p.length >= 3 && n.startsWith(p);
}

/** The side a cricket result line says won, or null when it names neither team or both. Never guesses. */
export function winnerFromSummary(g: Pick<OutcomeGame, "status_summary" | "home_name" | "home_abbr" | "away_name" | "away_abbr">): Side | null {
  const m = /^(.+?) won (?:by|\()/i.exec(g.status_summary ?? "");
  if (!m) return null;
  const home = namesTeam(m[1], g.home_name, g.home_abbr);
  const away = namesTeam(m[1], g.away_name, g.away_abbr);
  return home && !away ? "home" : away && !home ? "away" : null;
}

/**
 * The result of a cricket match as the data states it: a side, a draw (Tests), a tie, no result, or unknown.
 * The result line names the winner and comes first, because the stored winner flags are worked out from the
 * scores and are wrong when Duckworth-Lewis-Stern decides the match for the side with fewer runs ("NL Women won
 * by 21 runs (DLS)" is flagged to the other side). The flags are the fallback when the line does not name a
 * team (franchise short names such as "Stars" or "Kings XI"). The line's draw, tie and no-result wording is read
 * before the flags, which say nothing for those matches.
 */
export function cricketResult(g: OutcomeGame): Raw {
  const named = winnerFromSummary(g);
  if (named) return named;
  const s = g.status_summary ?? "";
  // "Match tied (Bahrain won the one-over eliminator)" is a tie whoever won the super over; winnerFromSummary
  // reads only "won by" and "won (", so it has not claimed it above.
  if (/\btied\b/i.test(s)) return "tie";
  if (/\bdrawn?\b/i.test(s)) return "draw";
  if (/\bno result\b|\babandoned\b|\bcancell?ed\b|\bwithout a ball\b|\bcalled off\b/i.test(s)) return "noResult";
  const hw = g.home_winner === true;
  const aw = g.away_winner === true;
  if (hw && !aw) return "home";
  if (aw && !hw) return "away";
  return "unknown";
}

/** Who won this meeting, from the first team's side (`teamAId` is that team's ESPN id). */
export function meetingResult(league: League, g: OutcomeGame, teamAId: string): MeetingResult {
  if (g.home_score == null || g.away_score == null) return "unknown";
  const aIsHome = g.home_team_espn_id === teamAId;
  if (isCricketLeague(league)) {
    const r = cricketResult(g);
    if (r === "home") return aIsHome ? "A" : "B";
    if (r === "away") return aIsHome ? "B" : "A";
    return r;
  }
  const gf = aIsHome ? g.home_score : g.away_score;
  const ga = aIsHome ? g.away_score : g.home_score;
  return gf > ga ? "A" : gf < ga ? "B" : "draw";
}

export interface MeetingTally {
  /** Meetings tallied: games given. winsA + winsB + draws + ties + noResults + unknown === meetings. */
  meetings: number;
  winsA: number;
  winsB: number;
  /** Football draws, NFL ties, Test draws. */
  draws: number;
  /** Cricket matches that finished level (including a super over): not a win for either side. */
  ties: number;
  /** Cricket matches abandoned or called off without a result. */
  noResults: number;
  /** Meetings whose result the data does not state (cricket only): left out of every count above and said so on the page. */
  unknown: number;
}

/** Counts the meetings by result. `games` may be in any order. */
export function tallyMeetings(league: League, games: OutcomeGame[], teamAId: string): MeetingTally {
  const t: MeetingTally = { meetings: games.length, winsA: 0, winsB: 0, draws: 0, ties: 0, noResults: 0, unknown: 0 };
  for (const g of games) {
    const r = meetingResult(league, g, teamAId);
    if (r === "A") t.winsA++;
    else if (r === "B") t.winsB++;
    else if (r === "draw") t.draws++;
    else if (r === "tie") t.ties++;
    else if (r === "noResult") t.noResults++;
    else t.unknown++;
  }
  return t;
}

/** The current run, newest first: who has won the last N meetings, or a run of draws. Null when the newest meeting's result is unknown, tied or abandoned. */
export function currentRun(results: MeetingResult[]): { team: "A" | "B" | null; length: number } | null {
  if (results.length === 0) return null;
  const first = results[0];
  if (first !== "A" && first !== "B" && first !== "draw") return null;
  let length = 0;
  for (const r of results) {
    if (r !== first) break;
    length++;
  }
  return { team: first === "draw" ? null : first, length };
}

/** "N of M meetings with a recorded result" when some meetings have none; null when every meeting has one. */
export function recordedResultNote(tally: Pick<MeetingTally, "meetings" | "unknown">): string | null {
  if (tally.unknown === 0) return null;
  const n = tally.meetings - tally.unknown;
  return `Results are recorded for ${n} of ${tally.meetings} meetings; ${tally.unknown === 1 ? "the other is" : "the others are"} left out of the record.`;
}
