import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { League } from "../src/lib/leagues";
import type { StandingRow } from "../src/lib/queries";
import { legendFor, relegationSummary, zoneFromNote, zoneRules, zonesFor, UPCOMING_CAPTION } from "../src/lib/standingsZones";
import { tableComplete } from "../src/lib/standingsOrder";

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));

function row(name: string, over: Partial<StandingRow> = {}): StandingRow {
  return {
    season: 2025, team_espn_id: name.toLowerCase().replace(/\W+/g, "-"), name, slug: name.toLowerCase().replace(/\W+/g, "-"), abbreviation: null, logo_url: null, color: null,
    conference: null, division: null, wins: 0, losses: 0, win_percent: "0", streak: null, playoff_seed: null, draws: null, points: null, goals_for: null, goals_against: null,
    no_result: null, net_run_rate: null, rank: null, zone: null, ...over,
  };
}

/** A table of `size` clubs, each having played the whole season (so the table is finished) or `played` games. */
function table(size: number, zones: Record<number, string> = {}, played = (size - 1) * 2): StandingRow[] {
  return Array.from({ length: size }, (_, i) =>
    row(`Club ${String(i + 1).padStart(2, "0")}`, { rank: i + 1, wins: played, points: 100 - i, zone: zones[i + 1] ?? null })
  );
}

const labelAt = (league: League, total: number, position: number, finished = false) => zoneRules(league, total, finished)?.(position)?.label ?? null;

test("current season: 6th is a Conference League place in La Liga, Serie A and the Bundesliga only", () => {
  for (const [league, total] of [["laliga", 20], ["seriea", 20], ["bundesliga", 18]] as [League, number][]) {
    assert.equal(zoneRules(league, total)?.(6)?.label, "Conference League", league);
    assert.equal(zoneRules(league, total)?.(6)?.cls, "zone-4", league);
    assert.equal(labelAt(league, total, 4), "Champions League", league);
    assert.equal(labelAt(league, total, 5), "Europa League", league);
    assert.equal(labelAt(league, total, 7), null, league);
  }
  assert.equal(labelAt("epl", 20, 6), null, "the Premier League's Conference place depends on the cups");
  assert.equal(labelAt("epl", 20, 5), "Europa League");
  assert.equal(labelAt("epl", 20, 4), "Champions League");
});

test("current season: relegation is the bottom three, or 17th and 18th (16th is the play-off) in the Bundesliga", () => {
  for (const league of ["epl", "laliga", "seriea"] as League[]) {
    assert.deepEqual([17, 18, 19, 20].map((p) => labelAt(league, 20, p)), [null, "Relegation", "Relegation", "Relegation"], league);
  }
  assert.deepEqual([15, 16, 17, 18].map((p) => labelAt("bundesliga", 18, p)), [null, "Relegation play-off", "Relegation", "Relegation"]);
});

test("the legend lists Conference League only where there is a Conference place, in table order", () => {
  assert.deepEqual(legendFor("laliga", 20).map((z) => z.label), ["Champions League", "Europa League", "Conference League", "Relegation"]);
  assert.deepEqual(legendFor("seriea", 20).map((z) => z.label), ["Champions League", "Europa League", "Conference League", "Relegation"]);
  assert.deepEqual(legendFor("bundesliga", 18).map((z) => z.label), ["Champions League", "Europa League", "Conference League", "Relegation play-off", "Relegation"]);
  assert.deepEqual(legendFor("epl", 20).map((z) => z.label), ["Champions League", "Europa League", "Relegation"]);
});

test("a finished season with no notes falls back to the older rule, which has no Conference band", () => {
  assert.equal(labelAt("laliga", 20, 6, true), null);
  assert.deepEqual(legendFor("laliga", 20, true).map((z) => z.label), ["Champions League", "Europa League", "Relegation"]);
});

test("a table that is not a full league table has no positional zones; the Champions League keeps its own", () => {
  assert.equal(zoneRules("laliga", 12), null);
  assert.equal(labelAt("ucl", 36, 8), "Round of 16");
  assert.equal(labelAt("ucl", 36, 9), "Knockout playoffs");
  assert.equal(labelAt("ucl", 36, 25), "Eliminated");
  assert.equal(labelAt("ucl", 4, 3), "Europa League");
});

