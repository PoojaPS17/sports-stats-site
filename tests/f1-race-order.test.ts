// Race order and Ret/DSQ/NC/DNS labels (src/lib/f1RaceOrder.ts). The fixture rows are ESPN's own order, status and laps
// completed for the back of the field of real races; the expected order and labels are f1.com's race-result table for each.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { F1_RACE_OVERRIDES, f1DistanceZone, f1ResultFor, f1ResultLabel, f1StatusLabel, orderF1Classification } from "../src/lib/f1RaceOrder";

interface FixtureRow { id: string; name: string; order: number | null; startOrder: number | null; winner: boolean; status: string; laps: number | null }
const races: Record<string, { event: string; season: number; rows: FixtureRow[] }> = JSON.parse(readFileSync("tests/fixtures/f1/espn-race-status-laps.json", "utf8"));

function rowsOf(eventId: string, shuffle = false) {
  const rows = races[eventId].rows.map((r) => ({ driver_espn_id: r.id, name: r.name, position: r.order, status: r.status, laps: r.laps, winner: r.winner }));
  return shuffle ? [...rows].reverse() : rows;
}
const surnames = (rows: { name: string }[]) => rows.map((r) => r.name.split(" ").slice(-1)[0]);
// What a row shows: its label, or its position.
const shown = (rows: { name: string; result_label: string | null; position: number | null }[]) => rows.map((r) => [r.name.split(" ").slice(-1)[0], r.result_label ?? r.position]);

test("DSQ and DNS follow the status; Ret and NC need the driver to be clearly under 90% of the winner's laps; a finisher, an odd status and no status show the position", () => {
  assert.equal(f1StatusLabel("STATUS_DISQUALIFIED"), "DSQ");
  assert.equal(f1StatusLabel("STATUS_DID_NOT_START"), "DNS");
  assert.equal(f1StatusLabel("STATUS_RETIRED", "below"), "Ret");
  assert.equal(f1StatusLabel("STATUS_NOT_CLASSIFIED", "below"), "NC");
  for (const zone of ["classified", "unsure", "unknown"] as const) {
    assert.equal(f1StatusLabel("STATUS_RETIRED", zone), null, `a retired driver ${zone}`);
    assert.equal(f1StatusLabel("STATUS_NOT_CLASSIFIED", zone), null, zone);
  }
  assert.equal(f1StatusLabel("STATUS_RETIRED"), null, "no laps known");
  assert.equal(f1StatusLabel("STATUS_CLASSIFIED", "below"), null);
  assert.equal(f1StatusLabel("STATUS_IN_PIT", "below"), null);
  assert.equal(f1StatusLabel(null), null);
});

test("the classification line: the winner's laps decide, with room for ESPN being a lap out (boundary)", () => {
  // winner 78 laps (Monaco): 90% is 70.2 laps
  assert.equal(f1DistanceZone(16, 78), "below");
  assert.equal(f1DistanceZone(68, 78), "below"); // 69 (a lap out) is still under 0.9 x 77 = 69.3
  assert.equal(f1DistanceZone(69, 78), "unsure");
  assert.equal(f1DistanceZone(70, 78), "unsure"); // 2018 Monaco: 70 laps was not classified by f1.com/Jolpica
  assert.equal(f1DistanceZone(76, 78), "unsure"); // over the line, but ESPN's figure may be 5 too high
  assert.equal(f1DistanceZone(77, 78), "classified");
  assert.equal(f1DistanceZone(78, 78), "classified");
  assert.equal(f1DistanceZone(null, 78), "unknown");
  assert.equal(f1DistanceZone(50, null), "unknown");
});

test("an off-by-one lap in ESPN's figures for the driver or the winner can never put a driver on the wrong side of the line", () => {
  for (let w = 30; w <= 80; w++) {
    for (let l = 0; l <= w; l++) {
      // (the FIA's figures are l and w; ESPN's are l + dl and w + dw)
      for (let dl = -1; dl <= 1; dl++) {
        for (let dw = -1; dw <= 1; dw++) {
          const zone = f1DistanceZone(l + dl, w + dw);
          if (zone === "below") assert.ok(l < 0.9 * w, `below at ${l + dl} of ${w + dw} but the FIA has ${l} of ${w}`);
        }
      }
      // ESPN's laps for a driver who stopped run up to 5 above the FIA's (2017 Australia: Alonso 54 for 50), never below it in what we have seen
      for (let dl = 0; dl <= 5; dl++) {
        for (let dw = -1; dw <= 1; dw++) {
          if (f1DistanceZone(l + dl, w + dw) === "classified") assert.ok(l >= 0.9 * w, `classified at ${l + dl} of ${w + dw} but the FIA has ${l} of ${w}`);
        }
      }
    }
  }
});

