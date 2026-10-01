import { test } from "node:test";
import assert from "node:assert/strict";
import { followToBlock, followsToBlocks, searchResultToBlock } from "../src/lib/followBlocks";
import { paletteGroups } from "../src/lib/blockCatalogue";

test("team, player and series follows become blocks; games and tennis tournaments do not", () => {
  assert.deepEqual(followToBlock({ kind: "team", league: "epl", refId: "arsenal", label: "Arsenal" }), {
    id: "team-next:epl:arsenal", type: "team-next", params: { league: "epl", team: "arsenal" }, label: "Arsenal: next three",
  });
  assert.deepEqual(followToBlock({ kind: "player", league: "ipl", refId: "virat-kohli", label: "Virat Kohli" }), {
    id: "player-form:ipl:virat-kohli", type: "player-form", params: { league: "ipl", player: "virat-kohli" }, label: "Virat Kohli: last five",
  });
  assert.equal(followToBlock({ kind: "series", league: "cricket", refId: "8604-2026", label: "T20 World Cup" })?.label, "T20 World Cup standings");
  assert.equal(followToBlock({ kind: "game", league: "epl", refId: "123", label: "Arsenal v Chelsea" }), null);
  assert.equal(followToBlock({ kind: "tournament", league: "tennis", refId: "1", label: "US Open" }), null);
});

test("search results map the same way and tours are skipped", () => {
  assert.equal(searchResultToBlock({ type: "player", league: "atp", name: "Carlos Alcaraz", slug: "carlos-alcaraz", subtitle: null })?.label, undefined);
  assert.equal(searchResultToBlock({ type: "team", league: "nba", name: "Boston Celtics", slug: "boston-celtics", subtitle: "BOS" })?.id, "team-next:nba:boston-celtics");
  assert.equal(searchResultToBlock({ type: "series", league: "cricket", name: "IPL 2026", slug: "8048-2026", subtitle: null })?.id, "series-standings:8048-2026");
});

test("followsToBlocks drops duplicates and keeps the follow order", () => {
  const out = followsToBlocks([
    { kind: "team", league: "epl", refId: "arsenal", label: "Arsenal" },
    { kind: "team", league: "epl", refId: "arsenal", label: "Arsenal" },
    { kind: "game", league: "epl", refId: "1", label: "x" },
    { kind: "player", league: "nba", refId: "luka-doncic", label: "Luka Dončić" },
  ]);
  assert.deepEqual(out.map((b) => b.id), ["team-next:epl:arsenal", "player-form:nba:luka-doncic"]);
});

test("the palette has four groups and uses the context for cricket sides and the featured series", () => {
  const groups = paletteGroups({ cricketSides: [{ id: "6", name: "India" }], featuredCricketSeries: { id: "8604-2026", name: "T20 World Cup" } });
  assert.deepEqual(groups.map((g) => g.name), ["Cricket", "Football", "US sports", "More"]);
  const cricket = groups[0].blocks.map((b) => b.label);
  assert.ok(cricket.includes("T20 World Cup standings"));
  assert.ok(cricket.includes("India: next three"));
  assert.ok(cricket.includes("IPL standings"));
  assert.deepEqual(groups[2].blocks.map((b) => b.label), ["NFL standings", "NBA standings"]);
  assert.deepEqual(groups[3].blocks.map((b) => b.label), ["Live in your blocks", "F1: driver standings", "Beyond the Scoreline"]);
});
