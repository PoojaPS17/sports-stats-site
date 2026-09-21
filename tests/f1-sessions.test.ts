import { test } from "node:test";
import assert from "node:assert/strict";
import { f1SessionLabel, sortF1Sessions } from "../src/lib/f1Sessions";

// Session abbreviations ESPN uses in sports.core.api.espn.com/v2/sports/racing/leagues/f1/seasons/<year>/types/2/events:
// FP1 FP2 FP3 Qual Race, "Sprint" (2021-22 weekends), "SS" (text "Sprint Shootout", 2023-25) and "SR" (text "Sprint Race").
const order = (season: number, types: string[]) => sortF1Sessions(season, types.map((session_type) => ({ session_type }))).map((s) => s.session_type);

test("sprint labels: SS is Sprint Qualifying (Sprint Shootout in 2023) and SR is the Sprint", () => {
  assert.equal(f1SessionLabel(2025, "SS"), "Sprint Qualifying");
  assert.equal(f1SessionLabel(2024, "SS"), "Sprint Qualifying");
  assert.equal(f1SessionLabel(2023, "SS"), "Sprint Shootout");
  assert.equal(f1SessionLabel(2025, "SR"), "Sprint");
  assert.equal(f1SessionLabel(2021, "Sprint"), "Sprint");
});

test("the other labels are unchanged; an unknown session reads as ESPN has it", () => {
  assert.equal(f1SessionLabel(2025, "FP1"), "Free Practice 1");
  assert.equal(f1SessionLabel(2025, "Qual"), "Qualifying");
  assert.equal(f1SessionLabel(2025, "Race"), "Race");
  assert.equal(f1SessionLabel(2025, "XYZ"), "XYZ");
});

test("an ordinary weekend runs practice, qualifying, race", () => {
  assert.deepEqual(order(2025, ["Race", "Qual", "FP3", "FP1", "FP2"]), ["FP1", "FP2", "FP3", "Qual", "Race"]);
});

test("a 2024-25 sprint weekend (China 2025): FP1, Sprint Qualifying, Sprint, Qualifying, Race", () => {
  assert.deepEqual(order(2025, ["Race", "Qual", "SR", "SS", "FP1"]), ["FP1", "SS", "SR", "Qual", "Race"]);
});

test("a 2023 sprint weekend (Austria 2023): FP1, Qualifying, Sprint Shootout, Sprint, Race", () => {
  assert.deepEqual(order(2023, ["SR", "Race", "SS", "Qual", "FP1"]), ["FP1", "Qual", "SS", "SR", "Race"]);
});

test("a 2021-22 sprint weekend: FP1, Qualifying, FP2, Sprint, Race", () => {
  assert.deepEqual(order(2021, ["Race", "Sprint", "FP2", "Qual", "FP1"]), ["FP1", "Qual", "FP2", "Sprint", "Race"]);
});