test("without a table entry: drivers with a position first in ESPN's order, then retirements under the line by laps completed, then non-starters, then disqualified drivers", () => {
  const rows = [
    { driver_espn_id: "dsq", position: 3, status: "STATUS_DISQUALIFIED", laps: 50, winner: false },
    { driver_espn_id: "ret-short", position: 4, status: "STATUS_RETIRED", laps: 10, winner: false },
    { driver_espn_id: "dns", position: 5, status: "STATUS_DID_NOT_START", laps: 0, winner: false },
    { driver_espn_id: "win", position: 1, status: "STATUS_CLASSIFIED", laps: 50, winner: true },
    { driver_espn_id: "ret-long", position: 6, status: "STATUS_RETIRED", laps: 40, winner: false },
    { driver_espn_id: "second", position: 2, status: "STATUS_CLASSIFIED", laps: null, winner: false },
  ];
  const out = orderF1Classification("no-such-race", rows);
  assert.deepEqual(out.map((r) => r.driver_espn_id), ["win", "second", "ret-long", "ret-short", "dns", "dsq"]);
  assert.deepEqual(out.map((r) => r.result_label), [null, null, "Ret", "Ret", "DNS", "DSQ"]);
  assert.deepEqual(out.map((r) => r.position), [1, 2, null, null, null, null]);
});

test("a retired driver over the line keeps ESPN's position and order, whatever the status says (2019 US: Gasly 16th on 54 laps, Magnussen 18th on 52)", () => {
  const out = orderF1Classification("23478", rowsOf("23478"));
  assert.deepEqual(shown(out).slice(-9), [["Kvyat", 12], ["Stroll", 13], ["Giovinazzi", 14], ["Grosjean", 15], ["Gasly", 16], ["Russell", 17], ["Magnussen", 18], ["Kubica", "Ret"], ["Vettel", "Ret"]]);
  assert.deepEqual(surnames(orderF1Classification("23478", rowsOf("23478", true))), surnames(out), "the same whatever order the rows come in");
});

// Jolpica's classification (the same as f1.com's) for the last places of real races NOT in the table, fed the ESPN status and
// laps the backfill stores. Number = classified position, Ret = "R". The races marked * are where the old rule (every
// STATUS_RETIRED reads Ret and goes to the bottom) changed the order; the others changed only the labels.
const CLASSIFIED_RETIREES: Record<string, [string, number | string][]> = {
  "23478": [["Giovinazzi", 14], ["Grosjean", 15], ["Gasly", 16], ["Russell", 17], ["Magnussen", 18], ["Kubica", "Ret"], ["Vettel", "Ret"]], // 2019 United States *
  "600014149": [["Magnussen", 17], ["Hamilton", 18], ["Latifi", 19], ["Alonso", "Ret"]], // 2022 Abu Dhabi: Hamilton 18th and Latifi 19th on 55 of 58 laps
  "600001741": [["Gasly", 17], ["Latifi", 18], ["Alonso", "Ret"], ["Mazepin", "Ret"]], // 2021 Bahrain: ESPN has Gasly on 53 laps, Jolpica 52
  "600041149": [["Pérez", 17], ["Sainz", 18], ["Stroll", 19], ["Tsunoda", "Ret"]], // 2024 Azerbaijan: Stroll 19th on 45 of 51 laps
  "23472": [["Kubica", 17], ["Giovinazzi", 18], ["Sainz", "Ret"], ["Verstappen", "Ret"]], // 2019 Belgium *
  "600001768": [["Latifi", 16], ["Russell", 17], ["Schumacher", 18], ["Tsunoda", "Ret"], ["Mazepin", "Ret"]], // 2021 Dutch *
  "600004580": [["Schumacher", 16], ["Mazepin", 17], ["Bottas", "Ret"], ["Russell", "Ret"], ["Latifi", "Ret"]], // 2021 Emilia Romagna *
  "600001764": [["Vettel", 17], ["Schumacher", 18], ["Mazepin", 19], ["Ocon", "Ret"]], // 2021 Austria (the second race there) *
  "600026790": [["Guanyu", 17], ["Sainz", 18], ["Bottas", 19], ["Magnussen", 20]], // 2023 Abu Dhabi: Sainz on 57 of 58 laps, retired, classified *
  "600026749": [["Magnussen", 17], ["Russell", "Ret"], ["Albon", "Ret"], ["Leclerc", "Ret"]], // 2023 Australia: Magnussen 17th on 52 of 58 laps
};
for (const [eventId, want] of Object.entries(CLASSIFIED_RETIREES)) {
  test(`${races[eventId].season} ${races[eventId].event} (no table entry): the rule alone gives Jolpica's order, numbers and Ret labels`, () => {
    const out = shown(orderF1Classification(eventId, rowsOf(eventId)));
    const got = out.filter(([name]) => want.some(([w]) => w === name));
    assert.deepEqual(got.slice(-want.length), want);
  });
}

