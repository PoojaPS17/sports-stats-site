import { test } from "node:test";
import assert from "node:assert/strict";
import { blockId } from "../src/lib/blockTypes";
import { BLOCK_CACHE_SECONDS, cacheHeader, isBlockType, validateBlockParams } from "../src/lib/blockParams";

test("blockId is the type alone without params, else the type and the param values in key order", () => {
  assert.equal(blockId("live", {}), "live");
  assert.equal(blockId("team-next", { team: "arsenal", league: "epl" }), "team-next:epl:arsenal");
});

test("isBlockType accepts the seven types and nothing else", () => {
  for (const t of ["live", "team-next", "standings", "series-standings", "player-form", "f1-drivers", "bts"]) assert.equal(isBlockType(t), true);
  assert.equal(isBlockType("news"), false);
  assert.equal(isBlockType(""), false);
});

test("parameterless types ignore stray params", () => {
  assert.deepEqual(validateBlockParams("live", { league: "epl" }), { ok: true, params: {} });
  assert.deepEqual(validateBlockParams("bts", {}), { ok: true, params: {} });
});

test("team-next takes a league and a team slug, or cricket and a side id", () => {
  assert.deepEqual(validateBlockParams("team-next", { league: "epl", team: "arsenal" }), { ok: true, params: { league: "epl", team: "arsenal" } });
  assert.deepEqual(validateBlockParams("team-next", { league: "cricket", team: "6" }), { ok: true, params: { league: "cricket", team: "6" } });
  assert.equal(validateBlockParams("team-next", { league: "cricket", team: "india" }).ok, false);
  assert.equal(validateBlockParams("team-next", { league: "f1", team: "ferrari" }).ok, false);
  assert.equal(validateBlockParams("team-next", { league: "epl", team: "Arsenal FC" }).ok, false);
  assert.equal(validateBlockParams("team-next", { league: "epl" }).ok, false);
});

test("standings needs a league that has a table", () => {
  assert.deepEqual(validateBlockParams("standings", { league: "nba" }), { ok: true, params: { league: "nba" } });
  assert.equal(validateBlockParams("standings", { league: "odi" }).ok, false);
  assert.equal(validateBlockParams("standings", { league: "tennis" }).ok, false);
});

test("series-standings takes a cricket series id", () => {
  assert.deepEqual(validateBlockParams("series-standings", { series: "8048-2026" }), { ok: true, params: { series: "8048-2026" } });
  assert.deepEqual(validateBlockParams("series-standings", { series: "21284-2026-27" }), { ok: true, params: { series: "21284-2026-27" } });
  assert.equal(validateBlockParams("series-standings", { series: "1-2-3-4" }).ok, false);
  assert.equal(validateBlockParams("series-standings", { series: "ipl" }).ok, false);
});

test("player-form takes a league and a player slug", () => {
  assert.deepEqual(validateBlockParams("player-form", { league: "ipl", player: "virat-kohli" }), { ok: true, params: { league: "ipl", player: "virat-kohli" } });
  assert.equal(validateBlockParams("player-form", { league: "atp", player: "carlos-alcaraz" }).ok, false);
  assert.equal(validateBlockParams("player-form", { league: "nba", player: "" }).ok, false);
});

test("cache lifetimes follow the spec and the header carries four times the lifetime as stale window", () => {
  assert.deepEqual(BLOCK_CACHE_SECONDS, { live: 30, "team-next": 60, standings: 900, "series-standings": 900, "player-form": 900, "f1-drivers": 3600, bts: 3600 });
  assert.equal(cacheHeader("live"), "public, s-maxage=30, stale-while-revalidate=120");
  assert.equal(cacheHeader("bts"), "public, s-maxage=3600, stale-while-revalidate=14400");
});
