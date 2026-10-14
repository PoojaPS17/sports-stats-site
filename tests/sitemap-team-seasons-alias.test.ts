import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";

// Eswatini is stored twice (ESPN 300710 and the Cricsheet id cs-swaziland, see teamAliases.ts). The alias's
// pages redirect to the canonical team, so the teams sitemap must list the canonical team's season pages
// (including a season whose only games are stored under the alias id) and never the alias's own URLs.

let db: TestDb;
let sitemapEntries: (id: string) => Promise<{ url: string }[]>;

before(async () => {
  db = await startTestDb();
  ({ sitemapEntries } = await import("../src/lib/sitemap"));
  await db.pool.query(
    `insert into teams (league, espn_id, name, slug, abbreviation) values
       ('t20i','300710','Eswatini','eswatini','SWZ'), ('t20i','cs-swaziland','Swaziland','swaziland','SWA'), ('t20i','120','Malawi','malawi','MWI')`,
  );
  await db.pool.query(
    `insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, season_year, completed) values
       ('t20i','old','2021-10-17','x','cs-swaziland','120',2021,true),
       ('t20i','new','2024-05-01','y','300710','120',2024,true)`,
  );
});

after(async () => {
  await (await import("../src/lib/db")).pool.end();
  await db.stop();
});

test("team-season pages follow the canonical team, not the redirecting alias", async () => {
  const urls = (await sitemapEntries("teams-t20i")).map((e) => e.url);
  assert.ok(urls.some((u) => u.endsWith("/t20i/teams/eswatini/2021")), "alias-only season belongs to the canonical team");
  assert.ok(urls.some((u) => u.endsWith("/t20i/teams/eswatini/2024")));
  assert.ok(urls.some((u) => u.endsWith("/t20i/teams/malawi/2021")));
  assert.ok(!urls.some((u) => u.includes("/teams/swaziland")), "the alias slug only redirects");
});