// Every distinct note.description ESPN returned for eng.1, esp.1, ger.1 and ita.1, 2015 to 2026
// (tests/fixtures/espn-zone-notes.json), and what the site shows for it.
const EXPECTED: Record<string, [string, string] | null> = {
  "Champions League": ["zone-1", "Champions League"],
  "Champions League qualifying": ["zone-1", "Champions League qualifying"],
  "Europa League": ["zone-2", "Europa League"],
  "Europa League qualifying": ["zone-2", "Europa League qualifying"],
  "Europa League playoffs": ["zone-2", "Europa League qualifying"],
  "Conference League qualifying": ["zone-4", "Conference League qualifying"],
  "Europa Conference League qualifying": ["zone-4", "Conference League qualifying"],
  "Europa Conference League": ["zone-4", "Conference League"],
  "Conference League Playoff Round": ["zone-4", "Conference League playoff round"],
  Relegation: ["zone-3", "Relegation"],
  Relegated: ["zone-3", "Relegation"],
  "Relegation playoff": ["zone-2", "Relegation play-off"],
  "Relegation via playoffs": ["zone-2", "Relegation play-off"],
  "Relegated via playoff": ["zone-2", "Relegation play-off"],
};

test("every distinct ESPN note string maps to a band and a label", () => {
  const { leagues } = fixture("espn-zone-notes.json") as { leagues: Record<string, Record<string, string[]>> };
  assert.deepEqual(Object.keys(leagues).sort(), ["eng.1", "esp.1", "ger.1", "ita.1"]);
  const seen = new Set<string>();
  for (const strings of Object.values(leagues)) for (const s of Object.keys(strings)) seen.add(s);
  assert.equal(seen.size, 14, "14 distinct strings");
  for (const s of seen) {
    const want = EXPECTED[s];
    assert.ok(want, `an expectation for ${JSON.stringify(s)}`);
    const got = zoneFromNote(s);
    assert.deepEqual(got && [got.cls, got.label], want, s);
  }
});

test("a note is matched case-insensitively and trimmed; blank and unrelated notes give no band", () => {
  assert.equal(zoneFromNote("  champions league\t")?.cls, "zone-1");
  assert.equal(zoneFromNote("Europa League knockout round playoffs\t")?.label, "Europa League qualifying");
  assert.equal(zoneFromNote(""), null);
  assert.equal(zoneFromNote(null), null);
  assert.equal(zoneFromNote(undefined), null);
  assert.equal(zoneFromNote("Promotion"), null);
});

const LALIGA_2025_NOTES: Record<number, string> = { 1: "Champions League", 2: "Champions League", 3: "Champions League", 4: "Champions League", 5: "Champions League", 6: "Europa League", 7: "Conference League qualifying", 10: "Europa League", 18: "Relegation", 19: "Relegation", 20: "Relegation" };

test("a finished table with notes is banded by its own notes, and the legend lists only the labels that appear", () => {
  const rows = table(20, LALIGA_2025_NOTES);
  const zones = zonesFor("laliga", [["La Liga 2025-26", rows]]);
  assert.ok(zones);
  assert.equal(zones.zoneAt(rows, 4)?.label, "Champions League", "5th");
  assert.equal(zones.zoneAt(rows, 9)?.label, "Europa League", "10th");
  assert.equal(zones.zoneAt(rows, 6)?.label, "Conference League qualifying", "7th");
  assert.equal(zones.zoneAt(rows, 7), null, "8th has no note");
  assert.deepEqual(zones.legend.map((z) => z.label), ["Champions League", "Europa League", "Conference League qualifying", "Relegation"]);
  assert.equal(zones.caption, null, "no start-of-season caption on a finished table");
});

test("the same finished rows without notes fall back to the positional rule (no Conference band)", () => {
  const rows = table(20);
  const zones = zonesFor("laliga", [["La Liga 2025-26", rows]]);
  assert.ok(zones);
  assert.deepEqual([5, 6, 7, 10, 18].map((p) => zones.zoneAt(rows, p - 1)?.label ?? null), ["Europa League", null, null, null, "Relegation"]);
  assert.deepEqual(zones.legend.map((z) => z.label), ["Champions League", "Europa League", "Relegation"]);
});

test("a table still being played is banded by position, with the Conference band and the caption; notes are ignored", () => {
  const rows = table(20, LALIGA_2025_NOTES, 10);
  const zones = zonesFor("laliga", [["La Liga 2026-27", rows]]);
  assert.ok(zones);
  assert.equal(zones.zoneAt(rows, 4)?.label, "Europa League", "5th by position, not the last-year note that made it a Champions League place");
  assert.equal(zones.zoneAt(rows, 5)?.label, "Conference League");
  assert.equal(zones.zoneAt(rows, 9), null, "10th is not Europa League by position");
  assert.equal(zones.caption, UPCOMING_CAPTION);
  assert.equal(UPCOMING_CAPTION, "Qualification places as at the start of the season; cup results can change them.");
});

