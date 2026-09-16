import { pool } from "./lib/db";
import { fetchStandings, type League } from "./lib/espn";

const LEAGUES: League[] = ["nba", "nfl", "epl", "ipl"];

function statValue(stats: any[], ...names: string[]): string | undefined {
  for (const name of names) {
    const found = stats.find((s) => s.name === name)?.displayValue;
    if (found !== undefined) return found;
  }
  return undefined;
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

async function processLeague(league: League) {
  const data = await fetchStandings(league);
  const season = data.season?.year ?? new Date().getFullYear();
  const entries: any[] = [];
  collectEntries(data, null, entries);

  for (const { entry, conference } of entries) {
      const stats = entry.stats ?? [];
      const draws = statValue(stats, "ties");
      const points = statValue(stats, "points", "matchPoints");
      const goalsFor = statValue(stats, "pointsFor");
      const goalsAgainst = statValue(stats, "pointsAgainst");
      const noResult = statValue(stats, "noresult");
      const netRunRate = statValue(stats, "netrr");
      await pool.query(
        `insert into standings (
           league, season, team_espn_id, conference, wins, losses,
           win_percent, streak, playoff_seed, games_behind,
           draws, points, goals_for, goals_against, no_result, net_run_rate, updated_at
         ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16, now())
         on conflict (league, season, team_espn_id) do update set
           conference = excluded.conference, wins = excluded.wins, losses = excluded.losses,
           win_percent = excluded.win_percent, streak = excluded.streak,
           playoff_seed = excluded.playoff_seed, games_behind = excluded.games_behind,
           draws = excluded.draws, points = excluded.points,
           goals_for = excluded.goals_for, goals_against = excluded.goals_against,
           no_result = excluded.no_result, net_run_rate = excluded.net_run_rate,
           updated_at = now()`,
        [
          league,
          season,
          entry.team.id,
          conference,
          Number(statValue(stats, "wins", "matchesWon") ?? 0),
          Number(statValue(stats, "losses", "matchesLost") ?? 0),
          Number(statValue(stats, "winPercent") ?? 0),
          statValue(stats, "streak") ?? null,
          statValue(stats, "playoffSeed") ? Number(statValue(stats, "playoffSeed")) : null,
          statValue(stats, "gamesBehind") ?? null,
          draws !== undefined ? Number(draws) : null,
          points !== undefined ? Number(points) : null,
          goalsFor !== undefined ? Number(goalsFor) : null,
          goalsAgainst !== undefined ? Number(goalsAgainst) : null,
          noResult !== undefined ? Number(noResult) : null,
          netRunRate !== undefined ? Number(netRunRate) : null,
        ]
      );
  }
  console.log(`[fetch-standings] ${league}: upserted ${entries.length} rows`);
}

async function main() {
  for (const league of LEAGUES) {
    try {
      await processLeague(league);
    } catch (err) {
      console.error(`[fetch-standings] ${league} failed:`, err instanceof Error ? err.message : err);
    }
  }
  await pool.end();
}

main().catch((err) => {
  console.error("[fetch-standings] failed:", err);
  process.exit(1);
});
