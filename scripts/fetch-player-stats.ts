import { pool } from "./lib/db";
import { fetchSummary, type League } from "./lib/espn";
import { upsertPlayerSeasonStats } from "./lib/season-stats";
import { uniqueSlugFor } from "./lib/players";

const LEAGUES: League[] = ["nba", "nfl", "epl"];

type PlayerStats = Map<string, { athlete: any; teamId: string; stats: Record<string, Record<string, string>> }>;

// NBA/NFL: boxscore.players[team].statistics[category].athletes[].stats[] (parallel to category.labels[])
function extractAmericanSports(data: any): PlayerStats {
  const perPlayer: PlayerStats = new Map();
  for (const group of data.boxscore?.players ?? []) {
    const teamId: string = group.team.id;
    for (const category of group.statistics ?? []) {
      const labels: string[] = category.labels ?? [];
      for (const row of category.athletes ?? []) {
        const key = row.athlete.id;
        if (!perPlayer.has(key)) perPlayer.set(key, { athlete: row.athlete, teamId, stats: {} });
        const values: Record<string, string> = {};
        labels.forEach((label, i) => {
          if (row.stats?.[i] !== undefined) values[label] = row.stats[i];
        });
        perPlayer.get(key)!.stats[category.name] = values;
      }
    }
  }
  return perPlayer;
}

// Soccer: rosters[team].roster[].stats[] is a flat named list, not category/label pairs.
// Bundle it all under one "match" category so the display components (which expect
// { category: { label: value } }) work unchanged.
function extractSoccer(data: any): PlayerStats {
  const perPlayer: PlayerStats = new Map();
  for (const teamRoster of data.rosters ?? []) {
    const teamId: string = teamRoster.team.id;
    for (const item of teamRoster.roster ?? []) {
      if (!item.active) continue;
      const values: Record<string, string> = {};
      for (const stat of item.stats ?? []) {
        values[stat.shortDisplayName ?? stat.name] = stat.displayValue;
      }
      perPlayer.set(item.athlete.id, {
        athlete: item.athlete,
        teamId,
        stats: { match: values },
      });
    }
  }
  return perPlayer;
}

async function processGame(league: League, gameEspnId: string, touched: Map<string, string>) {
  const data = await fetchSummary(league, gameEspnId);
  const perPlayer = league === "epl" ? extractSoccer(data) : extractAmericanSports(data);
  if (perPlayer.size === 0) return 0;

  for (const { athlete, teamId, stats } of perPlayer.values()) {
    try {
      const slug = await uniqueSlugFor(league, athlete.id, athlete.displayName);
      await pool.query(
        `insert into players (league, espn_id, team_espn_id, name, slug, position, headshot_url)
         values ($1,$2,$3,$4,$5,$6,$7)
         on conflict (league, espn_id) do update set
           team_espn_id = excluded.team_espn_id, name = excluded.name,
           headshot_url = excluded.headshot_url`,
        [league, athlete.id, teamId, athlete.displayName, slug, null, athlete.headshot?.href ?? null]
      );

      await pool.query(
        `insert into player_game_stats (league, game_espn_id, player_espn_id, team_espn_id, stats, updated_at)
         values ($1,$2,$3,$4,$5, now())
         on conflict (league, game_espn_id, player_espn_id) do update set
           stats = excluded.stats, updated_at = now()`,
        [league, gameEspnId, athlete.id, teamId, JSON.stringify(stats)]
      );

      touched.set(athlete.id, teamId);
    } catch (err) {
      console.error(`[fetch-player-stats] ${league} player ${athlete.id} (${athlete.displayName}) failed:`, err);
    }
  }

  return perPlayer.size;
}

async function processLeague(league: League) {
  const { rows } = await pool.query(
    `select espn_id from games
     where league = $1 and completed = true and date > now() - interval '3 days'`,
    [league]
  );

  const touched = new Map<string, string>();
  let total = 0;
  for (const { espn_id } of rows) {
    try {
      total += await processGame(league, espn_id, touched);
    } catch (err) {
      console.error(`[fetch-player-stats] ${league} game ${espn_id} failed:`, err);
    }
  }
  console.log(`[fetch-player-stats] ${league}: processed ${rows.length} games, ${total} player-stat rows`);

  let seasonUpdates = 0;
  for (const [playerId, teamId] of touched) {
    try {
      if (await upsertPlayerSeasonStats(league, playerId, teamId)) seasonUpdates++;
    } catch (err) {
      console.error(`[fetch-player-stats] ${league} season stats for player ${playerId} failed:`, err);
    }
  }
  console.log(`[fetch-player-stats] ${league}: updated season stats for ${seasonUpdates}/${touched.size} players`);
}

async function main() {
  for (const league of LEAGUES) {
    try {
      await processLeague(league);
    } catch (err) {
      console.error(`[fetch-player-stats] ${league} failed:`, err instanceof Error ? err.message : err);
    }
  }
  await pool.end();
}

main().catch((err) => {
  console.error("[fetch-player-stats] failed:", err);
  process.exit(1);
});
