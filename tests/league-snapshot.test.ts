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
  tableSize: 20,
  leaders: [
    { label: "Goals", unit: "gls", rows: [0, 1, 2, 3, 4].map(leader) },
    { label: "Assists", unit: "ast", rows: [0, 1].map(leader) },
  ],
} as unknown as OffseasonRecap;

test("the homepage snapshot trims to five table rows, one board of three", () => {
  const s = snapshotFromRecap(recap, { tableRows: 5, boards: 1, leaderRows: 3 });
  assert.equal(s.table.length, 5);
  assert.equal(s.tableSize, 20);
  assert.equal(s.leaders.length, 1);
  assert.equal(s.leaders[0].rows.length, 3);
  assert.equal(s.inSeason, true);
  assert.equal(s.seasonLabel, "2026-27");
});

test("without options nothing is trimmed (the league hub shows the full recap)", () => {
  const s = snapshotFromRecap(recap);
  assert.equal(s.table.length, 7);
  assert.equal(s.leaders.length, 2);
  assert.equal(s.leaders[0].rows.length, 5);
});
