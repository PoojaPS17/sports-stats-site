// Race order and Ret/DSQ/NC/DNS labels (src/lib/f1RaceOrder.ts). The fixture rows are ESPN's own order, status and laps
// completed for the back of the field of real races; the expected order and labels are f1.com's race-result table for each.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { F1_RACE_OVERRIDES, f1ResultFor, f1ResultLabel, f1StatusLabel, orderF1Classification } from "../src/lib/f1RaceOrder";

interface FixtureRow { id: string; name: string; order: number | null; startOrder: number | null; status: string; laps: number | null }
const races: Record<string, { event: string; season: number; rows: FixtureRow[] }> = JSON.parse(readFileSync("tests/fixtures/f1/espn-race-status-laps.json", "utf8"));

function rowsOf(eventId: string, shuffle = false) {
  const rows = races[eventId].rows.map((r) => ({ driver_espn_id: r.id, name: r.name, position: r.order, status: r.status, laps: r.laps }));
  return shuffle ? [...rows].reverse() : rows;
}
const surnames = (rows: { name: string }[]) => rows.map((r) => r.name.split(" ").slice(-1)[0]);

test("status names read as Ret / DSQ / NC / DNS; a finisher, a status ESPN leaves at 'In Pit' and no status show the position", () => {
  assert.equal(f1StatusLabel("STATUS_RETIRED"), "Ret");
  assert.equal(f1StatusLabel("STATUS_DISQUALIFIED"), "DSQ");
  assert.equal(f1StatusLabel("STATUS_NOT_CLASSIFIED"), "NC");
  assert.equal(f1StatusLabel("STATUS_DID_NOT_START"), "DNS");
  assert.equal(f1StatusLabel("STATUS_CLASSIFIED"), null);
  assert.equal(f1StatusLabel("STATUS_IN_PIT"), null);
  assert.equal(f1StatusLabel(null), null);
});

test("without a table entry the rule puts finishers first, then retirements by laps completed, then non-starters, then disqualified drivers", () => {
  const rows = [
    { driver_espn_id: "dsq", position: 3, status: "STATUS_DISQUALIFIED", laps: 50 },
    { driver_espn_id: "ret-short", position: 4, status: "STATUS_RETIRED", laps: 10 },
    { driver_espn_id: "dns", position: 5, status: "STATUS_DID_NOT_START", laps: 0 },
    { driver_espn_id: "win", position: 1, status: "STATUS_CLASSIFIED", laps: 50 },
    { driver_espn_id: "ret-long", position: 6, status: "STATUS_RETIRED", laps: 40 },
    { driver_espn_id: "second", position: 2, status: "STATUS_CLASSIFIED", laps: 50 },
  ];
  const out = orderF1Classification("no-such-race", rows);
  assert.deepEqual(out.map((r) => r.driver_espn_id), ["win", "second", "ret-long", "ret-short", "dns", "dsq"]);
  assert.deepEqual(out.map((r) => r.result_label), [null, null, "Ret", "Ret", "DNS", "DSQ"]);
  assert.deepEqual(out.map((r) => r.position), [1, 2, null, null, null, null]);
});

test("retirements level on laps keep ESPN's order, and a retirement with no laps yet goes after those with laps", () => {
  const out = orderF1Classification("no-such-race", [
    { driver_espn_id: "b", position: 8, status: "STATUS_RETIRED", laps: 0 },
    { driver_espn_id: "unknown", position: 7, status: "STATUS_RETIRED", laps: null },
    { driver_espn_id: "a", position: 9, status: "STATUS_RETIRED", laps: 0 },
    { driver_espn_id: "c", position: 10, status: "STATUS_RETIRED", laps: 3 },
  ]);
  assert.deepEqual(out.map((r) => r.driver_espn_id), ["c", "b", "a", "unknown"]);
});

