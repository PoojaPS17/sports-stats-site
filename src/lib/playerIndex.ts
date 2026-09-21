import { teamDisplayName } from "@/lib/teamName";

/** What the players index shows of one player. */
export interface IndexPlayer {
  name: string;
  slug: string;
  team_name: string | null;
}

/**
 * The players of a league as the index page sends them to the browser: `[name, slug, team]` per
 * player, with `team` an index into `teams` (each team's display name once), or -1 for no team.
 *
 * The page's HTML carries every player's link, and Next repeats what a client component is given in
 * the page's own data. Sending the team name once per team instead of once per player (thousands
 * of times over) keeps the largest league's page well inside the first 2 MB that Google reads.
 */
export interface PackedPlayers {
  teams: string[];
  rows: [name: string, slug: string, team: number][];
}

export function packPlayers(players: IndexPlayer[]): PackedPlayers {
  const teams: string[] = [];
  const at = new Map<string, number>();
  const rows = players.map((p): PackedPlayers["rows"][number] => {
    if (!p.team_name) return [p.name, p.slug, -1];
    const shown = teamDisplayName(p.team_name);
    let i = at.get(shown);
    if (i === undefined) {
      i = teams.length;
      teams.push(shown);
      at.set(shown, i);
    }
    return [p.name, p.slug, i];
  });
  return { teams, rows };
}
