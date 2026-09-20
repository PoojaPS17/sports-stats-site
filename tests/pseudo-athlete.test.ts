import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { startTestDb, type TestDb } from "./helpers/testDb";
import { outcome } from "./helpers/nextErrors";
import { isPseudoAthleteId, notPseudoAthleteSql } from "../src/lib/pseudoAthlete";
import { absoluteUrl } from "../src/lib/site";
import type { Matchweek } from "../src/lib/matchweeks";
import { parseAmericanPlayerBox } from "../src/lib/matchDetail";

// ESPN lists a team-credited line in some NFL box scores as an athlete with a negative id named "Team". The line
// stays in the game's box score (real ESPN data); it must not be a PLAYER anywhere: not in the players index,
// sitemaps, search, leaders, chips, compare, the roster, and its profile addresses 404. A real player next to it
// (including one whose name contains "Team", or with a legitimate id) is untouched.
//
// Fixture (NFL): team 1; real QB "Real QB" (100), real "Team Captain" (300, the name contains "Team"), and two
// pseudo-athletes (-8801 slug team--8801, -13974 slug team) with game rows and season rows that would top every
// board if they were let through. One pseudo also has a legacy slug, which must not redirect anywhere.
let db: TestDb;
let queries: typeof import("../src/lib/queries");
let related: typeof import("../src/lib/related");
let compare: typeof import("../src/lib/compare");
let matchweeks: typeof import("../src/lib/matchweeks");
let sitemap: typeof import("../src/lib/sitemap");
let trending: typeof import("../scripts/lib/trending");
let gameStats: typeof import("../scripts/lib/game-stats");
let playerPage: typeof import("../src/app/[league]/players/[slug]/page");
let seasonPage: typeof import("../src/app/[league]/players/[slug]/[season]/page");

const REAL = ["real-qb", "team-captain"];
const PSEUDO = ["team", "team--8801"];
const params = <T extends object>(p: T) => ({ params: Promise.resolve(p) });

before(async () => {
  db = await startTestDb();
  queries = await import("../src/lib/queries");
  related = await import("../src/lib/related");
  compare = await import("../src/lib/compare");
  matchweeks = await import("../src/lib/matchweeks");
  sitemap = await import("../src/lib/sitemap");
  trending = await import("../scripts/lib/trending");
  gameStats = await import("../scripts/lib/game-stats");
  playerPage = await import("../src/app/[league]/players/[slug]/page");
  seasonPage = await import("../src/app/[league]/players/[slug]/[season]/page");

  const q = (sql: string, args: unknown[] = []) => db.pool.query(sql, args);
  await q(`insert into teams (league, espn_id, name, slug) values ('nfl', '1', 'Home', 'home'), ('nfl', '2', 'Away', 'away')`);
  await q(
    `insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, season_year, completed)
     values ('nfl', 'g1', '2026-01-10T00:00:00Z', 'g1', '1', '2', 2026, true)`
  );
  const players: [string, string, string, string, string | null][] = [
    // espn_id, name, slug, position, legacy slug
    ["100", "Real QB", "real-qb", "QB", "real-qb-old"],
    ["300", "Team Captain", "team-captain", "QB", null],
    ["-8801", " Team", "team--8801", "QB", null],
    ["-13974", " Team", "team", "QB", "team-old"],
  ];
  for (const [id, name, slug, position, legacy] of players) {
    await q(`insert into players (league, espn_id, team_espn_id, name, slug, position, legacy_slug) values ('nfl', $1, '1', $2, $3, $4, $5)`, [id, name, slug, position, legacy]);
    // The pseudo-athletes' numbers are the biggest, so any board or list that lets them through shows them first.
    const big = id.startsWith("-") ? 9000 : 300;
    await q(`insert into player_game_stats (league, game_espn_id, player_espn_id, team_espn_id, stats) values ('nfl', 'g1', $1, '1', $2)`, [
      id,
      JSON.stringify({ passing: { YDS: String(big) } }),
    ]);
    await q(
      `insert into player_season_stats (league, season, player_espn_id, team_espn_id, categories, passing_yards) values ('nfl', 2026, $1, '1', '{}'::jsonb, $2)`,
      [id, big]
    );
  }
});

