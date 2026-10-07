import { before, test } from "node:test";
import assert from "node:assert/strict";
import { ImageResponse } from "next/og";
import type { LeaderRow } from "../src/lib/queries";
import type { LeaderBoardView } from "../src/lib/leadersView";

// leadersCard reads the leader formatting, which imports the database module: nothing here connects.
process.env.DATABASE_URL ??= "postgres://postgres:password@localhost:1/none";
let layoutLeaders: typeof import("../src/lib/leadersCard").layoutLeaders;
let leadersCardElement: typeof import("../src/lib/leadersCard").leadersCardElement;
let SIZES: typeof import("../src/lib/chartCard").CHART_CARD_SIZES;
let CARD_FONTS: typeof import("../src/lib/cardFont").CARD_FONTS;
before(async () => {
  ({ layoutLeaders, leadersCardElement } = await import("../src/lib/leadersCard"));
  ({ CHART_CARD_SIZES: SIZES } = await import("../src/lib/chartCard"));
  ({ CARD_FONTS } = await import("../src/lib/cardFont"));
});

const row = (i: number, o: Partial<LeaderRow> = {}): LeaderRow => ({ player_espn_id: String(i), name: `Player ${i}`, slug: `p-${i}`, headshot_url: null, team_name: "Team", team_slug: "team", value: 30 - i, rank: i + 1, ...o });
const board = (label: string, unit: string, n: number, o: (i: number) => Partial<LeaderRow> = () => ({})): LeaderBoardView => ({ label, unit, rows: Array.from({ length: n }, (_, i) => row(i, o(i))) });

test("three boards share two columns and every board shows the same number of rows", () => {
  const { columns, hiddenGroups } = layoutLeaders([board("Points", "PPG", 10), board("Rebounds", "RPG", 10), board("Assists", "APG", 10)], "portrait");
  assert.equal(columns.length, 2);
  assert.equal(hiddenGroups, 0);
  const lengths = columns.flat().map((s) => s.rows.length);
  assert.equal(new Set(lengths).size, 1);
  assert.ok(lengths[0] >= 8);
  assert.deepEqual(columns.flat().map((s) => s.title), ["Points (PPG)", "Rebounds (RPG)", "Assists (APG)"]);
});

test("the unit is in the heading and the value is formatted like the page", () => {
  const { columns } = layoutLeaders([board("Points", "PPG", 3, () => ({ value: 31.456 }))], "portrait");
  assert.equal(columns[0][0].rows[0].primary, "31.5");
  assert.equal(columns[0][0].rows[0].secondary, undefined);
});

test("tied players keep the shared rank the page prints", () => {
  const { columns } = layoutLeaders([board("Goals", "G", 4, (i) => ({ rank: i === 2 ? 2 : i === 3 ? 4 : i + 1 }))], "portrait");
  assert.deepEqual(columns[0][0].rows.map((r) => r.position), ["1", "2", "2", "4"]);
});

test("a board with no rows is left out instead of drawn empty", () => {
  const { columns } = layoutLeaders([board("Points", "PPG", 5), board("Rebounds", "RPG", 0)], "portrait");
  assert.deepEqual(columns.flat().map((s) => s.title), ["Points (PPG)"]);
});

test("the short image shows fewer rows per board than the tall one", () => {
  const boards = [board("Points", "PPG", 10), board("Rebounds", "RPG", 10), board("Assists", "APG", 10)];
  const tall = layoutLeaders(boards, "portrait").columns.flat()[0].rows.length;
  const short = layoutLeaders(boards, "og").columns.flat()[0].rows.length;
  assert.ok(short < tall && short >= 3);
});

// The renderer throws on an element with several children and no explicit display, which no type check sees: draw the
// real card the way the route does, for several board counts and both sizes.
test("the card really draws for one, three and eight boards in both sizes, and with a long name", async () => {
  const sets = [[board("Points", "PPG", 10)], [board("Points", "PPG", 10), board("Rebounds", "RPG", 10), board("Assists", "APG", 10)], Array.from({ length: 8 }, (_, i) => board(`Board ${i}`, "YDS", 10))];
  for (const format of ["og", "portrait"] as const) {
    for (const boards of sets) {
      const res = new ImageResponse(leadersCardElement({ league: "nba", season: 2026, boards, format }), { ...SIZES[format], fonts: CARD_FONTS });
      assert.ok((await res.arrayBuffer()).byteLength > 1000, `${boards.length} boards ${format}`);
    }
  }
  const long = board("Points", "PPG", 3, () => ({ name: "Shai Gilgeous-Alexander and Several Other Long Names" }));
  const res = new ImageResponse(leadersCardElement({ league: "nba", season: null, boards: [long], format: "og" }), { ...SIZES.og, fonts: CARD_FONTS });
  assert.ok((await res.arrayBuffer()).byteLength > 1000);
});
