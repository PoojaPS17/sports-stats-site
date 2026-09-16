import { pool } from "./db";
import { fetchAthleteSeasonStats, type League } from "./espn";

function currentSeasonRow(category: any, seasonYear: number): { labels: string[]; values: string[] } | null {
  const stats: any[] = category.statistics ?? [];
  const row = stats.find((s) => s.season?.year === seasonYear);
  if (!row) return null;
  return { labels: category.labels ?? [], values: row.stats ?? [] };
}

function numberAt(labels: string[], values: string[], label: string): number | null {
  const i = labels.indexOf(label);
  if (i === -1 || values[i] === undefined) return null;
  const n = Number(String(values[i]).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

// 0 isn't a meaningful "leader" value (e.g. every player technically has 0 passing
// yards unless they're a QB) — treat it as absent for leaderboard ranking purposes.
function positiveOrNull(n: number | null): number | null {
  return n !== null && n > 0 ? n : null;
}

export async function updatePlayerSeasonStats(
  league: League,
  playerEspnId: string,
  teamEspnId: string | null,
  seasonYear: number
) {
  const data = await fetchAthleteSeasonStats(league, playerEspnId);
  const categories: any[] = data.categories ?? [];

  const out: Record<string, { labels: string[]; values: string[] }> = {};
  let ptsAvg: number | null = null;
  let rebAvg: number | null = null;
  let astAvg: number | null = null;
  let passingYards: number | null = null;
  let rushingYards: number | null = null;
  let receivingYards: number | null = null;
  let found = false;

  for (const category of categories) {
    const row = currentSeasonRow(category, seasonYear);
    if (!row) continue;
    found = true;
    out[category.name] = row;

    if (category.name === "averages") {
      ptsAvg = positiveOrNull(numberAt(row.labels, row.values, "PTS"));
      rebAvg = positiveOrNull(numberAt(row.labels, row.values, "REB"));
      astAvg = positiveOrNull(numberAt(row.labels, row.values, "AST"));
    }
    if (category.name === "passing") passingYards = positiveOrNull(numberAt(row.labels, row.values, "YDS"));
    if (category.name === "rushing") rushingYards = positiveOrNull(numberAt(row.labels, row.values, "YDS"));
    if (category.name === "receiving") receivingYards = positiveOrNull(numberAt(row.labels, row.values, "YDS"));
  }

  if (!found) return false;

  await pool.query(
    `insert into player_season_stats (
       league, season, player_espn_id, team_espn_id, categories,
       pts_avg, reb_avg, ast_avg, passing_yards, rushing_yards, receiving_yards, updated_at
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now())
     on conflict (league, season, player_espn_id) do update set
       team_espn_id = excluded.team_espn_id, categories = excluded.categories,
       pts_avg = excluded.pts_avg, reb_avg = excluded.reb_avg, ast_avg = excluded.ast_avg,
       passing_yards = excluded.passing_yards, rushing_yards = excluded.rushing_yards,
       receiving_yards = excluded.receiving_yards, updated_at = now()`,
    [league, seasonYear, playerEspnId, teamEspnId, JSON.stringify(out), ptsAvg, rebAvg, astAvg, passingYards, rushingYards, receivingYards]
  );
  return true;
}
