import { test } from "node:test";
import assert from "node:assert/strict";
import { f1Podium, f1SessionLabel, sortF1Sessions } from "../src/lib/f1Sessions";

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

// The share card captions each driver with a number. Taking that number from the driver's place in
// the list would have been right until a disqualification: the classification drops the excluded
// driver instead of renumbering, so the next one up is still P4 and must not be captioned "3rd".
const raceRow = (over: Partial<{ session_type: string; completed: boolean; position: number | null; driver: string }> = {}) =>
  ({ session_type: "Race", completed: true, position: 1, driver: "d", ...over });

test("the podium is the three classified first, second and third in the race", () => {
  const podium = f1Podium([raceRow({ position: 1, driver: "a" }), raceRow({ position: 2, driver: "b" }), raceRow({ position: 3, driver: "c" }), raceRow({ position: 4, driver: "d" })]);
  assert.deepEqual(podium.map((r) => r.driver), ["a", "b", "c"]);
  assert.deepEqual(podium.map((r) => r.position), [1, 2, 3]);
});

test("a driver removed from the classification does not promote the next one's caption", () => {
  // P3 disqualified: the rows that remain are 1, 2 and 4, and the card must say 4, not 3.
  const podium = f1Podium([raceRow({ position: 1, driver: "a" }), raceRow({ position: 2, driver: "b" }), raceRow({ position: 4, driver: "d" })]);
  assert.deepEqual(podium.map((r) => r.position), [1, 2], "only the drivers actually placed in the top three");
});

test("practice, qualifying, an unfinished race and a retirement are not a podium", () => {
  assert.deepEqual(f1Podium([raceRow({ session_type: "Qual" }), raceRow({ session_type: "SR" })]), []);
  assert.deepEqual(f1Podium([raceRow({ completed: false })]), []);
  assert.deepEqual(f1Podium([raceRow({ position: null })]), [], "a Ret/DSQ/NC row carries no position");
  assert.deepEqual(f1Podium([]), []);
});
