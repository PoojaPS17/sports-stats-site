import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { classifyPath, internalPath } from "../src/lib/funnel";

test("paths are classified into the kinds the funnel reports on", () => {
  const cases: [string, string][] = [
    ["/", "home"],
    ["/epl", "league"],
    ["/epl/games/401", "match"],
    ["/epl/games/final/401", "match"],
    ["/cricket/matches/1553790", "match"],
    ["/cricket/series/8048", "series"],
    ["/cricket/series", "other"],
    ["/nba/players/lebron-james", "player"],
    ["/nba/players", "other"],
    ["/f1/drivers/verstappen", "player"],
    ["/f1/events/12", "match"],
    ["/tennis/atp/players/sinner", "player"],
    ["/epl/teams/arsenal", "team"],
    ["/epl/compare/players", "compare"],
    ["/epl/h2h/arsenal-vs-chelsea", "compare"],
    ["/epl/standings/2025", "standings"],
    ["/epl/scores/2026-10-07", "scores"],
    ["/beyond-the-scoreline/some-story", "article"],
    ["/search", "search"],
    ["/top-games", "top-games"],
    ["/privacy", "other"],
  ];
  for (const [path, kind] of cases) assert.equal(classifyPath(path), kind, path);
  assert.equal(classifyPath("/epl/games/401?x=1#top"), "match");
});

test("only links that leave the current page for another page of this site count", () => {
  const o = "https://sports-db.live";
  assert.equal(internalPath("/epl/games/1", o, "/"), "/epl/games/1");
  assert.equal(internalPath("https://sports-db.live/epl", o, "/"), "/epl");
  assert.equal(internalPath("https://example.com/x", o, "/"), null);
  assert.equal(internalPath("mailto:a@b.c", o, "/"), null);
  assert.equal(internalPath("#section", o, "/epl"), null);
});

test("the listener is mounted with analytics, so it follows the consent choice", () => {
  const read = (rel: string) => readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), "utf8");
  assert.match(read("src/components/GoogleAnalytics.tsx"), /<FunnelEvents \/>/);
  assert.match(read("src/components/FunnelEvents.tsx"), /window\.gtag\("event", "funnel_click"/);
  assert.match(read("src/components/GoogleAnalytics.tsx"), /if \(!GA_ID\) return null;[\s\S]*<FunnelEvents \/>/, "nothing mounts without a GA id");
});
