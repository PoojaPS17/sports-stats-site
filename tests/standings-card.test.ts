import { before, test } from "node:test";
import assert from "node:assert/strict";
import { ImageResponse } from "next/og";
import type { League, StandingRow } from "../src/lib/queries";

// standingsCard imports the standings table component, which imports the database module: nothing here connects.
process.env.DATABASE_URL ??= "postgres://postgres:password@localhost:1/none";
let layoutStandings: typeof import("../src/lib/standingsCard").layoutStandings;
let standingsCardElement: typeof import("../src/lib/standingsCard").standingsCardElement;
let dotColor: typeof import("../src/lib/standingsCard").dotColor;
let SIZES: typeof import("../src/lib/standingsCard").STANDINGS_CARD_SIZES;
let CARD_FONTS: typeof import("../src/lib/cardFont").CARD_FONTS;
before(async () => {
  ({ layoutStandings, standingsCardElement, dotColor, STANDINGS_CARD_SIZES: SIZES } = await import("../src/lib/standingsCard"));
  ({ CARD_FONTS } = await import("../src/lib/cardFont"));
});

function row(i: number, o: Partial<StandingRow> = {}): StandingRow {
  return { season: 2026, team_espn_id: String(i), name: `Team ${i}`, slug: `team-${i}`, abbreviation: `T${i}`, logo_url: null, color: "1d428a", conference: null, division: null, wins: 10 - i, losses: i, win_percent: String((10 - i) / 10), streak: null, playoff_seed: null, draws: null, points: null, goals_for: null, goals_against: null, no_result: null, net_run_rate: null, rank: i + 1, zone: null, ...o };
}
const table = (n: number, o: (i: number) => Partial<StandingRow> = () => ({})) => Array.from({ length: n }, (_, i) => row(i, o(i)));

test("a single table shows as many rows as fit, in the page's order, numbered from one", () => {
  const { columns, hiddenGroups } = layoutStandings("epl", table(20, () => ({ points: 30 })), "portrait");
  assert.equal(columns.length, 1);
  assert.equal(columns[0].length, 1);
  assert.equal(columns[0][0].rows.length, 20);
  assert.equal(columns[0][0].hidden, 0);
  assert.deepEqual(columns[0][0].rows.slice(0, 2).map((r) => [r.position, r.name]), [[1, "Team 0"], [2, "Team 1"]]);
  assert.equal(hiddenGroups, 0);
  const wide = layoutStandings("epl", table(20, () => ({ points: 30 })), "og");
  assert.ok(wide.columns[0][0].rows.length < 20 && wide.columns[0][0].hidden > 0);
});

test("football shows points first and the record as wins-draws-losses", () => {
  const { columns } = layoutStandings("epl", table(4, () => ({ points: 61, wins: 18, draws: 7, losses: 3 })), "portrait");
  assert.deepEqual([columns[0][0].rows[0].primary, columns[0][0].rows[0].secondary], ["61", "18-7-3"]);
});

test("an American league shows the record and the win percentage, with ties only where the sport has them", () => {
  const nba = layoutStandings("nba", table(3, () => ({ wins: 50, losses: 32, win_percent: "0.6097560975609756" })), "portrait").columns[0][0].rows[0];
  assert.deepEqual([nba.primary, nba.secondary], ["50-32", ".610"]);
  const nfl = layoutStandings("nfl", table(3, () => ({ wins: 9, losses: 7, draws: 1, win_percent: "0.5588" })), "portrait").columns[0][0].rows[0];
  assert.deepEqual([nfl.primary, nfl.secondary], ["9-7-1", ".559"]);
});

test("a league with divisions fills two columns with the top of each division and leaves out what does not fit", () => {
  const nfl = Array.from({ length: 8 }, (_, d) => table(4, () => ({ division: `${d < 4 ? "AFC" : "NFC"} ${["East", "North", "South", "West"][d % 4]}` })).map((r, i) => ({ ...r, team_espn_id: `${d}-${i}`, name: `D${d} T${i}` }))).flat();
  const portrait = layoutStandings("nfl", nfl, "portrait");
  assert.equal(portrait.columns.length, 2);
  assert.equal(portrait.hiddenGroups, 0);
  assert.equal(portrait.columns.flat().length, 8);
  const og = layoutStandings("nfl", nfl, "og");
  assert.ok(og.hiddenGroups > 0, "the short image cannot hold all eight divisions");
  assert.ok(og.columns.flat().every((s) => s.rows.length >= 3));
});

test("a team colour the feed got wrong falls back to grey instead of reaching the image", () => {
  assert.equal(dotColor("1d428a"), "#1d428a");
  assert.equal(dotColor("#1D428A"), "#1D428A");
  for (const bad of [null, undefined, "", "blue", "12345", "ggg000"]) assert.equal(dotColor(bad), "#6b7690", String(bad));
});

async function draw(league: League, rows: StandingRow[], format: "og" | "portrait") {
  const res = new ImageResponse(standingsCardElement({ league, standings: rows, subtitle: "2025-26 season", format }), { ...SIZES[format], fonts: CARD_FONTS });
  return res.arrayBuffer();
}

// The renderer throws on an element with several children and no explicit display, which no type check sees: draw the
// real card the way the route does, for each kind of table and both sizes.
test("the card really draws for a football table, an American table and a divided table, in both sizes", async () => {
  const nfl = Array.from({ length: 8 }, (_, d) => table(4, () => ({ division: `Division ${d}` })).map((r, i) => ({ ...r, team_espn_id: `${d}-${i}` }))).flat();
  for (const format of ["og", "portrait"] as const) {
    assert.ok((await draw("epl", table(20, () => ({ points: 40, draws: 5 })), format)).byteLength > 1000, `epl ${format}`);
    assert.ok((await draw("nba", table(15, () => ({ conference: "East" })), format)).byteLength > 1000, `nba ${format}`);
    assert.ok((await draw("nfl", nfl, format)).byteLength > 1000, `nfl ${format}`);
  }
});

test("it draws a team with a long name and no colour, and a table of one team", async () => {
  const rows = [row(0, { name: "Borussia Mönchengladbach and Friends of Football", color: null })];
  assert.ok((await draw("bundesliga", rows, "og")).byteLength > 1000);
});
