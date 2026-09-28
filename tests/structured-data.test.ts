import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { athleteHeight, athleteSchema, athleteWeight, blogPostingSchema, breadcrumbSchema, cricketSeriesMatchSchema, gameSchema, organizationSchema, teamSchema, tennisPlayerSchema } from "../src/lib/structuredData";
import type { GameRow } from "../src/lib/queries";
import { SITE_URL } from "../src/lib/site";

// The Organization logo was /icon.png, which does not exist (Next serves the generated icon at a
// hashed address), so Google's logo fetch got a 404. A file under public/ is served at its own path.
test("the Organization logo is a real, square, sufficiently large PNG under public/", () => {
  const logo = organizationSchema().logo;
  assert.ok(logo.startsWith(`${SITE_URL}/`), `${logo} is on the site's own origin`);
  const file = new URL(`../public${logo.slice(SITE_URL.length)}`, import.meta.url);
  assert.ok(existsSync(file), `${logo} must exist as ${file.pathname}`);
  const png = readFileSync(file);
  assert.equal(png.subarray(1, 4).toString(), "PNG");
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  assert.equal(width, height, "Google wants a square logo");
  assert.ok(width >= 112, `logo is ${width}px; Google's minimum is 112px`);
});

test("a tennis player is a Person at their own page, with an image only when they have one", () => {
  const withImage = tennisPlayerSchema("atp", { name: "Hugo Grenier", slug: "hugo-grenier", headshot_url: "https://a.espncdn.com/h.png" });
  assert.equal(withImage["@type"], "Person");
  assert.equal(withImage.url, `${SITE_URL}/tennis/atp/players/hugo-grenier`);
  assert.equal(withImage.image, "https://a.espncdn.com/h.png");
  const bare = tennisPlayerSchema("wta", { name: "A B", slug: "a-b", headshot_url: null });
  assert.equal("image" in bare, false);
  assert.equal("nationality" in bare, false, "a country code is not a name, so none is claimed");
});

test("a breadcrumb trail starts at Home and links every step but the last", () => {
  const list = breadcrumbSchema([{ label: "Tennis", href: "/tennis" }, { label: "ATP", href: "/tennis/atp" }, { label: "Hugo Grenier" }]).itemListElement;
  assert.deepEqual(list.map((i) => i.name), ["Home", "Tennis", "ATP", "Hugo Grenier"]);
  assert.deepEqual(list.map((i) => i.position), [1, 2, 3, 4]);
  assert.equal(list[0].item, `${SITE_URL}/`);
  assert.equal(list[3].item, undefined);
  assert.deepEqual(breadcrumbSchema([{ label: "Cricket series" }]).itemListElement.map((i) => i.name), ["Home", "Cricket series"]);
});

test("a BlogPosting names the desk as author, reuses the Organization publisher, and links its own page", () => {
  const schema = blogPostingSchema({ slug: "second-gold-asian-record", title: "T", dek: "D", publishedAt: "2026-09-25" });
  assert.equal(schema["@type"], "BlogPosting");
  assert.equal(schema.headline, "T");
  assert.equal(schema.description, "D");
  assert.equal(schema.datePublished, "2026-09-25");
  assert.equal(schema.url, `${SITE_URL}/beyond-the-scoreline/second-gold-asian-record`);
  assert.equal(schema.publisher.name, organizationSchema().name);
  assert.deepEqual(schema.author, { "@type": "Organization", name: "Beyond the Scoreline Desk", url: `${SITE_URL}/beyond-the-scoreline` });
});

/* ---- SportsEvent: the fields Search Console asks for ---------------------------- */
// Google's Event type is built for ticketed entertainment, so it asks for fields a
// fixture page cannot honestly answer. These tests pin down the two we refuse to
// invent (offers, and endDate for a sport that plays in a day) alongside the ones
// we do have real data for.

const row = (over: Partial<GameRow> = {}): GameRow =>
  ({
    league: "nba", espn_id: "401585", date: "2026-01-14T00:30:00Z", name: "x", short_name: null,
    home_score: 110, away_score: 105, home_score_display: null, away_score_display: null,
    home_winner: true, away_winner: false, season_year: 2026,
    status_state: "post", status_detail: "Final", status_summary: null, round: null, completed: true,
    home_team_espn_id: "13", away_team_espn_id: "2",
    home_name: "Lakers", home_slug: "lakers", home_abbr: "LAL", home_logo: null, home_color: null,
    away_name: "Celtics", away_slug: "celtics", away_abbr: "BOS", away_logo: null, away_color: null,
    home_venue_name: "Crypto.com Arena", home_venue_city: "Los Angeles", home_venue_state: "CA", home_venue_country: "USA",
    ...over,
  }) as GameRow;

