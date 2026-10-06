// The match page's one-paragraph report: who beat whom, where and when, and the match's top scorer, best bowler and
// Player of the Match; a preview for a fixture. Search Console, 2026-10-06: cricket match pages rank at position 8-9
// with a 0.1-0.5% click rate, a snippet problem, and a page of tables alone gives Google no sentence to lift. Pure,
// so the page and its tests share it; the figures come from the parsed scorecard (matchDetail.ts).
import type { CricketMatchKind } from "./cricketMatchStatus";
import { cricketMatchWhere, describedDate } from "./cricketMatchStatus";
import { cricketResultLine, type CricketSide } from "./cricketResult";
import type { CricketTeamScorecard } from "./matchDetail";

export interface ReportSide extends CricketSide {
  winner?: boolean | null;
}

export interface MatchReportInput {
  kind: CricketMatchKind;
  home: ReportSide;
  away: ReportSide;
  /** ESPN's status text ("BAN-WMN U19 won by 30 runs"). */
  statusSummary: string | null;
  /** "1st Match", "Final", "2nd ODI". */
  stage: string | null;
  seriesName: string | null;
  /** Already with its city ("Iqbal Stadium, Faisalabad"). */
  venue: string | null;
  /** The start (UTC ISO string). */
  date: string | null;
  scorecard: CricketTeamScorecard[];
  playerOfTheMatch: string | null;
}

/** "in the 1st Match of the <series>", "in the <series>", or nothing. */
const num = (s: string | undefined) => (s != null && /^\d+(\.\d+)?$/.test(s) ? Number(s) : null);

/** The highest single innings of the match: most runs, then fewer balls faced, then scorecard order. */
function topScorer(scorecard: CricketTeamScorecard[]): string | null {
  let best: { name: string; runs: number; balls: number; notOut: boolean } | null = null;
  for (const team of scorecard) {
    for (const r of team.battingRows) {
      const runs = num(r.stats[0]);
      if (runs == null) continue;
      const balls = num(r.stats[1]) ?? Number.POSITIVE_INFINITY;
      if (!best || runs > best.runs || (runs === best.runs && balls < best.balls)) best = { name: r.name, runs, balls, notOut: /not out|retired/i.test(r.dismissal ?? "") };
    }
  }
  return best ? `${best.name} top-scored with ${best.runs}${best.notOut ? " not out" : ""}` : null;
}

/** The best bowling figures of the match: most wickets (at least one), then fewest runs conceded. */
function bestBowler(scorecard: CricketTeamScorecard[]): string | null {
  let best: { name: string; wickets: number; conceded: number } | null = null;
  for (const team of scorecard) {
    for (const r of team.bowlingRows) {
      const wickets = num(r.stats[3]);
      const conceded = num(r.stats[2]);
      if (wickets == null || conceded == null || wickets < 1) continue;
      if (!best || wickets > best.wickets || (wickets === best.wickets && conceded < best.conceded)) best = { name: r.name, wickets, conceded };
    }
  }
  return best ? `${best.name} took ${best.wickets} for ${best.conceded}` : null;
}

/**
 * The report paragraph, or null when there is nothing safe to say: a live match (the page refreshes itself), a
 * called-off one (the page already says why), or a result whose summary cannot be put into words.
 */
export function cricketMatchReport(m: MatchReportInput): string | null {
  if (m.kind === "live" || typeof m.kind === "object") return null;
  const at = m.venue ? ` at ${m.venue}` : "";
  if (m.kind === "fixture") {
    if (!m.home.name || !m.away.name) return null;
    const start = describedDate(m.date, true);
    return `${m.home.name} play ${m.away.name}${cricketMatchWhere(m.stage, m.seriesName)}${at}${start ? ` on ${start}` : ""}.`;
  }
  const line = cricketResultLine(m.home, m.away, m.statusSummary);
  if (!line) return null;
  const day = describedDate(m.date, false);
  const first = `${line}${cricketMatchWhere(m.stage, m.seriesName)}${at}${day ? ` on ${day}` : ""}.`;
  const figures = [topScorer(m.scorecard), bestBowler(m.scorecard)].filter((s): s is string => s != null).join(" and ");
  const potm = m.playerOfTheMatch ? `${m.playerOfTheMatch} was Player of the Match` : "";
  const second = figures && potm ? `${figures}; ${potm}.` : figures ? `${figures}.` : potm ? `${potm}.` : "";
  return second ? `${first} ${second}` : first;
}