test("2016: retirements ESPN gave no order are ordered by laps completed and labelled Ret", () => {
  const raw = JSON.parse(readFileSync("tests/fixtures/f1/espn-race-competitors-2016-bahrain.json", "utf8"));
  const rows = raw.competitors
    .filter((c: { startOrder: number }) => c.startOrder !== 0)
    .map((c: { id: string; order?: number }) => ({
      driver_espn_id: c.id as string,
      position: (c.order ?? null) as number | null,
      status: raw.status[c.id].type.name as string,
      laps: raw.statistics[c.id].splits.categories[0].stats.find((s: { name: string }) => s.name === "lapsCompleted").value as number,
    }));
  const out = orderF1Classification("18771", rows);
  // Rosberg won and Magnussen finished 11th; then the retirements by laps: Sainz 29, Button 6, Vettel 0 (Vettel's ESPN order is none, like theirs).
  assert.deepEqual(out.map((r) => r.driver_espn_id), ["783", "4623", "4686", "312", "864"]);
  assert.deepEqual(out.map((r) => r.position), [1, 11, null, null, null]);
  assert.deepEqual(out.map((r) => r.result_label), [null, null, "Ret", "Ret", "Ret"]);
});

test("a race with no stored status stays in ESPN's order with ESPN's positions, exactly as before", () => {
  const out = orderF1Classification("no-such-race", [
    { driver_espn_id: "b", position: 2, status: null, laps: null },
    { driver_espn_id: "c", position: null, status: null, laps: null },
    { driver_espn_id: "a", position: 1, status: null, laps: null },
  ]);
  assert.deepEqual(out.map((r) => [r.driver_espn_id, r.position, r.result_label]), [["a", 1, null], ["b", 2, null], ["c", null, null]]);
});

test("the table covers the 16 races, each with unique drivers and labels only for drivers in its order", () => {
  const ids = Object.keys(F1_RACE_OVERRIDES);
  assert.equal(ids.length, 16);
  for (const [eventId, o] of Object.entries(F1_RACE_OVERRIDES)) {
    assert.equal(new Set(o.order).size, o.order.length, `${eventId}: a driver is listed twice`);
    assert.ok(o.order.length >= 19 && o.order.length <= 20, `${eventId}: ${o.order.length} drivers`);
    for (const id of Object.keys(o.labels)) assert.ok(o.order.includes(id), `${eventId}: label for ${id} who is not in the order`);
  }
});

// The order f1.com prints for the last places of each race the rule cannot get right, and its labels.
const TAILS: Record<string, { last: string[]; labels: Record<string, string> }> = {
  // 2019 Monaco: Magnussen's penalty; Leclerc retired on lap 16
  "23465": { last: ["Pérez", "Hülkenberg", "Magnussen", "Russell", "Stroll", "Raikkonen", "Kubica", "Giovinazzi", "Leclerc"], labels: { Leclerc: "Ret" } },
  // 2020 Russia: Sainz and Stroll both out on lap 1, Sainz first
  "28132": { last: ["Sainz", "Stroll"], labels: { Sainz: "Ret", Stroll: "Ret" } },
  // 2021 Monaco: Bottas retired, Leclerc did not start (ESPN has him "Retired" on 0 laps and Bottas "In Pit")
  "600001760": { last: ["Bottas", "Leclerc"], labels: { Bottas: "Ret", Leclerc: "DNS" } },
  // 2021 Styrian: ESPN calls Gasly (1 lap) classified and puts Russell (36 laps) after him
  "600006840": { last: ["Latifi", "Mazepin", "Russell", "Gasly"], labels: { Russell: "Ret", Gasly: "Ret" } },
  // 2021 Belgium: two laps behind the safety car, everyone classified, order by the finish
  "600001767": { last: ["Raikkonen", "Pérez", "Stroll"], labels: {} },
  // 2021 Brazil: ESPN has Ricciardo and Stroll STATUS_CLASSIFIED
  "600001775": { last: ["Mazepin", "Schumacher", "Ricciardo", "Stroll"], labels: { Ricciardo: "Ret", Stroll: "Ret" } },
  // 2021 Saudi Arabia: four drivers out on lap 14 or 8
  "600001777": { last: ["Vettel", "Pérez", "Mazepin", "Russell", "Schumacher"], labels: { Vettel: "Ret", Pérez: "Ret", Mazepin: "Ret", Russell: "Ret", Schumacher: "Ret" } },
  // 2022 Japan and Brazil: retirements on lap 0
  "600014145": { last: ["Sainz", "Albon"], labels: { Sainz: "Ret", Albon: "Ret" } },
  "600014148": { last: ["Norris", "Magnussen", "Ricciardo"], labels: { Norris: "Ret", Magnussen: "Ret", Ricciardo: "Ret" } },
  // 2023 Brazil: Leclerc did not start but ESPN lists him 19th
  "600026788": { last: ["Russell", "Bottas", "Guanyu", "Magnussen", "Albon", "Leclerc"], labels: { Russell: "Ret", Bottas: "Ret", Guanyu: "Ret", Magnussen: "Ret", Albon: "Ret", Leclerc: "DNS" } },
};

