import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { startTestDb, type TestDb } from "./helpers/testDb";

// A guarded upsert that is never reached by a test is never parsed by anything, so a
// malformed one ships silently and only fails when that scraper next runs. PREPARE makes
// Postgres parse and plan the statement -- checking the syntax, the table and every column
// named in the guard -- without writing a row.
//
// Only "could not determine data type of parameter" is tolerated: an untyped $n in a
// position Postgres cannot infer says nothing about whether the statement is well formed.
const INDETERMINATE_PARAM = "42P18";
const ROOT = join(import.meta.dirname, "..", "scripts");

/**
 * The bulk inserts build their VALUES list at runtime (`values ${tuples.join(",")}`), and a
 * statement with a hole in it cannot be parsed. Standing one tuple of the right width in
 * the hole makes it a real statement again; Postgres infers each parameter's type from the
 * column it is being inserted into, so no casts are needed.
 */
function buildable(sql: string): string {
  if (!sql.includes("${")) return sql;
  const columns = sql.match(/insert into\s+\w+\s*\(([^)]*)\)/i)?.[1];
  if (!columns) return sql;
  const width = columns.split(",").length;
  const tuple = `(${Array.from({ length: width }, (_, i) => `$${i + 1}`).join(",")})`;
  return sql.replace(/\$\{[^}]*\}/g, tuple);
}

function guardedStatements(dir: string): { file: string; sql: string }[] {
  const out: { file: string; sql: string }[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      out.push(...guardedStatements(path));
      continue;
    }
    if (!name.endsWith(".ts")) continue;
    for (const [lit] of readFileSync(path, "utf8").matchAll(/`[^`]*`/g)) {
      const sql = lit.slice(1, -1);
      if (!/is distinct from/i.test(sql)) continue;
      if (!/^\s*(insert|update)\s/i.test(sql)) continue;
      out.push({ file: relative(ROOT, path), sql: buildable(sql) });
    }
  }
  return out;
}

let db: TestDb;
before(async () => {
  db = await startTestDb();
});
after(async () => {
  await db?.stop();
});

test("every guarded upsert is valid SQL against the real schema", async () => {
  const statements = guardedStatements(ROOT);
  assert.ok(statements.length >= 20, `expected the guarded statements to be found, saw ${statements.length}`);

  const broken: string[] = [];
  for (const [i, { file, sql }] of statements.entries()) {
    try {
      await db.pool.query(`prepare check_${i} as ${sql}`);
    } catch (err) {
      const { code, message } = err as { code?: string; message?: string };
      if (code === INDETERMINATE_PARAM) continue;
      broken.push(`${file}: [${code}] ${message}`);
    }
  }

  assert.deepEqual(broken, []);
});
