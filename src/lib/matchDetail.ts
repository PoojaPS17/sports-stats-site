/* eslint-disable @typescript-eslint/no-explicit-any -- parsing loosely-typed raw ESPN
   JSON, same justification the scraper scripts use for the same API responses */
import type { League } from "./queries";

const SPORT_PATH: Record<League, string> = {
  nba: "basketball/nba",
  nfl: "football/nfl",
  epl: "soccer/eng.1",
  ipl: "cricket/8048",
  bbl: "cricket/8044",
  cwc: "cricket/8039",
  t20wc: "cricket/8604",
  laliga: "soccer/esp.1",
  ucl: "soccer/uefa.champions",
};

// Match detail is fetched live from ESPN at request time rather than stored in our DB
// — unlike scores/standings/rosters, there's no recurring scrape building this up, so
// a live fetch is the only way to cover all 10 years of backfilled historical games
// (and every future one) without a second, much larger backfill (one request per
// historical game, thousands of them) that hasn't been undertaken.
export async function fetchMatchSummary(league: League, espnId: string): Promise<any | null> {
  try {
    const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${SPORT_PATH[league]}/summary?event=${espnId}`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export interface TeamStatGroup {
  teamId: string;
  teamName: string;
  stats: { label: string; value: string }[];
}

// NBA/NFL/EPL all expose boxscore.teams[] with the same {team, statistics[]} shape.
export function parseTeamStats(data: any): TeamStatGroup[] {
  return (data.boxscore?.teams ?? []).map((t: any) => ({
    teamId: t.team?.id,
    teamName: t.team?.displayName ?? t.team?.name,
    stats: (t.statistics ?? []).map((s: any) => ({ label: s.label ?? s.displayName ?? s.name, value: s.displayValue })),
  }));
}

export interface PlayerStatCategory {
  name: string;
  labels: string[];
  rows: { athleteId: string; name: string; stats: string[] }[];
}

export interface TeamPlayerBox {
  teamId: string;
  teamName: string;
  categories: PlayerStatCategory[];
}

// NBA/NFL: boxscore.players[team].statistics[category].athletes[] (parallel to category.labels[])
export function parseAmericanPlayerBox(data: any): TeamPlayerBox[] {
  return (data.boxscore?.players ?? []).map((group: any) => ({
    teamId: group.team?.id,
    teamName: group.team?.displayName ?? group.team?.name,
    categories: (group.statistics ?? []).map((cat: any) => ({
      name: cat.text ?? cat.name,
      labels: cat.labels ?? [],
      rows: (cat.athletes ?? [])
        .filter((a: any) => a.athlete)
        .map((a: any) => ({ athleteId: a.athlete.id, name: a.athlete.displayName, stats: a.stats ?? [] })),
    })),
  }));
}

// Soccer: rosters[team].roster[] carries a flat named stat list per player instead of
// category/label pairs — bundle it into one synthetic "Match" category so the same
// table shape works for both American-sports and soccer box scores.
export function parseSoccerPlayerBox(data: any): TeamPlayerBox[] {
  return (data.rosters ?? []).map((r: any) => {
    const players = (r.roster ?? []).filter((p: any) => p.active && (p.stats ?? []).length > 0);
    const labels = players[0]?.stats?.map((s: any) => s.shortDisplayName ?? s.name) ?? [];
    return {
      teamId: r.team?.id,
      teamName: r.team?.displayName ?? r.team?.name,
      categories:
        players.length === 0
          ? []
          : [
              {
                name: "Match",
                labels,
                rows: players.map((p: any) => ({
                  athleteId: p.athlete.id,
                  name: p.athlete.displayName,
                  stats: (p.stats ?? []).map((s: any) => s.displayValue),
                })),
              },
            ],
    };
  });
}

export interface CricketInningsRow {
  name: string;
  athleteId: string;
  stats: string[];
}

export interface CricketTeamScorecard {
  teamId: string;
  teamName: string;
  battingLabels: string[];
  battingRows: CricketInningsRow[];
  bowlingLabels: string[];
  bowlingRows: CricketInningsRow[];
}

const BATTING_FIELDS: [string, string][] = [
  ["runs", "R"],
  ["ballsFaced", "B"],
  ["fours", "4s"],
  ["sixes", "6s"],
  ["strikeRate", "SR"],
];
const BOWLING_FIELDS: [string, string][] = [
  ["overs", "O"],
  ["maidens", "M"],
  ["conceded", "R"],
  ["wickets", "W"],
  ["economyRate", "Econ"],
];

// Cricket has no boxscore/rosters-with-flat-stats shape like the other sports — each
// player's batting and bowling figures live inside rosters[].roster[].linescores[],
// one entry per innings they took part in, with the underlying stat names differing
// depending on whether that entry represents a batting or a bowling contribution.
export function parseCricketScorecard(data: any): CricketTeamScorecard[] {
  return (data.rosters ?? []).map((r: any) => {
    const battingRows: CricketInningsRow[] = [];
    const bowlingRows: CricketInningsRow[] = [];

    for (const p of r.roster ?? []) {
      for (const period of p.linescores ?? []) {
        const stats: any[] = period.statistics?.categories?.[0]?.stats ?? [];
        if (stats.length === 0) continue;
        const get = (name: string) => stats.find((s) => s.name === name)?.displayValue;
        const isBatting = stats.some((s) => s.name === "ballsFaced");
        const isBowling = stats.some((s) => s.name === "overs");

        if (isBatting && Number(get("ballsFaced") ?? 0) > 0) {
          battingRows.push({
            athleteId: p.athlete.id,
            name: p.athlete.displayName,
            stats: BATTING_FIELDS.map(([key]) => get(key) ?? "-"),
          });
        }
        if (isBowling && Number(get("overs") ?? 0) > 0) {
          bowlingRows.push({
            athleteId: p.athlete.id,
            name: p.athlete.displayName,
            stats: BOWLING_FIELDS.map(([key]) => get(key) ?? "-"),
          });
        }
      }
    }

    return {
      teamId: r.team?.id,
      teamName: r.team?.displayName ?? r.team?.name,
      battingLabels: BATTING_FIELDS.map(([, label]) => label),
      battingRows,
      bowlingLabels: BOWLING_FIELDS.map(([, label]) => label),
      bowlingRows,
    };
  });
}
