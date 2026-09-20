// Read-only report: how old is the newest row of every table that stamps updated_at / fetched_at.
// Used as the "before" snapshot for the freshness work and re-run after each rollout step.
import { pool } from "./lib/db";

async function main() {
  const { rows: cols } = await pool.query(
    `select table_name, column_name from information_schema.columns
     where table_schema = 'public' and column_name in ('updated_at', 'fetched_at')
     order by table_name`
  );
  const out: { table: string; newest: Date | null; ageHours: number | null }[] = [];
  for (const { table_name, column_name } of cols) {
    const { rows } = await pool.query(`select max(${column_name}) as newest from ${table_name}`);
    const newest: Date | null = rows[0]?.newest ?? null;
    out.push({ table: table_name, newest, ageHours: newest ? (Date.now() - newest.getTime()) / 3_600_000 : null });
  }
  out.sort((a, b) => (b.ageHours ?? 1e9) - (a.ageHours ?? 1e9));
  for (const r of out) {
    console.log(`${r.table.padEnd(28)} ${r.newest ? r.newest.toISOString() : "(empty)"}  ${r.ageHours === null ? "" : r.ageHours.toFixed(1) + " h old"}`);
  }
  await pool.end();
}

main().catch((err) => {
  console.error("[audit-freshness] failed:", err);
  process.exit(1);
});
