export interface CricketPlayerMatchStats {
  athleteId: string;
  name: string;
  teamId: string;
  batting?: { runs: number; ballsFaced: number; fours: number; sixes: number; notOut: boolean };
  bowling?: { overs: number; conceded: number; wickets: number };
  catches?: number;
}

// Cricket has no boxscore/rosters-with-flat-stats shape like the other sports — each
// player's contribution lives inside rosters[].roster[].linescores[], one entry per
// innings, with the underlying stat set differing depending on whether that entry
// represents batting, bowling, or pure fielding. Mirrors the per-match parsing in
// src/lib/matchDetail.ts (that file can't be imported from scripts/, so this is a
// small parallel copy), but accumulates one row per player instead of display tables.
export function extractCricketMatchStats(summary: any): { venue: string | null; players: CricketPlayerMatchStats[] } {
  const venue = summary?.gameInfo?.venue?.fullName ?? null;
  const players: CricketPlayerMatchStats[] = [];

  for (const r of summary?.rosters ?? []) {
    const teamId: string | undefined = r.team?.id;
    if (!teamId) continue;

    for (const p of r.roster ?? []) {
      const athleteId: string | undefined = p.athlete?.id;
      const name: string | undefined = p.athlete?.displayName;
      if (!athleteId || !name) continue;

      let batting: CricketPlayerMatchStats["batting"];
      let bowling: CricketPlayerMatchStats["bowling"];
      let catches = 0;

      for (const period of p.linescores ?? []) {
        const stats: any[] = period.statistics?.categories?.[0]?.stats ?? [];
        if (stats.length === 0) continue;
        const get = (statName: string): number => {
          const found = stats.find((s) => s.name === statName);
          const raw = found?.value ?? found?.displayValue;
          const n = Number(raw);
          return Number.isFinite(n) ? n : 0;
        };

        const ballsFaced = get("ballsFaced");
        if (ballsFaced > 0) {
          batting = { runs: get("runs"), ballsFaced, fours: get("fours"), sixes: get("sixes"), notOut: get("notouts") > 0 };
        }
        const overs = get("overs");
        if (overs > 0) {
          bowling = { overs, conceded: get("conceded"), wickets: get("wickets") };
        }
        catches += get("caught") + get("caughtFielder") + get("caughtKeeper") + get("stumped");
      }

      if (batting || bowling || catches > 0) {
        players.push({ athleteId, name, teamId, batting, bowling, catches: catches || undefined });
      }
    }
  }

  return { venue, players };
}
