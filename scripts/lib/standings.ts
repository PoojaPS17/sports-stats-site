import { pool } from "./db";
import type { League } from "./espn";

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

// Shared by the recurring current-season fetch and the one-time historical backfill —
// both just point this at a different ESPN standings response.
export async function upsertStandingsResponse(league: League, data: any, seasonOverride?: number): Promise<number> {
  const season = seasonOverride ?? data.season?.year ?? new Date().getFullYear();
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
        Math.round(Number(statValue(stats, "wins", "matchesWon") ?? 0)),
        Math.round(Number(statValue(stats, "losses", "matchesLost") ?? 0)),
        Number(statValue(stats, "winPercent") ?? 0),
        statValue(stats, "streak") ?? null,
        statValue(stats, "playoffSeed") ? Math.round(Number(statValue(stats, "playoffSeed"))) : null,
        statValue(stats, "gamesBehind") ?? null,
        // These int-typed columns are only meaningful for soccer/cricket — but some
        // seasons (e.g. NBA's 2020 bubble restart) surface an unrelated "points" stat
        // under the same stat name, which can be a non-integer power-ranking value
        // rather than a real points column. Round defensively so a stray decimal from
        // an off-shape season never crashes the whole insert.
        draws !== undefined ? Math.round(Number(draws)) : null,
        points !== undefined ? Math.round(Number(points)) : null,
        goalsFor !== undefined ? Math.round(Number(goalsFor)) : null,
        goalsAgainst !== undefined ? Math.round(Number(goalsAgainst)) : null,
        noResult !== undefined ? Math.round(Number(noResult)) : null,
        netRunRate !== undefined ? Number(netRunRate) : null,
      ]
    );
  }
  return entries.length;
}
