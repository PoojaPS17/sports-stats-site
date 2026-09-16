import { pool } from "./lib/db";
import { fetchSummary, slugify, type League } from "./lib/espn";

const LEAGUES: League[] = ["nba", "nfl"];

async function processGame(league: League, gameEspnId: string) {
  const data = await fetchSummary(league, gameEspnId);
  const teamGroups = data.boxscore?.players ?? [];
  if (teamGroups.length === 0) return 0;

  const perPlayer = new Map<string, { athlete: any; teamId: string; stats: Record<string, Record<string, string>> }>();

  for (const group of teamGroups) {
    const teamId: string = group.team.id;
    for (const category of group.statistics ?? []) {
      const labels: string[] = category.labels ?? [];
      for (const row of category.athletes ?? []) {
        const key = row.athlete.id;
        if (!perPlayer.has(key)) {
          perPlayer.set(key, { athlete: row.athlete, teamId, stats: {} });
        }
        const values: Record<string, string> = {};
        labels.forEach((label, i) => {
          if (row.stats?.[i] !== undefined) values[label] = row.stats[i];
        });
        perPlayer.get(key)!.stats[category.name] = values;
      }
    }
  }

  for (const { athlete, teamId, stats } of perPlayer.values()) {
    await pool.query(
      `insert into players (league, espn_id, team_espn_id, name, slug, position, headshot_url)
       values ($1,$2,$3,$4,$5,$6,$7)
       on conflict (league, espn_id) do update set
         team_espn_id = excluded.team_espn_id, name = excluded.name,
         headshot_url = excluded.headshot_url`,
      [league, athlete.id, teamId, athlete.displayName, slugify(athlete.displayName), null, athlete.headshot?.href ?? null]
    );

    await pool.query(
      `insert into player_game_stats (league, game_espn_id, player_espn_id, team_espn_id, stats, updated_at)
       values ($1,$2,$3,$4,$5, now())
       on conflict (league, game_espn_id, player_espn_id) do update set
         stats = excluded.stats, updated_at = now()`,
      [league, gameEspnId, athlete.id, teamId, JSON.stringify(stats)]
    );
  }

  return perPlayer.size;
}

async function main() {
  for (const league of LEAGUES) {
    const { rows } = await pool.query(
      `select espn_id from games
       where league = $1 and completed = true and date > now() - interval '3 days'`,
      [league]
    );

    let total = 0;
    for (const { espn_id } of rows) {
      try {
        total += await processGame(league, espn_id);
      } catch (err) {
        console.error(`[fetch-player-stats] ${league} game ${espn_id} failed:`, err);
      }
    }
    console.log(`[fetch-player-stats] ${league}: processed ${rows.length} games, ${total} player-stat rows`);
  }
  await pool.end();
}

main().catch((err) => {
  console.error("[fetch-player-stats] failed:", err);
  process.exit(1);
});
