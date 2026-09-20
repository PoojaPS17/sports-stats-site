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
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}, ${d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" })} UTC`;
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

/** The meta description of a cricket match page: the reason for a called-off match, otherwise the live score and result. */
export function cricketMatchDescription(m: StatusFields & { name: string; series_name: string }): string {
  const kind = classifyCricketMatch(m);
  if (typeof kind === "object") return `${m.name}, ${m.series_name}: match ${kind.calledOff.toLowerCase()}.`;
  return `${m.name} live score and scorecard, ${m.series_name}${m.status_summary ? `: ${m.status_summary}` : ""}.`;
}
