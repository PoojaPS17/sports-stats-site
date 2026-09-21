import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";
import { f1Venue, f1CircuitTimeZone } from "../src/lib/f1Circuits";

// ESPN's circuit records (sports.core.api.espn.com/v2/sports/racing/leagues/f1/circuits/<id>) as stored, and the venue the
// reference site shows for that Grand Prix.
const v = (eventId: string, season: number, name: string | null, city: string | null, country: string | null) => f1Venue({ eventId, season, name, city, country });

test("the Spanish Grand Prix 2016-2025 is at Barcelona-Catalunya, not the Madrid circuit ESPN's record was renamed to; 2026 is Madring", () => {
  for (const season of [2016, 2021, 2025]) {
    assert.deepEqual(v("x", season, "Madring", "Madrid", "Spain"), { name: "Circuit de Barcelona-Catalunya", city: "Montmeló", country: "Spain" });
  }
  assert.deepEqual(v("x", 2026, "Madring", "Madrid", "Spain"), { name: "Madring", city: "Madrid", country: "Spain" });
});

test("Barcelona-Catalunya reads the same in every year: ESPN's 2026 circuit record ('Circuit de Catalunya', Barcelona) and the pre-2026 'Madring' rewrite agree", () => {
  const before2026 = v("x", 2024, "Madring", "Madrid", "Spain");
  const in2026 = v("x", 2026, "Circuit de Catalunya", "Barcelona", "Spain");
  assert.deepEqual(in2026, { name: "Circuit de Barcelona-Catalunya", city: "Montmeló", country: "Spain" });
  assert.deepEqual(in2026, before2026);
});

test("Imola is not in Rome, the Nürburgring not in Nuremberg", () => {
  assert.equal(v("x", 2022, "Autodromo Enzo e Dino Ferrari", "Rome", "Italy").city, "Imola");
  assert.equal(v("x", 2020, "Nürburgring", "Nuremberg", "Germany").city, "Nürburg");
});

test("a state or region ESPN stores as the city is replaced by the city (Miami, Las Vegas, Mugello, Spa)", () => {
  assert.equal(v("x", 2024, "Miami International Autodrome", "Florida", "USA").city, "Miami");
  assert.equal(v("x", 2024, "Las Vegas Street Circuit", "Nevada", "USA").city, "Las Vegas");
  assert.equal(v("x", 2020, "Autodromo Internazionale del Mugello", "Tuscany", "Italy").city, "Mugello");
  assert.equal(v("x", 2023, "Circuit de Spa-Francorchamps", "Stavelot", "Belgium").city, "Spa");
});

test("Silverstone is in the UK, not 'Britain'", () => {
  assert.equal(v("x", 2024, "Silverstone Circuit", "Silverstone", "Britain").country, "UK");
});

test("the 2016 European Grand Prix, which ESPN stores with no circuit, was at Baku", () => {
  assert.deepEqual(v("18777", 2016, null, null, null), { name: "Baku City Circuit", city: "Baku", country: "Azerbaijan" });
  assert.deepEqual(v("other", 2016, null, null, null), { name: null, city: null, country: null });
});

test("an initialism the event query initcap()ed reads as one again (USA, not Usa)", () => {
  assert.equal(v("x", 2024, "Circuit of the Americas", "Austin", "Usa").country, "USA");
  assert.equal(v("x", 2024, "Yas Marina Circuit", "Abu Dhabi", "Uae").country, "UAE");
});

test("a circuit that is right is left alone", () => {
  assert.deepEqual(v("x", 2024, "Circuit de Monaco", "Monte Carlo", "Monaco"), { name: "Circuit de Monaco", city: "Monte Carlo", country: "Monaco" });
});

test("dates are shown in the circuit's own time zone; only Las Vegas differs from UTC on a race day", () => {
  assert.equal(f1CircuitTimeZone("Las Vegas Street Circuit"), "America/Los_Angeles");
  assert.equal(f1CircuitTimeZone("Circuit de Monaco"), "UTC");
  assert.equal(f1CircuitTimeZone(null), "UTC");
});

test("a Las Vegas event stored with no circuit still resolves to Las Vegas time, by event id (2023-2026)", () => {
  for (const id of ["600026789", "600041157", "600052106", "600057449"]) assert.equal(f1CircuitTimeZone(null, id), "America/Los_Angeles");
  assert.equal(f1CircuitTimeZone(null, "600041142"), "UTC");
  assert.equal(f1CircuitTimeZone("Circuit de Monaco", "600052106"), "America/Los_Angeles", "the event id decides even when the circuit name is another's");
});

let db: TestDb;
let f1: typeof import("../src/lib/f1");
before(async () => {
  db = await startTestDb();
  f1 = await import("../src/lib/f1");
  await db.pool.query(`insert into f1_events (espn_id, name, date, season_year, circuit_name, circuit_city, circuit_country) values
    ('sp16', 'Spanish Grand Prix', '2016-05-13T10:00:00Z', 2016, 'Madring', 'Madrid', 'Spain'),
    ('sp26', 'Spanish Grand Prix', '2026-09-11T10:00:00Z', 2026, 'Madring', 'Madrid', 'Spain'),
    ('18777', 'European Grand Prix', '2016-06-17T09:00:00Z', 2016, null, null, null)`);
});
after(async () => {
  await (await import("../src/lib/db")).pool.end();
  await db.stop();
});

test("the calendar and the event page show the corrected venue", async () => {
  const cal2016 = await f1.getF1Calendar(2016);
  const spanish = cal2016.find((e) => e.espn_id === "sp16")!;
  assert.deepEqual([spanish.circuit_name, spanish.circuit_city, spanish.circuit_country], ["Circuit de Barcelona-Catalunya", "Montmeló", "Spain"]);
  assert.deepEqual([cal2016.find((e) => e.espn_id === "18777")!.circuit_name, (await f1.getF1Event("18777"))!.circuit_city], ["Baku City Circuit", "Baku"]);
  assert.equal((await f1.getF1Event("sp26"))!.circuit_name, "Madring");
});
