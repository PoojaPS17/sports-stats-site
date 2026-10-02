// MLB standings: ESPN's American League / National League split into East, Central and West, the
// games-behind column baseball tables are read by, and the clinch letters ESPN marks rows with.
//
// The fixture is a real `?level=3` response captured on 2026-10-02 (AL East and NL West, trimmed to
// the fields the ingest reads). Crucially, the American League and National League nodes carry no
// `isConference` flag — the NFL's conferences do — so the group walk cannot rely on it.
import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { startTestDb, type TestDb } from "./helpers/testDb";
import { groupStandings, StandingsTable } from "../src/components/StandingsTable";
import { clinchLabel } from "../src/lib/standingsZones";
import type { StandingRow } from "../src/lib/queries";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/espn-mlb-standings-level3.json", import.meta.url), "utf8"));

let db: TestDb;
let standings: typeof import("../scripts/lib/standings");
before(async () => {
  db = await startTestDb();
  standings = await import("../scripts/lib/standings");
});
after(async () => {
  await db?.stop();
});
beforeEach(async () => {
  await db.pool.query("delete from standings");
});

const stored = async () =>
  (
    await db.pool.query(
      `select team_espn_id, conference, division, wins, losses, win_percent::float as pct, games_behind, streak, clinched, playoff_seed
       from standings where league = 'mlb' order by division, team_espn_id`,
    )
  ).rows;

test("the AL and NL become conferences, their East/Central/West groups divisions", async () => {
  const n = await standings.upsertStandingsResponse("mlb", fixture);
  assert.equal(n, 10, "five teams in each of the two divisions in the fixture");
  const rows = await stored();
  assert.deepEqual(
    [...new Set(rows.map((r) => `${r.conference} / ${r.division}`))].sort(),
    ["American League / American League East", "National League / National League West"],
  );
});

test("a games-behind figure, a streak and a clinch letter are stored as ESPN sends them", async () => {
  await standings.upsertStandingsResponse("mlb", fixture);
  const rows = await stored();
  const yankees = rows.find((r) => r.team_espn_id === "10");
  assert.ok(yankees);
  assert.equal(yankees.wins, 93);
  assert.equal(yankees.losses, 68);
  assert.equal(yankees.pct, 0.578);
  assert.equal(yankees.games_behind, "4.5");
  assert.equal(yankees.streak, "W1");
  assert.equal(yankees.clinched, "y");
  assert.equal(yankees.playoff_seed, 4);
  // The division leader's games behind is a dash, not a number, which is why the column is text.
  assert.ok(rows.some((r) => r.games_behind === "-"));
  // Every row in the fixture carries one of ESPN's four letters.
  assert.deepEqual([...new Set(rows.map((r) => r.clinched))].sort(), ["*", "e", "x", "y"]);
});

test("runs scored and allowed land in the for/against columns, and nothing ties", async () => {
  await standings.upsertStandingsResponse("mlb", fixture);
  const { rows } = await db.pool.query(`select goals_for, goals_against, draws from standings where league = 'mlb' and team_espn_id = '10'`);
  assert.deepEqual(rows, [{ goals_for: 739, goals_against: 601, draws: 0 }]);
});

test("the clinch letters read as words", () => {
  assert.equal(clinchLabel("y"), "Clinched division");
  assert.equal(clinchLabel("x"), "Clinched playoff berth");
  assert.equal(clinchLabel("w"), "Clinched wild card");
  assert.equal(clinchLabel("z"), "Clinched best record");
  assert.equal(clinchLabel("*"), "Clinched best record");
  assert.equal(clinchLabel("e"), "Eliminated");
  assert.equal(clinchLabel(null), null);
  assert.equal(clinchLabel("q"), null, "a letter we have no wording for is shown as nothing rather than guessed at");
});

// ---- rendering ----

const row = (over: Partial<StandingRow> & { team_espn_id: string; name: string; division: string }): StandingRow =>
  ({
    season: 2026,
    slug: over.name.toLowerCase().replace(/\s+/g, "-"),
    abbreviation: null,
    logo_url: null,
    color: null,
    conference: over.division.replace(/ (East|Central|West)$/, ""),
    wins: 90,
    losses: 72,
    win_percent: "0.556",
    streak: "W1",
    playoff_seed: null,
    draws: 0,
    points: null,
    goals_for: null,
    goals_against: null,
    no_result: null,
    net_run_rate: null,
    rank: null,
    zone: null,
    games_behind: "-",
    clinched: null,
    ...over,
  }) as StandingRow;

const SIX_DIVISIONS = ["American League East", "American League Central", "American League West", "National League East", "National League Central", "National League West"];
const table = SIX_DIVISIONS.flatMap((division, d) =>
  [0, 1, 2].map((i) => row({ team_espn_id: `${d}${i}`, name: `Team ${d}${i}`, division, wins: 95 - i * 5, losses: 67 + i * 5, games_behind: i === 0 ? "-" : String(i * 5), clinched: i === 0 ? "y" : null })),
);

test("MLB standings render as six division tables, in East, Central, West order within each league", () => {
  const { useDivisions, sections } = groupStandings("mlb", table);
  assert.equal(useDivisions, true);
  assert.deepEqual(sections.map(([name]) => name), SIX_DIVISIONS);
});

test("an MLB table has a games-behind column and the clinch markers, and the NFL's is untouched", () => {
  const html = renderToStaticMarkup(createElement(StandingsTable, { league: "mlb", standings: table }));
  assert.ok(html.includes(">GB<"), "a GB column header");
  assert.ok(html.includes("Clinched division"), "the marker's wording is in the title attribute and the legend");
  assert.ok(html.includes("American League Central"));

  const nfl = renderToStaticMarkup(createElement(StandingsTable, { league: "nfl", standings: table.map((r) => ({ ...r, division: r.division!.replace("American League", "AFC").replace("National League", "NFC") })) }));
  assert.ok(!nfl.includes(">GB<"), "the NFL table keeps its W-L-T, Pct and Streak columns only");
});
