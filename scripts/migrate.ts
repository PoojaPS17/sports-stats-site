import { pool } from "./lib/db";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { applySchema } from "./lib/applySchema";

async function main() {
  const sql = readFileSync(resolve(process.cwd(), "db/schema.sql"), "utf8");
  const result = await applySchema(pool, sql);
  const short = result.hash.slice(0, 12);
  if (result.outcome === "unchanged") console.log(`[migrate] schema unchanged (${short}), nothing to apply`);
  else console.log(`[migrate] schema applied (${short})${result.attempts > 1 ? ` after ${result.attempts} attempts` : ""}`);
  await pool.end();
}

main().catch((err) => {
  console.error("[migrate] failed:", err);
  process.exit(1);
});