for (const [eventId, want] of Object.entries(TAILS)) {
  test(`${races[eventId].event} ${races[eventId].season}: the back of the field is in f1.com's order with its labels`, () => {
    const out = orderF1Classification(eventId, rowsOf(eventId));
    const reversed = orderF1Classification(eventId, rowsOf(eventId, true));
    assert.deepEqual(surnames(out).slice(-want.last.length), want.last);
    assert.deepEqual(surnames(reversed).slice(-want.last.length), surnames(out).slice(-want.last.length), "the same whatever order the rows come in");
    for (const r of out) {
      const surname = r.name.split(" ").slice(-1)[0];
      const expected = want.labels[surname] ?? null;
      assert.equal(r.result_label, expected, `${surname}`);
      assert.equal(r.position === null, expected !== null, `${surname} position`);
    }
  });
}

test("2019 Japan: f1.com keeps the two disqualified drivers at their on-track places, and positions skip them", () => {
  const o = F1_RACE_OVERRIDES["23476"];
  assert.equal(o.order[5], "4510"); // Ricciardo sixth on track
  assert.equal(o.order[9], "4396"); // Hulkenberg tenth
  assert.equal(o.labels["4510"], "DSQ");
  assert.equal(o.labels["4396"], "DSQ");
  assert.equal(o.labels["4665"], "Ret"); // Verstappen, brakes
  // Leclerc is the sixth driver with a position (seventh row), Norris 11th though he is in row 13
  assert.deepEqual(f1ResultFor("23476", o.order[6], 6, "STATUS_CLASSIFIED"), { label: null, position: 6 });
  assert.deepEqual(f1ResultFor("23476", "5579", 11, "STATUS_CLASSIFIED"), { label: null, position: 11 });
  assert.deepEqual(f1ResultFor("23476", "4510", 18, "STATUS_DISQUALIFIED"), { label: "DSQ", position: null });
});

test("2024 Belgium: Russell won on the road and was disqualified: he heads the table with DSQ and Hamilton is P1", () => {
  const out = orderF1Classification("600041146", rowsOf("600041146"));
  const russell = out.find((r) => r.name.includes("Russell"))!;
  assert.equal(out[0].driver_espn_id, russell.driver_espn_id);
  assert.equal(russell.result_label, "DSQ");
  assert.equal(russell.position, null);
  assert.deepEqual(f1ResultFor("600041146", "868", 1, "STATUS_CLASSIFIED"), { label: null, position: 1 });
  assert.deepEqual(out.slice(-1).map((r) => r.result_label), ["Ret"]); // Zhou, 5 laps
});

test("a driver in a table race takes his label from the table, whatever ESPN's status says", () => {
  // 2021 Brazil: Ricciardo (4510) is STATUS_CLASSIFIED in ESPN; f1.com prints DNF
  assert.equal(f1ResultLabel("600001775", "4510", "STATUS_CLASSIFIED"), "Ret");
  // ... and a driver with a position stays without a label even if ESPN said retired
  assert.equal(f1ResultLabel("600001775", "868", "STATUS_RETIRED"), null);
  // outside the table the status decides
  assert.equal(f1ResultLabel("some-other-race", "868", "STATUS_RETIRED"), "Ret");
  assert.equal(f1ResultLabel("some-other-race", "868", null), null);
});

test("2023 Qatar: Sainz did not start; f1.com lists him last with DNS", () => {
  const o = F1_RACE_OVERRIDES["600026765"];
  assert.equal(o.order[o.order.length - 1], "4686");
  assert.equal(o.labels["4686"], "DNS");
  assert.equal(o.order.length, 20);
  for (const id of ["600001776", "600014128", "600026763"]) assert.equal(F1_RACE_OVERRIDES[id].order.length, 19, "f1.com lists 19 drivers, no non-starter");
});
