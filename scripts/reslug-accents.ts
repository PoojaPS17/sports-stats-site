// One-off: re-slug every team and player whose name has accented letters, now that
// slugify strips accents instead of dropping the letter ("mbapp" → "mbappe"). The old
// slug is kept in legacy_slug so the pages can redirect it permanently.
import { pool } from "./lib/db";
import { slugify } from "./lib/espn";

async function reslug(table: "teams" | "players") {
  const { rows } = await pool.query(`select league, espn_id, name, slug, legacy_slug from ${table} where name ~ '[^\\x00-\\x7F]' order by league, name`);
  let changed = 0;
  for (const r of rows) {
    const base = slugify(r.name);
    if (!base || base === r.slug) continue;
    const { rows: clash } = await pool.query(`select 1 from ${table} where league = $1 and slug = $2 and espn_id <> $3`, [r.league, base, r.espn_id]);
    const next = clash.length ? `${base}-${r.espn_id}` : base;
    if (next === r.slug) continue;
    await pool.query(`update ${table} set slug = $4, legacy_slug = coalesce(legacy_slug, $3) where league = $1 and espn_id = $2`, [r.league, r.espn_id, r.slug, next]);
    changed += 1;
    if (changed <= 12 || table === "teams") console.log(`[reslug] ${table} ${r.league}: ${r.slug} → ${next}`);
  }
  console.log(`[reslug] ${table}: ${changed} of ${rows.length} accented names re-slugged`);
}

async function main() {
  await pool.query(`alter table players add column if not exists legacy_slug text`);
  await pool.query(`create index if not exists players_legacy_slug_idx on players (league, legacy_slug) where legacy_slug is not null`);
  await pool.query(`alter table teams add column if not exists legacy_slug text`);
  await pool.query(`create index if not exists teams_legacy_slug_idx on teams (league, legacy_slug) where legacy_slug is not null`);
  await reslug("teams");
  await reslug("players");
  await pool.end();
}

main().catch((err) => {
  console.error("[reslug] failed:", err);
  process.exit(1);
});