test("a game event carries its own share image and names both teams as performers", () => {
  const schema = gameSchema("nba", row(), "Crypto.com Arena");
  assert.equal(schema.image, `${SITE_URL}/nba/games/401585/opengraph-image`);
  assert.deepEqual(schema.performer, schema.competitor, "the performers of a match are the two sides playing it");
  assert.equal(schema.performer.length, 2);
});

test("the organizing league links its own hub page", () => {
  assert.equal(gameSchema("epl", row({ league: "epl" }), null).organizer.url, `${SITE_URL}/epl`);
});

test("the venue's address is claimed only when the match was played at the home team's own ground", () => {
  const home = gameSchema("nba", row(), "Crypto.com Arena");
  assert.deepEqual(home.location, {
    "@type": "Place",
    name: "Crypto.com Arena",
    address: { "@type": "PostalAddress", addressLocality: "Los Angeles", addressRegion: "CA", addressCountry: "USA" },
  });
  // a neutral-site game is somewhere else entirely, so the home team's city would be a false claim
  const abroad = gameSchema("nba", row({ neutral_site: true }), "Arena CDMX");
  assert.deepEqual(abroad.location, { "@type": "Place", name: "Arena CDMX" });
  // and a venue we hold no address for says only its name
  const unknown = gameSchema("ipl", row({ league: "ipl", home_venue_name: null, home_venue_city: null }), "Wankhede Stadium");
  assert.deepEqual(unknown.location, { "@type": "Place", name: "Wankhede Stadium" });
});

test("a game that is not a finished result still describes itself", () => {
  const upcoming = gameSchema("nba", row({ completed: false, status_state: "pre", status_detail: "Scheduled", home_score: null, away_score: null }), "Crypto.com Arena");
  assert.equal(upcoming.description, "NBA: Celtics at Lakers, Crypto.com Arena.");
  const postponed = gameSchema("nba", row({ completed: false, status_state: "post", status_summary: "Postponed", home_score: null, away_score: null }), null);
  assert.equal(postponed.description, "NBA: Celtics at Lakers. Postponed.");
  // a finished game keeps the score line it already had
  assert.equal(gameSchema("nba", row(), null).description, "Final score: Celtics 105, Lakers 110.");
});

test("endDate is claimed only for a match that really ran past its first day", () => {
  const test5 = gameSchema("test", row({ league: "test", local_date: "2026-01-14", end_date: "2026-01-18" }), null);
  assert.equal(test5.endDate, "2026-01-18");
  // a one-day sport has no stored end, and guessing one would be a false claim
  assert.equal("endDate" in gameSchema("nba", row(), null), false);
  // a cricket match that finished inside its first day ends when it started
  assert.equal("endDate" in gameSchema("ipl", row({ league: "ipl", local_date: "2026-01-14", end_date: "2026-01-14" }), null), false);
});

test("no game or match event ever claims to sell tickets", () => {
  // We are a stats site with no ticketing of any kind; Search Console asks for `offers`
  // because its Event type is built for ticketed entertainment. Inventing one would be
  // fabricated structured data, so this warning stays open on purpose.
  assert.equal("offers" in gameSchema("nba", row(), "Crypto.com Arena"), false);
  assert.equal("offers" in cricketMatch(), false);
});

const cricketMatch = (over: Record<string, unknown> = {}) =>
  cricketSeriesMatchSchema({
    espn_id: "1449", name: "India v Australia", date: "2026-01-14T09:00:00Z",
    series_espn_id: "8048", series_name: "Australia tour of India",
    status_summary: "India won by 6 wickets", status_state: "post",
    home: { name: "India", logo: null }, away: { name: "Australia", logo: null },
    ...over,
  } as Parameters<typeof cricketSeriesMatchSchema>[0], null);

test("a series match links the series as its organizer and names both sides as performers", () => {
  const schema = cricketMatch();
  assert.equal(schema.organizer.url, `${SITE_URL}/cricket/series/8048`);
  assert.deepEqual(schema.performer, schema.competitor);
  assert.equal(schema.description, "India won by 6 wickets");
});

test("a series match that has not finished describes itself as the fixture it is", () => {
  const upcoming = cricketMatch({ status_state: "pre", status_summary: null });
  assert.equal(upcoming.description, "Australia tour of India: India v Australia.");
});

test("the image a game event points at is a share-card route that exists", () => {
  // Google fetches this URL; if the route file ever goes, the schema would advertise a 404.
  const image = gameSchema("nba", row(), null).image;
  const route = image.slice(`${SITE_URL}/`.length).replace("nba/games/401585", "[league]/games/[id]");
  assert.ok(existsSync(new URL(`../src/app/${route}.tsx`, import.meta.url)), `${route}.tsx must exist`);
});

