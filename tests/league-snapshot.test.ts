// tests/league-snapshot.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { snapshotFromRecap } from "../src/lib/leagueSnapshot";
import type { OffseasonRecap } from "../src/lib/offseason";

const row = (i: number) => ({ team_espn_id: String(i), name: `Team ${i}`, slug: `team-${i}`, logo_url: null, color: null, wins: 5 - i, losses: i, draws: 0, points: 15 - 3 * i }) as OffseasonRecap["table"][number];
const leader = (i: number) => ({ player_espn_id: String(i), name: `Player ${i}`, slug: `player-${i}`, headshot_url: null, team_name: "Team", value: 6 - i, rank: i + 1 }) as OffseasonRecap["leaders"][number]["rows"][number];

const recap = {
  season: 2026,
  seasonLabel: "2026-27",
  seasonOver: false,
  table: [0, 1, 2, 3, 4, 5, 6].map(row),
  bands: [0, 1, 2, 3, 4, 5, 6].map((i) => (i < 4 ? { cls: "zone-1", label: "Champions League" } : i === 4 ? { cls: "zone-2", label: "Europa League" } : null)),
  tableSize: 20,
  leaders: [
    { label: "Goals", unit: "gls", rows: [0, 1, 2, 3, 4].map(leader) },
    { label: "Assists", unit: "ast", rows: [0, 1].map(leader) },
  ],
} as unknown as OffseasonRecap;

test("the homepage snapshot trims to five table rows, one board of three", () => {
  const s = snapshotFromRecap(recap, { tableRows: 5, boards: 1, leaderRows: 3 });
  assert.equal(s.table.length, 5);
  // The bands come from the recap (read against the whole table) and are trimmed with the rows they belong to.
  assert.deepEqual(s.bands.map((z) => z?.label ?? null), ["Champions League", "Champions League", "Champions League", "Champions League", "Europa League"]);
  assert.equal(s.tableSize, 20);
  assert.equal(s.leaders.length, 1);
  assert.equal(s.leaders[0].rows.length, 3);
  assert.equal(s.inSeason, true);
  assert.equal(s.seasonLabel, "2026-27");
});

test("without options nothing is trimmed (the league hub shows the full recap)", () => {
  const s = snapshotFromRecap(recap);
  assert.equal(s.table.length, 7);
  assert.equal(s.bands.length, 7);
  assert.equal(s.leaders.length, 2);
  assert.equal(s.leaders[0].rows.length, 5);
});

test("the mini table draws the bands it is given, not a positional guess: a finished season's 5th place can be a Champions League place", async () => {
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { createElement } = await import("react");
  const { LeagueSnapshot } = await import("../src/components/LeagueSnapshot");
  const data = snapshotFromRecap({ ...recap, seasonOver: true } as OffseasonRecap, { tableRows: 5, boards: 0 });
  const html = renderToStaticMarkup(createElement(LeagueSnapshot, { league: "laliga", data }));
  const markers = [...html.matchAll(/zone-marker ([a-z0-9-]*)" title="([^"]*)"/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(markers, [["zone-1", "Champions League"], ["zone-1", "Champions League"], ["zone-1", "Champions League"], ["zone-1", "Champions League"], ["zone-2", "Europa League"]]);
  assert.match(html, /Final table/);
});
