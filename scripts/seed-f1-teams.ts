import { pool } from "./lib/db";
import { fetchF1Teams } from "./lib/f1";
import { upsertTeam } from "./lib/teams";

async function main() {
  const data = await fetchF1Teams();
  const teams = data.sports?.[0]?.leagues?.[0]?.teams ?? [];
  for (const { team } of teams) await upsertTeam("f1", team);
  console.log(`[seed-f1-teams] upserted ${teams.length} constructors`);
  await pool.end();
}

main().catch((err) => {
  console.error("[seed-f1-teams] failed:", err);
  process.exit(1);
});
