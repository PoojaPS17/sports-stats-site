import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addBlock,
  clearSetup,
  decodeSetup,
  encodeSetup,
  isSetup,
  MAX_BLOCKS,
  moveBlock,
  newSetup,
  normaliseBlocks,
  parseStored,
  readSetup,
  removeBlock,
  reorderBlocks,
  writeDeclined,
  writeSetup,
  type HomeSetup,
} from "../src/lib/homeSetup";
import { blockId, type HomeBlock } from "../src/lib/blockTypes";

const live: HomeBlock = { id: "live", type: "live", params: {}, label: "Live in your blocks" };
const epl: HomeBlock = { id: blockId("standings", { league: "epl" }), type: "standings", params: { league: "epl" }, label: "Premier League standings" };
const kohli: HomeBlock = { id: blockId("player-form", { league: "ipl", player: "virat-kohli" }), type: "player-form", params: { league: "ipl", player: "virat-kohli" }, label: "Kohli: last five" };

test("newSetup stamps version, dates and copies the blocks", () => {
  const s = newSetup("IN", "IN", [live, epl]);
  assert.equal(s.v, 1);
  assert.equal(s.edition, "IN");
  assert.equal(s.country, "IN");
  assert.deepEqual(s.blocks.map((b) => b.id), ["live", "standings:epl"]);
  assert.ok(s.createdAt > 0 && s.updatedAt >= s.createdAt);
});

test("normaliseBlocks drops invalid, duplicate and over-limit blocks and recomputes ids", () => {
  const out = normaliseBlocks([
    { id: "wrong", type: "standings", params: { league: "epl" }, label: "Premier League standings" },
    { id: "standings:epl", type: "standings", params: { league: "epl" }, label: "Premier League standings" },
    { id: "x", type: "news", params: {}, label: "News" },
    { id: "y", type: "team-next", params: { league: "epl" }, label: "No team" },
    "garbage",
  ]);
  assert.deepEqual(out?.map((b) => b.id), ["standings:epl"]);
  const many = Array.from({ length: 20 }, (_, i) => ({ id: "", type: "player-form", params: { league: "nba", player: `p-${i}` }, label: `P ${i}` }));
  assert.equal(normaliseBlocks(many)?.length, MAX_BLOCKS);
  assert.equal(normaliseBlocks("nope"), null);
});

test("parseStored returns a setup, a declined marker, or null for anything else", () => {
  const s = newSetup("world", null, [live]);
  const back = parseStored(JSON.stringify(s));
  assert.ok(back && isSetup(back));
  assert.equal(back.blocks[0].id, "live");
  assert.deepEqual(parseStored(JSON.stringify({ v: 1, declined: true })), { v: 1, declined: true });
  assert.equal(parseStored(JSON.stringify({ v: 2, blocks: [] })), null);
  assert.equal(parseStored("{not json"), null);
  assert.equal(parseStored(null), null);
  assert.equal(parseStored(JSON.stringify({ ...s, blocks: [] })), null);
});

test("encodeSetup and decodeSetup round-trip without the dates, as a URL-safe string", () => {
  const s = newSetup("IN", "IN", [live, epl, kohli]);
  const encoded = encodeSetup(s);
  assert.match(encoded, /^[A-Za-z0-9_-]+$/);
  const back = decodeSetup(encoded);
  assert.ok(back);
  assert.equal(back.edition, "IN");
  assert.deepEqual(back.blocks.map((b) => b.label), ["Live in your blocks", "Premier League standings", "Kohli: last five"]);
  assert.ok(back.createdAt > 0);
});

test("decodeSetup rejects garbage, wrong versions, unknown types and over-long lists", () => {
  assert.equal(decodeSetup("not base64!"), null);
  assert.equal(decodeSetup(Buffer.from(JSON.stringify({ v: 2, blocks: [live] })).toString("base64url")), null);
  assert.equal(decodeSetup(Buffer.from(JSON.stringify({ v: 1, edition: "IN", country: null, blocks: [{ id: "x", type: "news", params: {}, label: "N" }] })).toString("base64url")), null);
  const many = Array.from({ length: 13 }, (_, i) => ({ id: "", type: "standings", params: { league: "epl" }, label: `${i}` }));
  assert.equal(decodeSetup(Buffer.from(JSON.stringify({ v: 1, edition: "IN", country: null, blocks: many })).toString("base64url")), null);
});

test("a twelve-block setup encodes to under 2,500 characters", () => {
  const blocks = Array.from({ length: 12 }, (_, i) => ({ id: "", type: "player-form" as const, params: { league: "nba", player: `a-long-player-name-${i}` }, label: `A Long Player Name ${i}: last five` }));
  assert.ok(encodeSetup(newSetup("US", "US", blocks)).length < 2500);
});

test("list edits are pure and respect the limit", () => {
  const s: HomeSetup = newSetup("IN", "IN", [live, epl]);
  const added = addBlock(s, kohli);
  assert.deepEqual(added.blocks.map((b) => b.id), ["live", "standings:epl", "player-form:ipl:virat-kohli"]);
  assert.deepEqual(s.blocks.map((b) => b.id), ["live", "standings:epl"]);
  assert.equal(addBlock(added, kohli), added);
  assert.deepEqual(removeBlock(added, "standings:epl").blocks.map((b) => b.id), ["live", "player-form:ipl:virat-kohli"]);
  assert.deepEqual(moveBlock(added, "player-form:ipl:virat-kohli", -1).blocks.map((b) => b.id), ["live", "player-form:ipl:virat-kohli", "standings:epl"]);
  assert.equal(moveBlock(added, "live", -1), added);
  assert.deepEqual(reorderBlocks(added, ["standings:epl", "live"]).blocks.map((b) => b.id), ["standings:epl", "live", "player-form:ipl:virat-kohli"]);
  const full = newSetup("IN", "IN", Array.from({ length: 12 }, (_, i) => ({ id: "", type: "player-form" as const, params: { league: "nba", player: `p-${i}` }, label: `P ${i}: last five` })));
  assert.equal(addBlock(full, kohli), full);
});

test("storage functions are no-ops outside a browser (no window)", () => {
  assert.doesNotThrow(() => writeSetup(newSetup("world", null, [])));
  assert.doesNotThrow(() => writeDeclined());
  assert.doesNotThrow(() => clearSetup());
  assert.equal(readSetup(), null);
});
