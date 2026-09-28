import { test } from "node:test";
import assert from "node:assert/strict";
import { outcome, redirectTo } from "./helpers/nextErrors";
import { ALL_LEAGUES, LEAGUES } from "../src/lib/leagues";

// /nba/scores and /epl/scores were 404s: the only page below /scores answers for a named day, so
// the bare address had nothing behind it, while /tennis/scores has redirected since launch. A
// visitor who types one of these has asked for a real thing the site holds.
const params = (league: string) => ({ params: Promise.resolve({ league }) });
const load = () => import("../src/app/[league]/scores/page");

test("a league's bare scores address sends the visitor to the league's own page", async () => {
  const { default: page } = await load();
  for (const league of ALL_LEAGUES) {
    assert.deepEqual(await redirectTo(() => page(params(league))), { url: `/${league}`, status: 308 }, league);
  }
  // The four with their own front page are the ones most likely to be typed in.
  assert.deepEqual(LEAGUES, ["epl", "nfl", "nba", "ipl"], "and those include the main four");
});

test("a first segment that is not a league still 404s here, rather than bouncing to a 404", async () => {
  const { default: page } = await load();
  for (const notALeague of ["hockey", "nba-2", "scores", "..", "%2e%2e"]) {
    assert.equal(await outcome(() => Promise.resolve(page(params(notALeague)))), "not-found", notALeague);
  }
});

test("the redirect is permanent, so the address settles rather than being re-fetched forever", async () => {
  const { default: page } = await load();
  const { status } = await redirectTo(() => page(params("nba")));
  assert.equal(status, 308, "308, like the /tennis/scores rule in next.config.ts");
});
