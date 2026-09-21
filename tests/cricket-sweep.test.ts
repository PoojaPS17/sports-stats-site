import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { startTestDb, type TestDb } from "./helpers/testDb";

let db: TestDb;
let sweep: typeof import("../scripts/lib/season-sweep");
let games: typeof import("../scripts/lib/games");
before(async () => {
  db = await startTestDb();
  sweep = await import("../scripts/lib/season-sweep");
  games = await import("../scripts/lib/games");
});
after(async () => {
  await (await import("../scripts/lib/db")).pool.end();
  await db?.stop();
});
beforeEach(async () => {
  await db.pool.query("delete from games");
  await db.pool.query("delete from teams");
  await db.pool.query("delete from player_game_stats");
});

// A finished WBBL match as ESPN's scoreboard?season=2025 lists it.
function wbblEvent(id: string, description: string, over: { summary?: string; homeScore?: string } = {}) {
  return {
    id,
    date: "2025-12-13T02:00:00Z",
    name: "Hurricanes v Sixers",
    season: { year: 2025 },
    description,
    competitions: [
      {
        competitors: [
          { homeAway: "home", winner: true, score: over.homeScore ?? "150/4", team: { id: "896433", displayName: "Hobart Hurricanes Women", abbreviation: "HH-W" } },
          { homeAway: "away", winner: false, score: "149/8", team: { id: "896403", displayName: "Sydney Sixers Women", abbreviation: "SS-W" } },
        ],
        status: { summary: over.summary ?? "Hobart Hurricanes Women won by 6 wickets", type: { state: "post", detail: "Final" } },
      },
    ],
  };
}

// Records what the sweep asked ESPN for; `feed` says what each (league, season) answers.
function fake(feed: (league: string, season: number, attempt: number) => { events?: unknown[] } | Error) {
  const calls: { league: string; season: number; bypassCache: boolean }[] = [];
  const attempts = new Map<string, number>();
  const deps = {
    fetchSeason: async (league: string, season: number, options: { bypassCache: boolean }) => {
      calls.push({ league, season, bypassCache: options.bypassCache });
      const key = `${league}-${season}`;
      const attempt = (attempts.get(key) ?? 0) + 1;
      attempts.set(key, attempt);
      const answer = feed(league, season, attempt);
      if (answer instanceof Error) throw answer;
      return answer;
    },
    upsert: (league: string, ev: unknown) => games.upsertEvent(league as never, ev),
    sleep: async () => {},
  };
  return { deps: deps as never, calls };
}
const stored = async (league: string) => (await db.pool.query(`select espn_id, round, home_score, status_summary, completed, season_year from games where league = $1 order by espn_id`, [league])).rows;

test("a match ESPN lists and the database lacks is inserted through upsertEvent, with its round", async () => {
  const { deps } = fake((l, season) => ({ events: season === 2025 ? [wbblEvent("1494526", "Final, Women's Big Bash League at Hobart, Dec 13 2025"), wbblEvent("1494527", "3rd Match (D/N), Women's Big Bash League at Perth, Oct 27 2025")] : [] }));
  const out = await sweep.sweepSeason("wbbl", 2025, deps);
  assert.deepEqual([out.listed, out.missing, out.added, out.error], [2, 2, 2, undefined]);
  assert.deepEqual(await stored("wbbl"), [
    { espn_id: "1494526", round: "Final", home_score: 150, status_summary: "Hobart Hurricanes Women won by 6 wickets", completed: true, season_year: 2025 },
    { espn_id: "1494527", round: "Match 3", home_score: 150, status_summary: "Hobart Hurricanes Women won by 6 wickets", completed: true, season_year: 2025 },
  ]);
  const { rows: teams } = await db.pool.query(`select espn_id from teams where league = 'wbbl' order by espn_id`);
  assert.deepEqual(teams.map((t) => t.espn_id), ["896403", "896433"], "the sides come with it, so the game page resolves");
});

test("a stored game is left exactly as it was, even when the feed's copy differs", async () => {
  await games.upsertEvent("wbbl", wbblEvent("1494526", "Final, Women's Big Bash League at Hobart, Dec 13 2025"));
  await db.pool.query(`update games set home_score = 1, status_summary = 'edited by the score scrape', round = null, updated_at = '2020-01-01' where espn_id = '1494526'`);
  const before = (await db.pool.query(`select * from games where espn_id = '1494526'`)).rows[0];
  const { deps } = fake(() => ({ events: [wbblEvent("1494526", "Final, Women's Big Bash League at Hobart, Dec 13 2025", { homeScore: "999/0", summary: "changed" }), wbblEvent("1494528", "Match 9, Women's Big Bash League at Perth, Nov 2 2025")] }));
  const out = await sweep.sweepSeason("wbbl", 2025, deps);
  assert.deepEqual([out.listed, out.missing, out.added], [2, 1, 1]);
  assert.deepEqual((await db.pool.query(`select * from games where espn_id = '1494526'`)).rows[0], before, "the stored row is byte for byte the same");
  assert.deepEqual((await stored("wbbl")).map((r) => r.espn_id), ["1494526", "1494528"]);
});

test("a second run finds nothing missing and changes nothing", async () => {
  const { deps } = fake(() => ({ events: [wbblEvent("1494526", "Final, Women's Big Bash League at Hobart, Dec 13 2025")] }));
  assert.equal((await sweep.sweepSeason("wbbl", 2025, deps)).added, 1);
  const again = await sweep.sweepSeason("wbbl", 2025, deps);
  assert.deepEqual([again.listed, again.missing, again.added], [1, 0, 0]);
});

