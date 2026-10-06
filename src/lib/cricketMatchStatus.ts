// What a cricket match from ESPN's series listing is, for display: in play, a result, a fixture still to be played,
// or called off. The listing stores only ESPN's state (pre / in / post) and its summary text, no completed flag, so
// the summary is what tells a match ESPN closed without playing from one that is merely still to come.
//
// What ESPN sends (site.web.api.espn.com/apis/v2/scoreboard/header?sport=cricket, listings of 2025-10 to 2026-12): a
// match abandoned without a ball bowled is "post" (type id 6, a result: "Match abandoned without a ball bowled"), a
// no-result match is "post" (id 5), a match in play is "in" (a rain stoppage stays "in"), and a cancelled match is
// also "post" (id 7 "Canceled", "Match cancelled without a ball bowled"), so "post" with a postponed or cancelled
// summary is called off, never a result. No postponed match, and no "pre" match with a called-off summary, turned up
// in that window; those are recognised from the summary text alone.
import { calledOffLabel, CALLED_OFF, isNeverPlayed, schemaStatusForLabel } from "./gameStatus";
import { cricketResultLine, type CricketSide } from "./cricketResult";

export type CricketMatchKind = "live" | "result" | "fixture" | { calledOff: string };

interface StatusFields {
  status_state: string | null;
  status_summary: string | null;
}

/**
 * - in play ("in"): live, whatever its summary says (a rain-suspended match is still live);
 * - finished ("post"): a result, including abandoned without a ball bowled and no result; except a match ESPN
 *   closed as postponed or cancelled, which was never played;
 * - anything else (pre, null): a fixture, unless the summary says it was called off.
 */
export function classifyCricketMatch(m: StatusFields): CricketMatchKind {
  const summary = m.status_summary ?? "";
  if (m.status_state === "in") return "live";
  if (m.status_state === "post") {
    return isNeverPlayed(summary) ? { calledOff: calledOffLabel(summary) ?? "Postponed" } : "result";
  }
  return CALLED_OFF.test(summary) ? { calledOff: calledOffLabel(summary) ?? "Postponed" } : "fixture";
}

/** The date line of a cricket match: date and start time (UTC) for a fixture or a match in play, date and reason for a called-off one, date alone for a result. */
export function cricketMatchWhen(m: StatusFields & { date: string }): string {
  const d = new Date(m.date);
  const kind = classifyCricketMatch(m);
  const day = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  if (kind === "result") return day;
  if (typeof kind === "object") return `${day} · ${kind.calledOff}`;
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}, ${d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" })} UTC`;
}

/** schema.org status of a cricket match: postponed or cancelled when called off, scheduled otherwise (it has no "finished" status). */
export function cricketSchemaStatus(m: StatusFields): string {
  const kind = classifyCricketMatch(m);
  return schemaStatusForLabel(typeof kind === "object" ? kind.calledOff : null);
}

/** Matches of a series still to be played: those neither finished nor called off (a postponed match is not one to play). */
export function seriesMatchesToPlay(s: { match_count: number; completed_count: number; called_off_count: number }): number {
  return Math.max(0, s.match_count - s.completed_count - s.called_off_count);
}

/** ESPN names a match "A v B"; searchers type "A vs B", so titles, headings and descriptions read that way. */
export function cricketMatchName(name: string): string {
  return name.replace(/ v /g, " vs ");
}

interface SeoFields extends StatusFields {
  name: string;
  series_name: string;
  /** The stage ("14th Match", "2nd ODI", "Final"), when the listing has one. */
  description?: string | null;
  /** The start, as stored (UTC ISO string); the description dates the match with it. */
  date?: string | null;
  /** The sides, when stored: a result is then written in full names, the winner first, instead of ESPN's abbreviated summary. */
  home?: (Partial<CricketSide> & { winner?: boolean | null }) | null;
  away?: (Partial<CricketSide> & { winner?: boolean | null }) | null;
}

/**
 * The page title, longest form first for fitTitle: the teams as searchers type them, then the word that names the
 * page (Scorecard for a result, Live Score in play, nothing for a fixture or a called-off match), then the stage and
 * the series. The series is dropped before the stage: the description still names it, and "14th Match" alone tells
 * the match apart from the sides' other meetings. The last form is the names and the keyword alone, offered even when
 * it is over the budget: domestic sides have long names ("Khan Research Laboratories vs Hyderabad Kingsmen Academy
 * Scorecard" is 66 characters), and the queries that find these pages are typed with those names in full (Search
 * Console, 2026-10-06), so a title that runs over and is clipped by Google still beats one with abbreviations.
 */
export function cricketMatchTitleCandidates(m: SeoFields): string[] {
  const kind = classifyCricketMatch(m);
  const keyword = kind === "result" ? " Scorecard" : kind === "live" ? " Live Score" : "";
  const stage = m.description?.trim() || null;
  const lead = `${cricketMatchName(m.name)}${keyword}`;
  const out: string[] = [];
  for (const parts of [[lead, stage, m.series_name], [lead, m.series_name], [lead, stage], [lead]]) {
    if (parts.includes(null)) continue;
    const title = parts.join(", ");
    if (!out.includes(title)) out.push(title);
  }
  return out;
}

/** "Oct 2, 2026", and with `withTime` "Oct 2, 2026, 04:00 UTC": the match's start as the description states it. */
export function describedDate(date: string | null | undefined, withTime: boolean): string | null {
  if (!date) return null;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const day = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  if (!withTime) return day;
  return `${day}, ${d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" })} UTC`;
}

/**
 * The meta description of a cricket match page, in the words searchers use ("match scorecard", "live score",
 * "playing XI"): the reason for a called-off match; the match scorecard, date and result for a finished one; the live
 * score in play; and what the page will hold for a fixture, with its start in UTC rather than ESPN's status text
 * ("Match scheduled to begin at 09:30", a local time with no zone).
 */
export function cricketMatchDescription(m: SeoFields): string {
  const kind = classifyCricketMatch(m);
  const name = cricketMatchName(m.name);
  const where = [m.description?.trim() || null, m.series_name].filter(Boolean).join(", ");
  const line = kind === "result" && m.home?.name && m.away?.name ? cricketResultLine({ ...m.home, name: m.home.name }, { ...m.away, name: m.away.name }, m.status_summary) : null;
  const summary = line ? `: ${line}` : m.status_summary ? `: ${m.status_summary}` : "";
  if (typeof kind === "object") return `${name}, ${where}: match ${kind.calledOff.toLowerCase()}.`;
  const day = describedDate(m.date, kind === "fixture");
  if (kind === "result") return `${name} match scorecard and result, ${where}${day ? `, ${day}` : ""}${summary}. Full batting and bowling scorecard, Playing XI, umpires and venue.`;
  if (kind === "live") return `${name} live score and scorecard, ${where}${day ? `, ${day}` : ""}${summary}. Batting and bowling figures, Playing XI and match facts, updating while the match is in play.`;
  return `${name} live score and scorecard, ${where}${day ? `, starts ${day}` : ""}. Playing XI and match facts once play starts.`;
}
