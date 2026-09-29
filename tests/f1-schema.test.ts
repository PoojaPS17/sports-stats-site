import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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

// Every F1 weekend page fell back to the site's generic logo card, so 241 different Grand Prix
// looked like one link when shared, and Search Console counted every one of them as an Event
// missing `image`. The card beside the page is the fix; the schema has to name it.
test("a race weekend carries its own share card", () => {
  const schema = f1EventSchema(weekend());
  assert.equal(schema.image, `${SITE_URL}/f1/events/600057451/opengraph-image`);
});

test("the image a race weekend points at is a share-card route that exists", () => {
  // Google fetches this URL; if the route file ever goes, the schema would advertise a 404.
  const image = f1EventSchema(weekend()).image;
  const route = image.slice(`${SITE_URL}/`.length).replace("f1/events/600057451", "f1/events/[id]");
  assert.ok(existsSync(new URL(`../src/app/${route}.tsx`, import.meta.url)), `${route}.tsx must exist`);
});

// pageMeta substitutes the site-wide share image unless the page says it has one of its own, so
// the route above would have been overridden and never served. The flag is the other half of the fix.
test("the race weekend page keeps its own share card instead of the site's", () => {
  const src = readFileSync("src/app/f1/events/[id]/page.tsx", "utf8");
  assert.match(src, /ownImage:\s*true/);
});

test("the race weekend page emits the event schema, not only its breadcrumb", () => {
  const src = readFileSync("src/app/f1/events/[id]/page.tsx", "utf8");
  assert.match(src, /JsonLd data=\{f1EventSchema\(event\)\}/);
});

// Every fixture above hands the schema strings, which is how the row type describes these columns —
// but f1.ts's EVENT_SELECT reads `e.date` and `e.end_date` raw, so pg hands the page Date objects and
// `.slice()` threw on every one of the 241 weekend pages. The suite passed while production 500'd,
// so these fixtures are deliberately shaped like the driver's real output.
test("a weekend whose dates arrive from pg as Date objects still renders", () => {
  const schema = f1EventSchema(weekend({
    date: new Date("2026-12-04T09:30:00Z"),
    end_date: new Date("2026-12-06T13:00:00Z"),
  }));
  assert.equal(schema["@type"], "SportsEvent");
  assert.equal(schema.startDate, "2026-12-04T09:30:00.000Z");
  assert.equal(schema.endDate, "2026-12-06T13:00:00.000Z");
  assert.equal(schema.name, "2026 Abu Dhabi Grand Prix");
});

test("Date-typed dates on the one day are still read as a single day", () => {
  const sameDay = f1EventSchema(weekend({
    date: new Date("2026-12-04T09:30:00Z"),
    end_date: new Date("2026-12-04T15:00:00Z"),
  }));
  assert.equal("endDate" in sameDay, false);
  const noEnd = f1EventSchema(weekend({ date: new Date("2026-12-04T09:30:00Z"), end_date: null }));
  assert.equal("endDate" in noEnd, false);
});
