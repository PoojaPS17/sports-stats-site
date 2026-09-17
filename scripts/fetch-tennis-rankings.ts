import { pool } from "./lib/db";
import { fetchTennisRankings, fetchByRef, type Tour } from "./lib/tennis";
import { uniqueSlugFor } from "./lib/players";

const TOURS: Tour[] = ["atp", "wta"];
const TOP_N = 100;

async function processTour(tour: Tour) {
  const data = await fetchTennisRankings(tour);
  if (!data) {
    console.log(`[fetch-tennis-rankings] ${tour}: no current rankings resource found`);
    return;
  }

  const ranks: any[] = (data.ranks ?? []).slice(0, TOP_N);
  let count = 0;
  for (const r of ranks) {
    const athleteRef = r.athlete?.["$ref"];
    if (!athleteRef) continue;
    try {
      const athlete = await fetchByRef<any>(athleteRef);
      const name = athlete.displayName ?? athlete.fullName;
      if (!name) continue;
      const slug = await uniqueSlugFor(tour, athlete.id, name);

      await pool.query(
        `insert into players (league, espn_id, name, slug, headshot_url)
         values ($1, $2, $3, $4, $5)
         on conflict (league, espn_id) do update set
           name = excluded.name, headshot_url = coalesce(excluded.headshot_url, players.headshot_url)`,
        [tour, athlete.id, name, slug, athlete.headshot?.href ?? null]
      );

      await pool.query(
        `insert into tennis_rankings (tour, player_espn_id, rank, previous_rank, points, updated_at)
         values ($1, $2, $3, $4, $5, now())
         on conflict (tour, player_espn_id) do update set
           rank = excluded.rank, previous_rank = excluded.previous_rank, points = excluded.points, updated_at = now()`,
        [tour, athlete.id, r.current, r.previous ?? null, r.points ?? null]
      );
      count++;
    } catch (err) {
      console.error(`[fetch-tennis-rankings] ${tour} rank ${r.current} failed:`, err instanceof Error ? err.message : err);
    }
  }
  console.log(`[fetch-tennis-rankings] ${tour}: upserted ${count}/${ranks.length} ranked players`);
}

async function main() {
  for (const tour of TOURS) {
    try {
      await processTour(tour);
    } catch (err) {
      console.error(`[fetch-tennis-rankings] ${tour} failed:`, err instanceof Error ? err.message : err);
    }
  }
  await pool.end();
}

main().catch((err) => {
  console.error("[fetch-tennis-rankings] failed:", err);
  process.exit(1);
});