after(async () => {
  await (await import("../src/lib/db")).pool.end();
  await (await import("../scripts/lib/db")).pool.end();
  await db?.stop();
});

const slugsOf = (rows: { slug: string }[]) => rows.map((r) => r.slug).sort();

test("the predicate is one rule: an id that starts with a dash, never the name", () => {
  assert.equal(isPseudoAthleteId("-8801"), true);
  assert.equal(isPseudoAthleteId("-13974"), true);
  for (const id of ["8801", "100", "cs-abc", "name:Team", "", "1-2"]) assert.equal(isPseudoAthleteId(id), false, id);
  assert.equal(notPseudoAthleteSql(), "p.espn_id not like '-%'");
  assert.equal(notPseudoAthleteSql("espn_id"), "espn_id not like '-%'");
});

test("the SQL twin agrees with the TS helper on every id, and never looks at the name", async () => {
  const ids = ["-8801", "-13974", "100", "300", "cs-abc", "8801", "1-2", "-"];
  const { rows } = await db.pool.query(`select id, ${notPseudoAthleteSql("id")} as real from unnest($1::text[]) as id`, [ids]);
  for (const r of rows) assert.equal(r.real, !isPseudoAthleteId(r.id), r.id);
  // The name plays no part: both real and pseudo rows named "Team ..." exist in the table, and the split is by id.
  const { rows: named } = await db.pool.query(`select slug, ${notPseudoAthleteSql()} as real from players p where league = 'nfl' and name ilike '%team%' order by slug`);
  assert.deepEqual(named, [
    { slug: "team", real: false },
    { slug: "team--8801", real: false },
    { slug: "team-captain", real: true },
  ]);
});

test("players index: pseudo-athletes are absent, real players (even one named Team ...) are present", async () => {
  assert.deepEqual(slugsOf(await queries.getAllPlayers("nfl")), REAL);
});

test("search: a query for Team finds the real player named Team Captain and neither pseudo-athlete", async () => {
  const rows = await queries.search("Team");
  assert.deepEqual(slugsOf(rows.filter((r) => r.type === "player")), ["team-captain"]);
  assert.deepEqual(slugsOf((await queries.search("Real QB")).filter((r) => r.type === "player")), ["real-qb"]);
});

test("profile: no player row for a pseudo-athlete's slug, and its old slug does not redirect", async () => {
  for (const slug of PSEUDO) assert.equal(await queries.getPlayerBySlug("nfl", slug), null, slug);
  for (const slug of REAL) assert.equal((await queries.getPlayerBySlug("nfl", slug))?.slug, slug, slug);
  assert.equal(await queries.findPlayerSlugByLegacy("nfl", "team-old"), null);
  assert.equal(await queries.findPlayerSlugByLegacy("nfl", "real-qb-old"), "real-qb");
});

test("profile routes: /nfl/players/team, /team--8801 and /team--8801/2026 answer 404 (never a redirect)", async () => {
  for (const slug of [...PSEUDO, "team-old"]) {
    assert.equal(await outcome(() => playerPage.default(params({ league: "nfl", slug }))), "not-found", `/nfl/players/${slug}`);
    assert.equal(await outcome(() => seasonPage.default(params({ league: "nfl", slug, season: "2026" }))), "not-found", `/nfl/players/${slug}/2026`);
  }
  // Their metadata is empty as well: nothing to index.
  for (const slug of PSEUDO) assert.deepEqual(await playerPage.generateMetadata(params({ league: "nfl", slug })), {}, slug);
});

test("game page chips: a box-score line links to a player page only for a real player", async () => {
  const map = await queries.getPlayerSlugsByEspnIds("nfl", ["100", "300", "-8801", "-13974"]);
  assert.deepEqual([...map.keys()].sort(), ["100", "300"]);
});

test("leaders: pseudo-athletes with the biggest season figures are not on the board", async () => {
  const rows = await queries.getLeaders("nfl", "passing_yards", 10);
  assert.deepEqual(slugsOf(rows), REAL);
});

test("team roster: the team's roster lists real players only", async () => {
  assert.deepEqual(slugsOf(await queries.getTeamRoster("nfl", "1")), REAL);
});

