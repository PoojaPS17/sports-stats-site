import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { f1EventSchema } from "../src/lib/structuredData";
import { SITE_URL } from "../src/lib/site";
import type { F1EventRow } from "../src/lib/f1";

// A race weekend's page carried a breadcrumb and nothing else: 241 Grand Prix pages published no
// event markup at all, though the feed gives their circuit, city, country and the days they ran.
const weekend = (over: Partial<F1EventRow> = {}): F1EventRow =>
  ({
    espn_id: "600057451", name: "Abu Dhabi Grand Prix", short_name: "ABU", season_year: 2026,
    date: "2026-12-04T09:30:00Z", end_date: "2026-12-06T13:00:00Z", race_date: "2026-12-06T13:00:00Z",
    circuit_name: "Yas Marina Circuit", circuit_city: "Abu Dhabi", circuit_country: "United Arab Emirates",
    winner_name: null, winner_slug: null,
    race_status_state: "pre", race_status_detail: "Scheduled", race_completed: false,
    ...over,
  }) as F1EventRow;

test("a Grand Prix weekend is a SportsEvent at its circuit, spanning the days it runs", () => {
  const schema = f1EventSchema(weekend());
  assert.equal(schema["@type"], "SportsEvent");
  assert.equal(schema.name, "2026 Abu Dhabi Grand Prix");
  assert.equal(schema.sport, "Formula 1");
  assert.equal(schema.startDate, "2026-12-04T09:30:00Z");
  assert.equal(schema.endDate, "2026-12-06T13:00:00Z", "a race weekend really does run over several days");
  assert.equal(schema.url, `${SITE_URL}/f1/events/600057451`);
  assert.deepEqual(schema.location, {
    "@type": "Place",
    name: "Yas Marina Circuit",
    address: { "@type": "PostalAddress", addressLocality: "Abu Dhabi", addressCountry: "United Arab Emirates" },
  });
  assert.deepEqual(schema.organizer, { "@type": "SportsOrganization", name: "Formula 1", url: `${SITE_URL}/f1` });
  assert.equal(schema.eventStatus, "https://schema.org/EventScheduled");
});

test("the description is the one the page's own meta tag already carries", () => {
  const won = f1EventSchema(weekend({ winner_name: "Max Verstappen", race_completed: true, race_status_state: "post", race_status_detail: "Final" }));
  assert.equal(won.description, "Max Verstappen won the 2026 Abu Dhabi Grand Prix at Yas Marina Circuit. Classifications for the race, qualifying and practice.");
});

test("a cancelled Grand Prix is marked cancelled, not scheduled", () => {
  const off = f1EventSchema(weekend({ race_status_state: "post", race_status_detail: "Canceled", race_completed: false }));
  assert.equal(off.eventStatus, "https://schema.org/EventCancelled");
});

test("a weekend with no circuit on file names no place, and one run in a day claims no end", () => {
  const bare = f1EventSchema(weekend({ circuit_name: null, circuit_city: null, circuit_country: null, end_date: null }));
  assert.equal("location" in bare, false);
  assert.equal("endDate" in bare, false);
  const sameDay = f1EventSchema(weekend({ end_date: "2026-12-04T15:00:00Z" }));
  assert.equal("endDate" in sameDay, false, "an end on the start's own day adds nothing");
});

test("the race weekend page emits the event schema, not only its breadcrumb", () => {
  const src = readFileSync("src/app/f1/events/[id]/page.tsx", "utf8");
  assert.match(src, /JsonLd data=\{f1EventSchema\(event\)\}/);
});