test("a driver who really retired early is still labelled Ret and goes below the classified ones, by laps (2019 Belgium: Sainz 1 lap, Verstappen 0)", () => {
  const out = orderF1Classification("23472", rowsOf("23472"));
  assert.deepEqual(out.slice(-2).map((r) => [r.name, r.result_label, r.position]), [["Carlos Sainz", "Ret", null], ["Max Verstappen", "Ret", null]]);
});

test("an early retiree ESPN calls STATUS_CLASSIFIED (no laps read for him), or whose laps could not be read, is not labelled: nothing invented", () => {
  const out = orderF1Classification("no-such-race", [
    { driver_espn_id: "w", position: 1, status: "STATUS_CLASSIFIED", laps: 50, winner: true },
    { driver_espn_id: "x", position: 2, status: "STATUS_CLASSIFIED", laps: null, winner: false },
    { driver_espn_id: "y", position: 3, status: "STATUS_RETIRED", laps: null, winner: false },
  ]);
  assert.deepEqual(out.map((r) => [r.driver_espn_id, r.position, r.result_label]), [["w", 1, null], ["x", 2, null], ["y", 3, null]]);
});

test("sprint rows (no table) use the same rule: a retirement over the line keeps its position", () => {
  const out = orderF1Classification(null, [
    { driver_espn_id: "a", position: 1, status: "STATUS_CLASSIFIED", laps: 19, winner: true },
    { driver_espn_id: "b", position: 2, status: "STATUS_RETIRED", laps: 18, winner: false },
    { driver_espn_id: "c", position: 3, status: "STATUS_CLASSIFIED", laps: null, winner: false },
    { driver_espn_id: "d", position: 4, status: "STATUS_RETIRED", laps: 4, winner: false },
  ]);
  assert.deepEqual(out.map((r) => [r.driver_espn_id, r.position, r.result_label]), [["a", 1, null], ["b", 2, null], ["c", 3, null], ["d", null, "Ret"]]);
});

test("retirements level on laps keep ESPN's order, then the driver id; one with no laps stored is not labelled", () => {
  const out = orderF1Classification("no-such-race", [
    { driver_espn_id: "w", position: 1, status: "STATUS_CLASSIFIED", laps: 60, winner: true },
    { driver_espn_id: "b", position: 8, status: "STATUS_RETIRED", laps: 0, winner: false },
    { driver_espn_id: "d", position: null, status: "STATUS_RETIRED", laps: 0, winner: false },
    { driver_espn_id: "a", position: 8, status: "STATUS_RETIRED", laps: 0, winner: false },
    { driver_espn_id: "c", position: 10, status: "STATUS_RETIRED", laps: 3, winner: false },
    { driver_espn_id: "n", position: 9, status: "STATUS_RETIRED", laps: null, winner: false },
  ]);
  assert.deepEqual(out.map((r) => r.driver_espn_id), ["w", "n", "c", "a", "b", "d"]);
  assert.deepEqual(out.map((r) => r.result_label), [null, null, "Ret", "Ret", "Ret", "Ret"]);
});

