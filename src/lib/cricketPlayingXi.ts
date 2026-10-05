/* eslint-disable @typescript-eslint/no-explicit-any -- ESPN feed JSON has no published schema */
// Each side's Playing XI from ESPN's cricket match summary. The summary's rosters[].roster[] lists a side's
// squad with `captain` and `starter` flags, the match role under position.name ("Wicketkeeper", "Bowler",
// "Allrounder", "Unknown") and the player's usual role under athlete.position ("Opening batter", "Bowling
// allrounder", "Unknown" for most domestic players). Pure: no network, no database.

export interface XiPlayer {
  id: string;
  name: string;
  captain: boolean;
  keeper: boolean;
  /** The player's usual role as ESPN describes it ("Bowler", "Middle-order batter"), null when ESPN does not know it. */
  role: string | null;
}

export interface TeamXi {
  teamId: string;
  team: string;
  players: XiPlayer[];
}

const UNKNOWN = /^unknown$/i;

/**
 * One list per side in roster order: the starters when ESPN flags them, every listed player when it does not.
 * A side with no players is left out; a body with no rosters (an error body, a fixture not yet listed) gives nothing.
 */
export function playingXi(summary: any): TeamXi[] {
  const rosters: any[] = Array.isArray(summary?.rosters) ? summary.rosters : [];
  const out: TeamXi[] = [];
  for (const r of rosters) {
    const roster: any[] = Array.isArray(r?.roster) ? r.roster : [];
    const flagged = roster.some((p) => typeof p?.starter === "boolean");
    const players: XiPlayer[] = roster
      .filter((p) => p?.athlete && (!flagged || p.starter === true))
      .map((p) => {
        const matchRole = String(p.position?.name ?? "");
        const usual = String(p.athlete.position?.name ?? "");
        return {
          id: String(p.athlete.id ?? ""),
          name: String(p.athlete.displayName ?? p.athlete.fullName ?? p.athlete.name ?? ""),
          captain: p.captain === true,
          keeper: /wicket.?keeper/i.test(matchRole) || String(p.athlete.position?.abbreviation ?? "") === "WK",
          role: usual && !UNKNOWN.test(usual) ? usual : null,
        };
      })
      .filter((p) => p.name);
    if (players.length === 0) continue;
    out.push({ teamId: String(r.team?.id ?? ""), team: String(r.team?.displayName ?? r.team?.name ?? ""), players });
  }
  return out;
}