test("a team's ground carries a structured address, not a bare city string", () => {
  // It said address: "New York" — valid Text, but it threw away the region and country the
  // database already holds, and gave a consumer nothing it could parse.
  const knicks = teamSchema("nba", {
    name: "New York Knicks", slug: "new-york-knicks", logo_url: null,
    venue_name: "Madison Square Garden", venue_city: "New York", venue_state: "NY", venue_country: "USA",
  });
  assert.deepEqual(knicks.location, {
    "@type": "Place",
    name: "Madison Square Garden",
    address: { "@type": "PostalAddress", addressLocality: "New York", addressRegion: "NY", addressCountry: "USA" },
  });
  // a ground we know by name only says only its name
  const bare = teamSchema("ipl", { name: "Chennai", slug: "chennai", logo_url: null, venue_name: "Chepauk" });
  assert.deepEqual(bare.location, { "@type": "Place", name: "Chepauk" });
});

test("an article's publisher is a nested node, not a second document with its own @context", () => {
  // organizationSchema() is written to stand alone at the top level; embedding it whole put a
  // redundant @context inside the BlogPosting, which is the one place it means nothing.
  const publisher = blogPostingSchema({ slug: "s", title: "T", dek: "D", publishedAt: "2026-09-25" }).publisher;
  assert.equal("@context" in publisher, false);
  assert.equal(publisher["@type"], "Organization");
  assert.equal(publisher.logo, organizationSchema().logo, "and it is still the same organisation");
});

test("an article carries the image it already shares", () => {
  // Articles are typeset, not photographed, but the art is still the article's own: its key number
  // on the sport-coloured panel, drawn by the opengraph-image route beside the page. Every article
  // used to point here at the site's generic card, so five pieces shared one picture.
  const schema = blogPostingSchema({ slug: "s", title: "T", dek: "D", publishedAt: "2026-09-25" });
  assert.equal(schema.image, `${SITE_URL}/beyond-the-scoreline/s/opengraph-image`);
  assert.equal("dateModified" in schema, false, "nothing records when an article was last edited");
});

// ESPN gives a roster row its height and weight as display text, and the schema passed that text
// straight out: `"height": "6' 9\""` is a string where schema.org wants a Distance, so a reader
// gets a caption rather than a measurement. The two shapes below are the only ones the feed
// produces - checked against the live NBA, NFL and Premier League rosters, which are all imperial.
test("a player's height and weight are measurements, not captions", () => {
  assert.deepEqual(athleteHeight(`6' 9"`), { "@type": "QuantitativeValue", value: 81, unitCode: "INH" });
  assert.deepEqual(athleteHeight(`5' 10"`), { "@type": "QuantitativeValue", value: 70, unitCode: "INH" });
  assert.deepEqual(athleteHeight(`6' 0"`), { "@type": "QuantitativeValue", value: 72, unitCode: "INH" }, "a round number of feet is still inches");
  assert.deepEqual(athleteWeight("250 lbs"), { "@type": "QuantitativeValue", value: 250, unitCode: "LBR" });
  assert.deepEqual(athleteWeight("159 lbs"), { "@type": "QuantitativeValue", value: 159, unitCode: "LBR" });
});

test("a measurement in a shape the feed has never sent keeps its text rather than vanishing", () => {
  // Worse than a QuantitativeValue, no worse than what shipped before: the page shows the figure
  // either way, and dropping it would lose a fact to gain tidiness.
  for (const odd of ["188 cm", "6ft 9in", "", "unknown"]) assert.equal(athleteHeight(odd), odd);
  for (const odd of ["85 kg", "250", "n/a"]) assert.equal(athleteWeight(odd), odd);
});

test("the Person block carries the measurements and omits what the roster has no figure for", () => {
  const player = { name: "A Player", slug: "a-player", headshot_url: null, team_name: "Los Angeles Lakers", team_slug: "los-angeles-lakers" };
  const full = athleteSchema("nba", { ...player, height: `6' 9"`, weight: "250 lbs" });
  assert.equal(full["@type"], "Person");
  assert.deepEqual(full.height, { "@type": "QuantitativeValue", value: 81, unitCode: "INH" });
  assert.deepEqual(full.weight, { "@type": "QuantitativeValue", value: 250, unitCode: "LBR" });

  // Cricket rosters carry no heights or weights at all, so the keys stay off rather than going out empty.
  const bare = athleteSchema("ipl", { ...player, height: null, weight: null });
  assert.equal("height" in bare, false);
  assert.equal("weight" in bare, false);
});
