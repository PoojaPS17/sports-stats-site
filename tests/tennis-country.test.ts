// ESPN's flag filenames double as the country codes it gives tennis players, and a few are older codes than the ones
// the tours print (Djokovic is "SER", the tour and every result page say "SRB"). The stored code is kept — it is the
// flag image's filename — and only the label a visitor reads is mapped.
import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { displayCountry } from "../src/lib/tennisCountry";
import { startTestDb, type TestDb } from "./helpers/testDb";

let db: TestDb;
let Flag: typeof import("../src/components/TennisScores").Flag;
let PlayerPage: typeof import("../src/app/tennis/[tour]/players/[slug]/page").default;

before(async () => {
  db = await startTestDb();
  ({ Flag } = await import("../src/components/TennisScores"));
  ({ default: PlayerPage } = await import("../src/app/tennis/[tour]/players/[slug]/page"));
});
after(async () => {
  await (await import("../src/lib/db")).pool.end();
  await db?.stop();
});

test("displayCountry maps ESPN's older codes to the codes the tours print", () => {
  const pairs: [string, string][] = [
    ["SER", "SRB"], ["ROM", "ROU"], ["MOR", "MAR"], ["SIN", "SGP"], ["TPO", "TPE"], ["TAI", "TPE"], ["IRN", "IRI"],
    ["NGA", "NGR"], ["LIB", "LBN"], ["HTI", "HAI"], ["BHR", "BRN"], ["FJI", "FIJ"], ["CHL", "CHI"],
  ];
  for (const [espn, shown] of pairs) assert.equal(displayCountry(espn), shown, espn);
  assert.equal(displayCountry("ser"), "SRB", "case-insensitive");
});

test("displayCountry leaves every other code, and no code, alone", () => {
  for (const c of ["ITA", "USA", "ESP", "SLO", "SVK", "INA", "GER", "SUI"]) assert.equal(displayCountry(c), c);
  assert.equal(displayCountry(null), null);
  assert.equal(displayCountry(undefined), null);
  assert.equal(displayCountry(""), null);
});

test("Flag keeps the stored code for the image and prints the mapped one", () => {
  const markup = renderToStaticMarkup(Flag({ code: "SER" }) as ReactElement);
  assert.match(markup, /countries\/500\/ser\.png/);
  assert.match(markup, /alt="SRB"/);
  assert.match(markup, /title="SRB"/);
  assert.doesNotMatch(markup, /SER"/);
});

beforeEach(async () => {
  await db.pool.query(`delete from players`);
  await db.pool.query(`insert into players (league, espn_id, name, slug, country) values ('atp', '3', 'Novak Djokovic', 'novak-djokovic', 'SER')`);
});

test("the player page says SRB in its byline and keeps the ser.png flag", async () => {
  const markup = renderToStaticMarkup((await PlayerPage({ params: Promise.resolve({ tour: "atp", slug: "novak-djokovic" }) })) as ReactElement);
  assert.match(markup, /ATP · SRB/);
  assert.doesNotMatch(markup, /SER\b/);
  assert.match(markup, /countries\/500\/ser\.png/);
});
