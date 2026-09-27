import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// The sitemaps publish `updated_at` as <lastmod>. An `on conflict ... do update` with no
// change check rewrites the row on every scrape pass, so the timestamp records when the
// scraper looked at the row rather than when the row changed -- and every page in the
// sitemap ends up claiming it changed on the last scrape. A `where (...) is distinct from
// (...)` on the DO UPDATE skips the write entirely when nothing moved, which keeps lastmod
// honest and saves the write.
//
// This walks the ingest sources rather than the database so a new upsert cannot quietly
// reintroduce the problem.

const ROOT = join(import.meta.dirname, "..", "scripts");

function sqlLiterals(dir: string): { file: string; sql: string }[] {
  const out: { file: string; sql: string }[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      out.push(...sqlLiterals(path));
      continue;
    }
    if (!name.endsWith(".ts")) continue;
    const src = readFileSync(path, "utf8");
    for (const [sql] of src.matchAll(/`[^`]*`/g)) out.push({ file: relative(ROOT, path), sql });
  }
  return out;
}

test("every upsert that bumps updated_at only does so when a value actually changed", () => {
  const unguarded = sqlLiterals(ROOT)
    .filter(({ sql }) => /on conflict/i.test(sql) && /updated_at\s*=\s*now\(\)/i.test(sql))
    .filter(({ sql }) => !/is distinct from/i.test(sql))
    .map(({ file, sql }) => `${file}: ${(sql.match(/insert into\s+(\w+)/i)?.[1] ?? "?")}`);

  assert.deepEqual([...new Set(unguarded)], []);
});
