// What a tennis match is, for display: upcoming, live, a result, or called off. A match ESPN closed without playing
// (postponed, cancelled, suspended) must never show a start time or "Upcoming". Pure, so tests need no React.
//
// ESPN's tennis listing files a finished match, a retirement and a walkover all as state "post"; the scraper stores
// state "post" as completed, so a postponed match can be stored completed with no winner. Called off is therefore
// decided by the status text and there being no winner, not by the completed flag alone.
import { calledOffLabel, isCalledOff } from "./gameStatus";
import type { TennisMatch, TennisSet } from "./tennis";

type Fields = Pick<TennisMatch, "completed" | "status_state" | "status_detail" | "winner_side">;

export type TennisMatchStatus = { kind: "live" | "result" | "called-off" | "upcoming"; label: string | null };

/**
 * - in play: live, with ESPN's own detail ("2nd Set", "Suspended" for a rain stoppage), never called off;
 * - a winner, or a finished match: a result, "Final" or ESPN's text ("Retired", "Walkover");
 * - not in play, no winner, and a called-off status: called off, with the reason;
 * - anything else: upcoming.
 */
export function tennisMatchStatus(m: Fields): TennisMatchStatus {
  if (m.status_state === "in") return { kind: "live", label: m.status_detail ?? "Live" };
  if (m.winner_side == null && isCalledOff(m.status_detail)) return { kind: "called-off", label: calledOffLabel(m.status_detail) };
  if (m.completed || m.winner_side != null) return { kind: "result", label: m.status_detail && m.status_detail !== "Final" ? m.status_detail : "Final" };
  return { kind: "upcoming", label: null };
}

/** The caption above a match on a share image: state (start time in UTC for an upcoming match), round and court. */
export function tennisMatchCaption(m: Fields & Pick<TennisMatch, "date" | "round" | "court">): string {
  const s = tennisMatchStatus(m);
  const state = s.label ?? `${new Date(m.date).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" })} UTC`;
  // A finished final would read "Final · Final": say it once.
  return [state, m.round === state ? null : m.round, m.court].filter(Boolean).join(" · ");
}

export type SetCell = { text: string; sup: string | null; wide?: true };

/**
 * One side's cell for one set, given the opponent's set. The feed carries both players' points for a tie-break
 * ("7-6(8-6)"); the convention, and ESPN's scores page, shows only the loser's, on the loser's games: 7-6(6). A set
 * still in play has no loser yet, so each side shows its own points. A match tie-break (a doubles decider, played
 * as a "set" of 1-0 with points 10-6) is bracketed points, [10] and [6], never a set score with superscripts.
 */
export function setCell(own: TennisSet | undefined, other: TennisSet | undefined): SetCell | null {
  if (!own) return null;
  if (own.tiebreak != null && own.games <= 1 && (other?.games ?? 0) <= 1) return { text: `[${own.tiebreak}]`, sup: null, wide: true };
  const decided = own.winner || other?.winner === true;
  const shows = own.tiebreak != null && (!decided || !own.winner);
  return { text: String(own.games), sup: shows ? String(own.tiebreak) : null };
}
