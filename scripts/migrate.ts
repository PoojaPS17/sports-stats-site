import { pool } from "./lib/db";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

async function main() {
  const sql = readFileSync(resolve(process.cwd(), "db/schema.sql"), "utf8");
  await pool.query(sql);
  console.log("[migrate] schema applied");
  await pool.end();
}

main().catch((err) => {
  console.error("[migrate] failed:", err);
  process.exit(1);
});
