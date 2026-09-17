// Driver and Constructor championship standings for the current season. Each entry
// references its driver/constructor only by a $ref URL (no inline name) — the numeric
// id is pulled straight out of that URL rather than dereferencing it, since the
// driver/constructor themselves are already upserted by fetch-f1-scores.ts /
// seed-f1-teams.ts and this only needs to reference their existing espn_id.
import { pool } from "./lib/db";
import { fetchF1Standings, fetchByRef } from "./lib/f1";

function extractEntityId(ref: string | undefined): string | null {
  const m = ref?.match(/\/(athletes|manufacturers)\/(\d+)/);
  return m ? m[2] : null;
}

function statValue(stats: any[], name: string): number | null {
  const stat = stats.find((s: any) => s.name === name);
  return typeof stat?.value === "number" ? stat.value : null;
}

async function processGroup(seasonYear: number, groupRef: string) {
  const group = await fetchByRef<any>(groupRef);
  const type: "driver" | "constructor" = group.id === "0" ? "driver" : "constructor";

  let count = 0;
  for (const entry of group.standings ?? []) {
    const entityId = extractEntityId(entry.athlete?.["$ref"]) ?? extractEntityId(entry.manufacturer?.["$ref"]);
    if (!entityId) continue;
    const stats = entry.records?.[0]?.stats ?? [];
    const position = statValue(stats, "rank");
    const points = statValue(stats, "championshipPts") ?? statValue(stats, "points");
    const wins = statValue(stats, "wins");

    await pool.query(
      `insert into f1_standings (season_year, standings_type, entity_espn_id, position, points, wins, updated_at)
       values ($1, $2, $3, $4, $5, $6, now())
       on conflict (season_year, standings_type, entity_espn_id) do update set
         position = excluded.position, points = excluded.points, wins = excluded.wins, updated_at = now()`,
      [seasonYear, type, entityId, position, points, wins]
    );
    count++;
  }
  console.log(`[fetch-f1-standings] ${seasonYear} ${type}: ${count} rows`);
}

async function main() {
  const seasonYear = new Date().getUTCFullYear();
  const data = await fetchF1Standings(seasonYear);
  for (const item of data.items ?? []) {
    try {
      await processGroup(seasonYear, item["$ref"]);
    } catch (err) {
      console.error(`[fetch-f1-standings] group failed:`, err instanceof Error ? err.message : err);
    }
  }
  await pool.end();
}

main().catch((err) => {
  console.error("[fetch-f1-standings] failed:", err);
  process.exit(1);
});
