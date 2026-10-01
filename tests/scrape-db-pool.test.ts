import { test } from "node:test";
import assert from "node:assert/strict";

// The scrapers' pool must survive PgBouncer closing an idle connection. On 2026-09-30 the
// daily job's fetch-player-stats step idled for eight minutes while it read ESPN, the idle
// client was terminated, and the pool's unhandled 'error' event crashed the process
// ("Connection terminated unexpectedly", thrown from node:events). The site's own pool in
// src/lib/db.ts already listens; the scrapers' pool must too.
test("the scrapers' pool survives an idle connection being closed under it", async () => {
  process.env.DATABASE_URL ??= "postgres://unused:unused@127.0.0.1:1/unused";
  const { pool } = await import("../scripts/lib/db");
  const warnings: string[] = [];
  const original = console.warn;
  console.warn = (msg: string) => { warnings.push(String(msg)); };
  try {
    assert.doesNotThrow(() => pool.emit("error", new Error("Connection terminated unexpectedly")));
  } finally {
    console.warn = original;
  }
  assert.ok(warnings.some((w) => w.includes("Connection terminated unexpectedly")), `expected the loss to be logged, got ${JSON.stringify(warnings)}`);
  await pool.end();
});