test("the Premier League keeps its rule while the season runs", () => {
  const rows = table(20, {}, 10);
  const zones = zonesFor("epl", [["Premier League 2026-27", rows]]);
  assert.ok(zones);
  assert.deepEqual(zones.legend.map((z) => z.label), ["Champions League", "Europa League", "Relegation"]);
  assert.equal(zones.zoneAt(rows, 5), null);
});

test("no zones for a table nobody has played in, a non-soccer table, or a shape with no rule", () => {
  const unplayed = table(20, {}, 0).map((r) => ({ ...r, unranked: true }));
  assert.equal(zonesFor("laliga", [["g", unplayed]]), null);
  assert.equal(zonesFor("nba", [["East", table(15)]]), null);
  assert.equal(zonesFor("ipl", [["All Teams", table(10)]]), null);
  assert.equal(zonesFor("laliga", [["g", table(12)]]), null);
});

test("a cup's group tables keep the Champions League rule, whatever their notes say", () => {
  const groups: [string, StandingRow[]][] = [["Group A", table(4, { 1: "Qualifies for round of 16", 3: "Europa League" }, 6)], ["Group B", table(4, {}, 6)]];
  const zones = zonesFor("ucl", groups);
  assert.ok(zones);
  assert.equal(zones.zoneAt(groups[0][1], 0)?.label, "Round of 16");
  assert.equal(zones.zoneAt(groups[0][1], 2)?.label, "Europa League");
  assert.equal(zones.caption, null);
});

test("a finished Serie A table uses the notes even where they name a Conference place at 8th", () => {
  const rows = table(20, { 1: "Champions League", 5: "Europa League", 6: "Europa League", 8: "Europa Conference League qualifying", 18: "Relegated", 19: "Relegated", 20: "Relegated" });
  const zones = zonesFor("seriea", [["Serie A 2022-23", rows]]);
  assert.ok(zones);
  assert.equal(zones.zoneAt(rows, 7)?.label, "Conference League qualifying");
  assert.equal(zones.zoneAt(rows, 5)?.cls, "zone-2");
  assert.equal(zones.zoneAt(rows, 17)?.label, "Relegation");
});

test("tableComplete is the one definition of a finished table", () => {
  assert.equal(tableComplete(table(20)), true);
  assert.equal(tableComplete(table(20, {}, 37)), false);
  assert.equal(tableComplete(table(18)), true, "the Bundesliga's 34 games");
  assert.equal(tableComplete(table(1)), false);
  assert.equal(tableComplete([]), false);
});

test("relegation summary: bottom three in the Premier League, La Liga and Serie A", () => {
  for (const league of ["epl", "laliga", "seriea"] as League[]) {
    const s = relegationSummary(league, table(20));
    assert.deepEqual(s.relegated.map((r) => r.rank), [18, 19, 20], league);
    assert.deepEqual(s.playoff, [], league);
  }
});

test("relegation summary: the Bundesliga relegates 17th and 18th; 16th is a play-off place, not relegated", () => {
  const s = relegationSummary("bundesliga", table(18));
  assert.deepEqual(s.relegated.map((r) => r.rank), [17, 18]);
  assert.deepEqual(s.playoff.map((r) => r.rank), [16]);
});

test("relegation summary prefers the stored notes of a finished season", () => {
  // Serie A 2022-23: 17th went through a play-off, only 19th and 20th went straight down.
  const s = relegationSummary("seriea", table(20, { 17: "Relegated via playoff", 19: "Relegated", 20: "Relegated" }));
  assert.deepEqual(s.relegated.map((r) => r.rank), [19, 20]);
  assert.deepEqual(s.playoff.map((r) => r.rank), [17]);
  // A Bundesliga season whose feed has no play-off note for 16th still has one.
  const b = relegationSummary("bundesliga", table(18, { 17: "Relegation", 18: "Relegation", 1: "Champions League" }));
  assert.deepEqual(b.relegated.map((r) => r.rank), [17, 18]);
  assert.deepEqual(b.playoff.map((r) => r.rank), [16]);
  // Notes that name the play-off are used as they are.
  const b2 = relegationSummary("bundesliga", table(18, { 16: "Relegation playoff", 17: "Relegation", 18: "Relegation" }));
  assert.deepEqual(b2.playoff.map((r) => r.rank), [16]);
});

test("relegation summary: notes with no relegation in them fall back to the league's rule", () => {
  const s = relegationSummary("laliga", table(20, { 1: "Champions League" }));
  assert.deepEqual(s.relegated.map((r) => r.rank), [18, 19, 20]);
});
