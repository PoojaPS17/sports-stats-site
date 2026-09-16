import { pool } from "./lib/db";
import { fetchStandings, type League } from "./lib/espn";

const LEAGUES: League[] = ["nba", "nfl"];

function statValue(stats: any[], name: string): string | undefined {
  return stats.find((s) => s.name === name)?.displayValue;
}

function collectEntries(node: any, conference: string | null, out: any[]) {
  if (node.standings?.entries) {
    for (const entry of node.standings.entries) {
      out.push({ entry, conference: conference ?? node.name ?? null });
    }
  }
  for (const child of node.children ?? []) {
    collectEntries(child, node.isConference ? node.name : conference, out);
  }
}

async function main() {
  for (const league of LEAGUES) {
    const data = await fetchStandings(league);
    const season = data.season?.year ?? new Date().getFullYear();
    const entries: any[] = [];
    collectEntries(data, null, entries);

    for (const { entry, conference } of entries) {
      const stats = entry.stats ?? [];
      await pool.query(
        `insert into standings (
           league, season, team_espn_id, conference, wins, losses,
           win_percent, streak, playoff_seed, games_behind, updated_at
         ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now())
         on conflict (league, season, team_espn_id) do update set
           conference = excluded.conference, wins = excluded.wins, losses = excluded.losses,
           win_percent = excluded.win_percent, streak = excluded.streak,
           playoff_seed = excluded.playoff_seed, games_behind = excluded.games_behind,
           updated_at = now()`,
        [
          league,
          season,
          entry.team.id,
          conference,
          Number(statValue(stats, "wins") ?? 0),
          Number(statValue(stats, "losses") ?? 0),
          Number(statValue(stats, "winPercent") ?? 0),
          statValue(stats, "streak") ?? null,
          statValue(stats, "playoffSeed") ? Number(statValue(stats, "playoffSeed")) : null,
          statValue(stats, "gamesBehind") ?? null,
        ]
      );
    }
    console.log(`[fetch-standings] ${league}: upserted ${entries.length} rows`);
  }
  await pool.end();
}

main().catch((err) => {
  console.error("[fetch-standings] failed:", err);
  process.exit(1);
});