test("a disqualified driver ESPN numbers among the finishers goes last and the numbers close up (f1.com does not count him)", () => {
  const out = orderF1Classification("no-such-race", [
    { driver_espn_id: "w", position: 1, status: "STATUS_CLASSIFIED", laps: 50, winner: true },
    { driver_espn_id: "a", position: 2, status: "STATUS_CLASSIFIED", laps: null, winner: false },
    { driver_espn_id: "dq", position: 3, status: "STATUS_DISQUALIFIED", laps: 50, winner: false },
    { driver_espn_id: "b", position: 4, status: "STATUS_CLASSIFIED", laps: null, winner: false },
    { driver_espn_id: "c", position: 5, status: "STATUS_CLASSIFIED", laps: null, winner: false },
  ]);
  assert.deepEqual(out.map((r) => [r.driver_espn_id, r.position, r.result_label]), [["w", 1, null], ["a", 2, null], ["b", 3, null], ["c", 4, null], ["dq", null, "DSQ"]]);
});

test("2016: retirements ESPN gave no order are labelled Ret under the line and ordered by laps completed; the classified ones keep their numbers", () => {
  const raw = JSON.parse(readFileSync("tests/fixtures/f1/espn-race-competitors-2016-bahrain.json", "utf8"));
  const lapsOf = (id: string) => raw.statistics[id].splits.categories[0].stats.find((s: { name: string }) => s.name === "lapsCompleted").value as number;
  const rows = raw.competitors
    .filter((c: { startOrder: number }) => c.startOrder !== 0)
    .map((c: { id: string; order?: number; winner: boolean }) => ({
      driver_espn_id: c.id as string,
      position: (c.order ?? null) as number | null,
      status: raw.status[c.id].type.name as string,
      laps: lapsOf(c.id),
      winner: c.winner,
    }));
  const out = orderF1Classification("18771", rows);
  // Rosberg won (57 laps) and Magnussen finished 11th; then the retirements by laps: Sainz 29, Button 6, Vettel 0.
  assert.deepEqual(out.map((r) => r.driver_espn_id), ["783", "4623", "4686", "312", "864"]);
  assert.deepEqual(out.map((r) => r.position), [1, 11, null, null, null]);
  assert.deepEqual(out.map((r) => r.result_label), [null, null, "Ret", "Ret", "Ret"]);
});

test("2016-17: a driver ESPN gave no position who completed the distance is classified: he is numbered after the finishers and never reads Ret", () => {
  const out = orderF1Classification("no-such-race", [
    { driver_espn_id: "z-late", position: null, status: "STATUS_RETIRED", laps: 70, winner: false },
    { driver_espn_id: "w", position: 1, status: "STATUS_CLASSIFIED", laps: 70, winner: true },
    { driver_espn_id: "a-late", position: null, status: "STATUS_RETIRED", laps: 70, winner: false },
    { driver_espn_id: "s", position: 2, status: "STATUS_CLASSIFIED", laps: null, winner: false },
    { driver_espn_id: "early", position: null, status: "STATUS_RETIRED", laps: 12, winner: false },
    { driver_espn_id: "line", position: null, status: "STATUS_RETIRED", laps: 64, winner: false }, // near the line: neither labelled nor numbered
  ]);
  // finishers, then the classified retirees by laps then id (an approximation of f1.com's order by time), then the one near the line, then the early retiree
  assert.deepEqual(out.map((r) => [r.driver_espn_id, r.position, r.result_label]), [
    ["w", 1, null], ["s", 2, null], ["a-late", 3, null], ["z-late", 4, null], ["line", null, null], ["early", null, "Ret"],
  ]);
});

test("a race with no stored status stays in ESPN's order with ESPN's positions, exactly as before", () => {
  const out = orderF1Classification("no-such-race", [
    { driver_espn_id: "b", position: 2, status: null, laps: null, winner: false },
    { driver_espn_id: "c", position: null, status: null, laps: null, winner: false },
    { driver_espn_id: "a", position: 1, status: null, laps: null, winner: true },
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
  assert.equal(f1ResultLabel("some-other-race", "868", "STATUS_RETIRED", "below"), "Ret");
  assert.equal(f1ResultLabel("some-other-race", "868", "STATUS_RETIRED", "classified"), null);
  assert.equal(f1ResultLabel("some-other-race", "868", null), null);
});

test("2023 Qatar: Sainz did not start; f1.com lists him last with DNS", () => {
  const o = F1_RACE_OVERRIDES["600026765"];
  assert.equal(o.order[o.order.length - 1], "4686");
  assert.equal(o.labels["4686"], "DNS");
  assert.equal(o.order.length, 20);
  for (const id of ["600001776", "600014128", "600026763"]) assert.equal(F1_RACE_OVERRIDES[id].order.length, 19, "f1.com lists 19 drivers, no non-starter");
});
