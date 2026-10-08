import { isCountedMeeting, type HeadToHead } from "@/lib/analytics";
import { meetingResult } from "@/lib/h2hOutcome";

export interface RivalryMeter {
  /** "Neck and neck", "Edge to Lakers", "One-sided": null until there are enough meetings to say. */
  label: string | null;
  /**
   * The last five counted meetings with a recorded result, most recent first, from the first team's side:
   * A or B won, D drawn, T tied (cricket), N no result (cricket). A meeting whose result is unknown is skipped.
   */
  last5: ("A" | "B" | "D" | "T" | "N")[];
}

/** Fewer decided meetings than this say nothing about how close a rivalry is. */
export const MIN_MEETINGS_FOR_LABEL = 5;

/**
 * How close the record on file is, and how the last five went. Closeness is the leader's share of the decided
 * meetings (draws leave it out), so a 10-10 record with 30 draws is still neck and neck.
 */
export function rivalryMeter(h2h: Pick<HeadToHead, "teamA" | "teamB" | "winsA" | "winsB" | "meetings" | "games"> & { league?: HeadToHead["league"]; unknown?: number }, nameOf: (t: HeadToHead["teamA"]) => string): RivalryMeter {
  const last5: RivalryMeter["last5"] = [];
  for (const g of h2h.games.filter(isCountedMeeting)) {
    if (last5.length === 5) break;
    // A call without a league (the score-comparing leagues' old shape) reads the scores, as meetingResult does outside cricket.
    const r = meetingResult(h2h.league ?? "epl", g, h2h.teamA.espn_id);
    if (r === "A" || r === "B") last5.push(r);
    else if (r === "draw") last5.push("D");
    else if (r === "tie") last5.push("T");
    else if (r === "noResult") last5.push("N");
  }
  const decided = h2h.winsA + h2h.winsB;
  // Meetings whose result is unknown say nothing about how close the record is.
  if (h2h.meetings - (h2h.unknown ?? 0) < MIN_MEETINGS_FOR_LABEL || decided === 0) return { label: null, last5 };
  const leader = h2h.winsA >= h2h.winsB ? h2h.teamA : h2h.teamB;
  const share = Math.max(h2h.winsA, h2h.winsB) / decided;
  const label = share <= 0.55 ? "Neck and neck" : share <= 0.65 ? `Slight edge to ${nameOf(leader)}` : share <= 0.8 ? `Clear edge to ${nameOf(leader)}` : "One-sided";
  return { label, last5 };
}

/** "Celtics have won the last 4", or null when there is no run of two or more. */
export function streakText(h2h: Pick<HeadToHead, "teamA" | "teamB" | "streak">, nameOf: (t: HeadToHead["teamA"]) => string): string | null {
  const st = h2h.streak;
  if (!st || st.length < 2) return null;
  if (st.team === "A") return `${nameOf(h2h.teamA)} have won the last ${st.length}`;
  if (st.team === "B") return `${nameOf(h2h.teamB)} have won the last ${st.length}`;
  return `The last ${st.length} meetings were drawn`;
}