test("chips: teammates, position peers and team top players exclude pseudo-athletes", async () => {
  // Teammates of Real QB: Team Captain only. Peers at QB: Team Captain (the one with a figure besides Real QB himself).
  assert.deepEqual((await related.getTeammates("nfl", "1", "100")).map((l) => l.href), ["/nfl/players/team-captain"]);
  assert.deepEqual((await related.getPositionPeers("nfl", "QB", "100")).map((l) => l.href), ["/nfl/players/team-captain"]);
  assert.deepEqual((await related.getTeamTopPlayers("nfl", "1")).map((l) => l.href).sort(), ["/nfl/players/real-qb", "/nfl/players/team-captain"]);
  assert.deepEqual((await related.getTeamTopPlayers("nfl", "1", 2026)).map((l) => l.href).sort(), ["/nfl/players/real-qb", "/nfl/players/team-captain"]);
});

test("week top performers: a Team line's yards do not top the board", async () => {
  const week = { games: [{ espn_id: "g1", completed: true }] } as unknown as Matchweek;
  const boards = await matchweeks.getWeekPerformers("nfl", week);
  const passing = boards.find((b) => b.title === "Passing yards");
  assert.deepEqual(slugsOf(passing?.rows ?? []), REAL);
});

test("compare: a pseudo-athlete cannot be picked or compared; two real players still compare", async () => {
  assert.equal(await compare.getPlayerLabel("nfl", "team--8801"), null);
  assert.equal(await compare.getPlayerLabel("nfl", "team"), null);
  assert.deepEqual(await compare.getPlayerLabel("nfl", "team-captain"), { slug: "team-captain", name: "Team Captain" });
  assert.equal(await compare.getPlayerComparison("nfl", "real-qb", "team--8801"), null);
  assert.equal(await compare.getPlayerComparison("nfl", "team", "real-qb"), null);
  assert.ok(await compare.getPlayerComparison("nfl", "real-qb", "team-captain"));
});

test("sitemaps: no pseudo-athlete's page is listed in any sitemap; the real players are", async () => {
  const listed = async (id: string) => new Set((await sitemap.sitemapEntries(id)).map((e) => e.url));
  const players = await listed("players-nfl");
  const seasons = await listed("pseasons-nfl");
  for (const slug of REAL) {
    assert.ok(players.has(absoluteUrl(`/nfl/players/${slug}`)), `players-nfl ${slug}`);
    assert.ok(seasons.has(absoluteUrl(`/nfl/players/${slug}/2026`)), `pseasons-nfl ${slug}`);
  }
  for (const slug of PSEUDO) {
    assert.ok(!players.has(absoluteUrl(`/nfl/players/${slug}`)), `players-nfl ${slug}`);
    assert.ok(!seasons.has(absoluteUrl(`/nfl/players/${slug}/2026`)), `pseasons-nfl ${slug}`);
  }
  // And nowhere else, whatever the sitemap.
  for (const id of sitemap.SITEMAP_IDS) {
    for (const url of await listed(id)) assert.ok(!/\/players\/team(--\d+)?(\/|$)/.test(url), `${id} lists ${url}`);
  }
});

test("trending: the name index that links a trending topic to a player leaves out pseudo-athletes", async () => {
  const index = await trending.loadEntityIndex(db.pool);
  assert.equal(index.byFullName.get("team")?.slug, undefined, "a Wikipedia article called Team is not a player");
  assert.equal(index.byFullName.get("team captain")?.slug, "team-captain");
  assert.equal(index.byFullName.get("real qb")?.slug, "real-qb");
});

// ---- The loader: the box-score line stays, the fake player is not created ----

const summary = {
  boxscore: {
    players: [
      {
        team: { id: "1" },
        statistics: [
          {
            name: "passing",
            labels: ["C/ATT", "YDS"],
            athletes: [
              { athlete: { id: "9001", displayName: "New Guy" }, stats: ["10/20", "150"] },
              { athlete: { id: "9002", displayName: "Team Leader" }, stats: ["1/2", "12"] },
            ],
          },
          {
            name: "rushing",
            labels: ["CAR", "YDS"],
            athletes: [{ athlete: { id: "-4242", displayName: "Team" }, stats: ["3", "-2"] }],
          },
        ],
      },
    ],
  },
};

