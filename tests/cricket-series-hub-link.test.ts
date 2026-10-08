import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { seriesHubStandingsLink } from "../src/lib/cricketSeriesHubLink";

// Series mapped to a hub (SERIES_LEAGUE_SQL) skip ESPN's points table on the series page; the group tables live on the hub's standings page.
test("seriesHubStandingsLink: the men's T20 World Cup points at /t20wc/standings", () => {
  assert.deepEqual(seriesHubStandingsLink("t20wc"), { href: "/t20wc/standings", prefix: "Group tables and standings:", label: "T20 World Cup standings" });
});

test("seriesHubStandingsLink: the women's T20 World Cup says Women's and points at /wt20wc/standings", () => {
  const l = seriesHubStandingsLink("wt20wc");
  assert.equal(l?.href, "/wt20wc/standings");
  assert.equal(l?.label, "Women's T20 World Cup standings");
  assert.equal(l?.prefix, "Group tables and standings:");
});

test("seriesHubStandingsLink: a league (IPL) says points table, not group tables", () => {
  const l = seriesHubStandingsLink("ipl");
  assert.equal(l?.href, "/ipl/standings");
  assert.equal(l?.prefix, "Points table and standings:");
});

test("seriesHubStandingsLink: no hub, no link; a hub without a standings route, no link", () => {
  assert.equal(seriesHubStandingsLink(null), null);
  assert.equal(seriesHubStandingsLink("t20i"), null);
});

test("every league the series mapping can return resolves", () => {
  const src = readFileSync(new URL("../src/lib/cricketSeries.ts", import.meta.url), "utf8");
  const mapped = [...src.matchAll(/then '([a-z0-9]+)'/g)].map((m) => m[1]);
  assert.ok(mapped.includes("t20wc") && mapped.includes("wt20wc"));
  for (const league of mapped) assert.equal(seriesHubStandingsLink(league as never)?.href, `/${league}/standings`);
});
