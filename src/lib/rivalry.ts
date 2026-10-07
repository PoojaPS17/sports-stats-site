import { isCountedMeeting, type HeadToHead } from "@/lib/analytics";

export interface RivalryMeter {
  /** "Neck and neck", "Edge to Lakers", "One-sided": null until there are enough meetings to say. */
  label: string | null;
  /** The last five counted meetings, most recent first, from the first team's side. */
  last5: ("A" | "B" | "D")[];
}

/** Fewer decided meetings than this say nothing about how close a rivalry is. */
export const MIN_MEETINGS_FOR_LABEL = 5;

/**
 * How close the all-time record is, and how the last five went. Closeness is the leader's share of the decided
 * meetings (draws leave it out), so a 10-10 record with 30 draws is still neck and neck.
 */
export function rivalryMeter(h2h: Pick<HeadToHead, "teamA" | "teamB" | "winsA" | "winsB" | "meetings" | "games">, nameOf: (t: HeadToHead["teamA"]) => string): RivalryMeter {
  const last5: RivalryMeter["last5"] = h2h.games
    .filter(isCountedMeeting)
    .slice(0, 5)
    .map((g) => {
      const aHome = g.home_team_espn_id === h2h.teamA.espn_id;
      const a = aHome ? g.home_score! : g.away_score!;
      const b = aHome ? g.away_score! : g.home_score!;
      return a > b ? "A" : a < b ? "B" : "D";
    });
  const decided = h2h.winsA + h2h.winsB;
  if (h2h.meetings < MIN_MEETINGS_FOR_LABEL || decided === 0) return { label: null, last5 };
  const leader = h2h.winsA >= h2h.winsB ? h2h.teamA : h2h.teamB;
  const share = Math.max(h2h.winsA, h2h.winsB) / decided;
  const label = share <= 0.55 ? "Neck and neck" : share <= 0.65 ? `Slight edge to ${nameOf(leader)}` : share <= 0.8 ? `Clear edge to ${nameOf(leader)}` : "One-sided";
  return { label, last5 };
}
