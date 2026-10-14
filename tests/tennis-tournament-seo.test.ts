import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { fitTitle } from "../src/lib/metadata";
import { absoluteUrl } from "../src/lib/site";
import { tennisTournamentDescription, tennisTournamentTitleCandidates, tournamentState } from "../src/lib/tennisTournamentSeo";

const open = {
  name: "China Open",
  season: 2026,
  location: "Beijing, China PR",
  tour: "wta" as const,
  start_date: "2026-09-24",
  end_date: "2026-10-05",
  match_count: 60,
  completed_count: 59,
  champions: [] as { competition_type: string; names: string[] }[],
};
const done = { ...open, completed_count: 60, champions: [{ competition_type: "womens-singles", names: ["A Player"] }, { competition_type: "womens-doubles", names: ["B Player", "C Player"] }] };

test("the event's state on a day: upcoming before its dates, live inside them until the singles final, finished after", () => {
  assert.equal(tournamentState(open, "2026-09-20"), "upcoming");
  assert.equal(tournamentState(open, "2026-10-01"), "live");
  assert.equal(tournamentState(done, "2026-10-05"), "finished", "the final is decided on the last day");
  assert.equal(tournamentState(open, "2026-10-09"), "finished");
  assert.equal(tournamentState({ ...open, start_date: null, end_date: null, match_count: 0, completed_count: 0 }, "2026-10-01"), "upcoming", "no dates and no matches yet");
});

test("titles say what the page holds, in the words searchers type, longest first", () => {
  assert.deepEqual(tennisTournamentTitleCandidates(done, "2026-10-09"), ["China Open 2026 Results, Scores & Champions", "China Open 2026 Results & Scores", "China Open 2026 Results", "China Open 2026"]);
  assert.deepEqual(tennisTournamentTitleCandidates(open, "2026-10-01"), ["China Open 2026 Live Scores, Draw & Results", "China Open 2026 Scores & Results", "China Open 2026 Results", "China Open 2026"]);
  assert.deepEqual(tennisTournamentTitleCandidates(open, "2026-09-20"), ["China Open 2026 Draw, Schedule & Results", "China Open 2026 Draw & Schedule", "China Open 2026 Draw", "China Open 2026"]);
  assert.equal(fitTitle(...tennisTournamentTitleCandidates(done, "2026-10-09")), "China Open 2026 Results, Scores & Champions");
  // A long Slam name still fits one of the forms.
  const slam = { ...done, name: "Australian Open presented by a Very Long Sponsor Name", tour: "both" as const };
  assert.ok(fitTitle(...tennisTournamentTitleCandidates(slam, "2026-10-09")).length <= 59);
});

test("descriptions name the place, the dates and the champions once there are any", () => {
  assert.equal(tennisTournamentDescription(done, "2026-10-09"), "China Open 2026 results from Beijing, China PR: every match by round with set scores. Women's Singles: A Player; Women's Doubles: B Player / C Player.");
  assert.equal(tennisTournamentDescription(open, "2026-10-01"), "China Open 2026 live scores and results from Beijing, China PR, Sep 24 – Oct 5, 2026: every match by round with set scores, updated through the event.");
  assert.equal(tennisTournamentDescription(open, "2026-09-20"), "China Open 2026 draw and schedule from Beijing, China PR, Sep 24 – Oct 5, 2026. Results and set scores for every match once play begins.");
  assert.equal(tennisTournamentDescription({ ...done, location: null }, "2026-10-09"), "China Open 2026 results: every match by round with set scores. Women's Singles: A Player; Women's Doubles: B Player / C Player.");
});

test("the tournament page builds its title and description from the helpers", () => {
  const page = readFileSync(fileURLToPath(new URL("../src/app/tennis/tournaments/[id]/page.tsx", import.meta.url)), "utf8");
  assert.match(page, /fitTitle\(\.\.\.tennisTournamentTitleCandidates\(t, today\)\)/);
  assert.match(page, /tennisTournamentDescription\(t, today\)/);
});

// Names as ESPN files them (the 2025 and 2026 calendars), and what people search.
test("the sponsor, and a year already in the name, are dropped from the tournament name", async () => {
  const { tournamentDisplayName } = await import("../src/lib/tennisTournamentSeo");
  const cases: [string, number, string][] = [
    ["Brisbane International presented by ANZ", 2026, "Brisbane International"],
    ["Mubadala Abu Dhabi Open presented by Abu Dhabi Sports Council", 2026, "Mubadala Abu Dhabi Open"],
    ["Transylvania Open powered by Kaufland", 2026, "Transylvania Open"],
    ["BMW Open by Bitpanda", 2026, "BMW Open"],
    ["Grand Prix Open Villa de Madrid by Silverway", 2026, "Grand Prix Open Villa de Madrid"],
    ["Mifel Tennis Open by Telcel Oppo", 2026, "Mifel Tennis Open"],
    ["Tucumán Open by McDonald's", 2025, "Tucumán Open"],
    ["Axeria Open 2026 powered by Intaro Sport", 2026, "Axeria Open"],
    ["Cerity Partners Hall of Fame Open for the Van Alen Cup Presented by the Margaret Fund", 2026, "Cerity Partners Hall of Fame Open for the Van Alen Cup"],
    ["Next Gen ATP Finals presented by PIF", 2026, "Next Gen ATP Finals"],
    ["Australian Open", 2026, "Australian Open"],
    ["Wimbledon", 2026, "Wimbledon"],
    ["China Open", 2026, "China Open"],
    ["2026", 2026, "2026"], // nothing left once the year goes: kept as filed
  ];
  for (const [name, season, want] of cases) assert.equal(tournamentDisplayName(name, season), want, name);
});

test("titles, descriptions and schema use the clean name; the filed name stays as an alternate", async () => {
  const { tennisTournamentSchema } = await import("../src/lib/structuredData");
  const t = { ...done, name: "National Bank Open presented by Rogers", espn_id: "123", tour: "both" as const };
  assert.deepEqual(tennisTournamentTitleCandidates(t, "2026-10-09")[0], "National Bank Open 2026 Results, Scores & Champions");
  assert.match(tennisTournamentDescription(t, "2026-10-09"), /^National Bank Open 2026 \(Canadian Open\) results from Beijing/);
  const s = tennisTournamentSchema(t);
  assert.equal(s["@type"], "SportsEvent");
  assert.equal(s.name, "National Bank Open 2026");
  assert.deepEqual(s.alternateName, ["National Bank Open presented by Rogers", "Canadian Open"]);
  assert.equal(s.startDate, "2026-09-24");
  assert.equal(s.endDate, "2026-10-05");
  assert.equal(s.url, absoluteUrl("/tennis/tournaments/123"));
  assert.equal("organizer" in s, false, "a joint ATP and WTA event has no single organizer");
  const plain = tennisTournamentSchema({ ...done, espn_id: "9", tour: "wta" });
  assert.equal("alternateName" in plain, false);
  assert.deepEqual(plain.organizer, { "@type": "SportsOrganization", name: "WTA" });
});

test("the tournament page emits the event and breadcrumb schema and shows the clean name", () => {
  const src = readFileSync(fileURLToPath(new URL("../src/app/tennis/tournaments/[id]/page.tsx", import.meta.url)), "utf8");
  assert.match(src, /tennisTournamentSchema\(t\)/);
  assert.match(src, /breadcrumbSchema\(/);
  assert.doesNotMatch(src, /\{t\.name\}/);
});