test("the box-score reader keeps ESPN's Team line exactly as it is", () => {
  const perPlayer = gameStats.extractPlayerStats("nfl", summary);
  assert.deepEqual([...perPlayer.keys()].sort(), ["-4242", "9001", "9002"]);
  assert.deepEqual(perPlayer.get("-4242")?.stats, { rushing: { CAR: "3", YDS: "-2" } });
  // The game page's rows come from the same feed, not from the players table.
  const rows = parseAmericanPlayerBox(summary).flatMap((t) => t.categories.flatMap((c) => c.rows));
  assert.deepEqual(rows.find((r) => r.athleteId === "-4242"), { athleteId: "-4242", name: "Team", stats: ["3", "-2"] });
});

test("the loader stores a Team line's game row but creates no player for it; real players are stored as before", async () => {
  const perPlayer = gameStats.extractPlayerStats("nfl", summary);
  // A pseudo-athlete already stored by an earlier run keeps its row untouched (no rename, no team change).
  await db.pool.query(`insert into players (league, espn_id, team_espn_id, name, slug) values ('nfl', '-7777', '2', 'Old Name', 'team--7777')`);
  perPlayer.set("-7777", { athlete: { id: "-7777", displayName: "Team" }, teamId: "1", stats: { rushing: { CAR: "1", YDS: "0" } } });

  assert.equal(await gameStats.storeGameStats("nfl", "g-load", perPlayer, true), 4);

  const stored = await db.pool.query(`select player_espn_id, team_espn_id, stats from player_game_stats where league = 'nfl' and game_espn_id = 'g-load' order by player_espn_id`);
  assert.deepEqual(stored.rows.map((r) => r.player_espn_id), ["-4242", "-7777", "9001", "9002"], "every box-score line is stored");
  assert.deepEqual(stored.rows.find((r) => r.player_espn_id === "-4242")?.stats, { rushing: { CAR: "3", YDS: "-2" } });

  const made = await db.pool.query(`select espn_id, name, slug from players where league = 'nfl' and espn_id in ('-4242', '9001', '9002') order by espn_id`);
  assert.deepEqual(made.rows, [
    { espn_id: "9001", name: "New Guy", slug: "new-guy" },
    { espn_id: "9002", name: "Team Leader", slug: "team-leader" },
  ], "no players row for -4242; a real player whose name contains Team is created");
  const old = await db.pool.query(`select name, team_espn_id from players where league = 'nfl' and espn_id = '-7777'`);
  assert.deepEqual(old.rows, [{ name: "Old Name", team_espn_id: "2" }], "an existing row is not rewritten by the loader");

  // Running it again (a real player already known, team update on) still updates real players.
  const again = gameStats.extractPlayerStats("nfl", summary);
  again.get("9001")!.athlete = { id: "9001", displayName: "New Guy Jr" };
  await gameStats.storeGameStats("nfl", "g-load", again, true);
  assert.equal((await db.pool.query(`select name from players where league = 'nfl' and espn_id = '9001'`)).rows[0].name, "New Guy Jr");
  assert.equal((await db.pool.query(`select count(*)::int as n from players where league = 'nfl' and espn_id like '-%'`)).rows[0].n, 3, "-4242 was never created (the three from the fixture and the earlier run stay three)");
});

test("season totals are fetched for real athletes only (a pseudo-athlete has no ESPN athlete page)", () => {
  const perPlayer = gameStats.extractPlayerStats("nfl", summary);
  assert.deepEqual([...gameStats.seasonStatTargets(perPlayer)].sort(), [["9001", "1"], ["9002", "1"]]);
});

test("scripts that read the players table for ESPN requests or audits skip pseudo-athletes through the shared code", () => {
  // These are entry-point scripts (they run when imported), so their guard is checked in the source.
  const guards: [string, RegExp][] = [
    ["scripts/backfill-player-stats.ts", /notPseudoAthleteSql\(/],
    ["scripts/audit-player-totals.ts", /notPseudoAthleteSql\(/],
    ["scripts/fetch-player-stats.ts", /seasonStatTargets\(/],
  ];
  for (const [file, guard] of guards) assert.match(readFileSync(file, "utf8"), guard, `${file} applies the shared predicate`);
});
