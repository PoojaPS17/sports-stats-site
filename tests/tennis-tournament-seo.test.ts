import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { fitTitle } from "../src/lib/metadata";
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
