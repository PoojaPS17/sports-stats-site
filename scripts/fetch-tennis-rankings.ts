import { pool } from "./lib/db";
import { fetchTennisRankings, fetchByRef, pruneStaleRankings, upsertRanking, type Tour } from "./lib/tennis";
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
  // Which ranking this is: ESPN's week number and its lastUpdated (a Thursday; the tour publishes the Monday after).
  const meta = { week: typeof data.occurrence?.number === "number" ? data.occurrence.number : null, lastUpdated: typeof data.lastUpdated === "string" ? data.lastUpdated : null };
  let count = 0;
  const storedIds: string[] = [];
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

      await upsertRanking(pool, tour, athlete.id, r, meta);
      count++;
      storedIds.push(String(athlete.id));
    } catch (err) {
      console.error(`[fetch-tennis-rankings] ${tour} rank ${r.current} failed:`, err instanceof Error ? err.message : err);
    }
  }
  console.log(`[fetch-tennis-rankings] ${tour}: upserted ${count}/${ranks.length} ranked players`);

  // Remove players who left the top 100 so their old rank does not linger next to the real holder of that rank.
  // Only when every ranked entry was stored: a partial run must not delete players it simply failed to reach.
  if (count === ranks.length && count > 0) {
    const pruned = await pruneStaleRankings(pool, tour, storedIds);
    console.log(`[fetch-tennis-rankings] ${tour}: pruned ${pruned} players no longer ranked`);
  } else {
    console.log(`[fetch-tennis-rankings] ${tour}: pruning skipped because some entries were not stored (${count}/${ranks.length})`);
  }
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