test("the sweep asks each of the eight competitions for the previous and the current season, and only those", async () => {
  const { deps, calls } = fake(() => ({ events: [] }));
  const results = await sweep.sweepCricketSeasons({ deps, seasons: sweep.seasonsToSweep(new Date("2026-09-21T06:00:00Z")) });
  assert.equal(results.length, 16);
  assert.deepEqual([...new Set(calls.map((c) => c.league))].sort(), ["bbl", "cwc", "ipl", "t20wc", "wbbl", "wcwc", "wpl", "wt20wc"]);
  assert.deepEqual([...new Set(calls.map((c) => c.season))], [2025, 2026]);
  assert.equal(calls.length, 16, "two requests per competition when ESPN answers");
  assert.ok(calls.every((c) => !c.bypassCache));
  assert.deepEqual(sweep.seasonsToSweep(new Date("2027-01-03T00:00:00Z")), [2026, 2027]);
});

test("a half-hydrated season (bare {} entries) is asked again with the cache bypassed, and its complete copy is used", async () => {
  const { deps, calls } = fake((l, s, attempt) => ({ events: attempt === 1 ? [wbblEvent("1494526", "Final, Women's Big Bash League at Hobart, Dec 13 2025"), {}] : [wbblEvent("1494526", "Final, Women's Big Bash League at Hobart, Dec 13 2025"), wbblEvent("1494529", "Match 10, Women's Big Bash League at Perth, Nov 3 2025")] }));
  const out = await sweep.sweepSeason("wbbl", 2025, deps);
  assert.deepEqual(calls.map((c) => c.bypassCache), [false, true]);
  assert.deepEqual([out.listed, out.added, out.error], [2, 2, undefined]);
});

test("a season that never hydrates still adds the matches it has, and is reported", async () => {
  const { deps, calls } = fake(() => ({ events: [wbblEvent("1494526", "Final, Women's Big Bash League at Hobart, Dec 13 2025"), {}] }));
  const out = await sweep.sweepSeason("wbbl", 2025, deps);
  assert.equal(calls.length, 3);
  assert.equal(out.added, 1);
  assert.match(out.error ?? "", /1 of 2 matches had content/);
});

test("a failing request is retried and then reported; the other competitions still run", async () => {
  const { deps } = fake((league) => (league === "ipl" ? new Error("ESPN request failed (504)") : { events: league === "wbbl" ? [wbblEvent("1494526", "Final, Women's Big Bash League at Hobart, Dec 13 2025")] : [] }));
  const results = await sweep.sweepCricketSeasons({ deps, seasons: [2025] });
  const ipl = results.find((r) => r.league === "ipl")!;
  assert.match(ipl.error ?? "", /504/);
  assert.equal(results.find((r) => r.league === "wbbl")!.added, 1);
  assert.equal(results.filter((r) => r.error).length, 1);
});

test("an event with no sides yet is not stored, and no player rows are created", async () => {
  const tba = wbblEvent("1494599", "Semi-final, Women's Big Bash League at Perth, Dec 10 2025");
  tba.competitions[0].competitors[0].team.displayName = "TBA";
  const { deps } = fake(() => ({ events: [tba, wbblEvent("1494526", "Final, Women's Big Bash League at Hobart, Dec 13 2025")] }));
  const out = await sweep.sweepSeason("wbbl", 2025, deps);
  assert.deepEqual([out.missing, out.added], [2, 1], "the placeholder is missing but was not written");
  assert.deepEqual((await stored("wbbl")).map((r) => r.espn_id), ["1494526"]);
  assert.equal((await db.pool.query(`select count(*)::int as n from player_game_stats`)).rows[0].n, 0);
});

test("re-running the games backfill on a stored game with no round fills it (upsertEvent coalesces the round)", async () => {
  await games.upsertEvent("wbbl", wbblEvent("1494526", "Final (N), Women's Big Bash League at Hobart, Dec 13 2025"));
  await db.pool.query(`update games set round = null where espn_id = '1494526'`);
  await games.upsertEvent("wbbl", wbblEvent("1494526", "Final, Women's Big Bash League at Hobart, Dec 13 2025"));
  assert.equal((await stored("wbbl"))[0].round, "Final");
  // ...and a later feed with no recognisable stage never erases it.
  await games.upsertEvent("wbbl", wbblEvent("1494526", "Women's Big Bash League at Hobart, Dec 13 2025"));
  assert.equal((await stored("wbbl"))[0].round, "Final");
});

test("the daily jobs run the sweep: package script, VM job and the manual workflow", () => {
  const pkg = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8"));
  assert.equal(pkg.scripts["sweep:cricket-seasons"], "tsx scripts/sweep-cricket-seasons.ts");
  const vm = readFileSync(resolve(process.cwd(), "deploy/vm/scrape.sh"), "utf8");
  const daily = vm.slice(vm.indexOf("job_daily()"), vm.indexOf("job_hourly()"));
  assert.match(daily, /^\s+run sweep:cricket-seasons$/m);
  assert.doesNotMatch(vm.slice(vm.indexOf("job_tick()"), vm.indexOf("job_daily()")), /sweep:cricket-seasons/);
  const yml = readFileSync(resolve(process.cwd(), ".github/workflows/scrape.yml"), "utf8");
  const step = yml.slice(yml.indexOf("- name: Fill missing cricket competition games"));
  assert.match(step.slice(0, step.indexOf("\n\n")), /continue-on-error: true/, "a failed sweep must not skip the steps after it");
  assert.match(step.slice(0, step.indexOf("\n\n")), /if: github\.event\.schedule == '7 6 \* \* \*' \|\| github\.event_name == 'workflow_dispatch'[\s\S]*DATABASE_URL: \$\{\{ secrets\.DATABASE_URL \}\}[\s\S]*run: npm run sweep:cricket-seasons/);
});
