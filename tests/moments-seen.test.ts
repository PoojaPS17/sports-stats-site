import { test } from "node:test";
import assert from "node:assert/strict";
import type { HomeBlock } from "../src/lib/blockTypes";
import { MAX_BLOCKS, normaliseBlocks } from "../src/lib/homeSetup";
import { SEEN_KEY, SEEN_SESSION_KEY, followedTeams, markVisit, momentsUrl, sinceForVisit, type StoreLike } from "../src/lib/momentsSeen";

const memory = (initial: Record<string, string> = {}): StoreLike & { data: Record<string, string> } => {
  const data = { ...initial };
  return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => void (data[k] = v) };
};
const throwing: StoreLike = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
};
const NOW = 1_790_000_000_000;

test("a first visit has no window, and marking it stores the time in both places", () => {
  const local = memory();
  const session = memory();
  assert.equal(sinceForVisit(local, session, NOW), null);
  markVisit(local, session, NOW);
  assert.equal(local.data[SEEN_KEY], String(NOW));
  assert.equal(session.data[SEEN_SESSION_KEY], String(NOW));
});

test("a return visit catches up from the stored time and pins it for the tab", () => {
  const before = NOW - 3 * 3_600_000;
  const local = memory({ [SEEN_KEY]: String(before) });
  const session = memory();
  assert.equal(sinceForVisit(local, session, NOW), before);
  assert.equal(session.data[SEEN_SESSION_KEY], String(before));
  markVisit(local, session, NOW);
  assert.equal(local.data[SEEN_KEY], String(NOW));
  // A reload in the same tab starts from the same moment, so the block it showed does not vanish.
  assert.equal(sinceForVisit(local, session, NOW + 5000), before);
  assert.equal(session.data[SEEN_SESSION_KEY], String(before));
});

test("a reload right after a first visit has nothing to catch up on", () => {
  const local = memory();
  const session = memory();
  assert.equal(sinceForVisit(local, session, NOW), null);
  markVisit(local, session, NOW);
  assert.equal(sinceForVisit(local, session, NOW + 5000), NOW);
});

test("junk or future stored times read as a first visit", () => {
  for (const bad of ["", "abc", "-1", "0", "1.5", "NaN", String(NOW + 60_000), "99999999999999999999"]) {
    assert.equal(sinceForVisit(memory({ [SEEN_KEY]: bad }), memory(), NOW), null, bad);
  }
});

test("missing or throwing storage never throws and reads as a first visit", () => {
  assert.equal(sinceForVisit(null, null, NOW), null);
  assert.equal(sinceForVisit(throwing, throwing, NOW), null);
  assert.doesNotThrow(() => markVisit(throwing, throwing, NOW));
  assert.doesNotThrow(() => markVisit(null, null, NOW));
});

const team = (league: string, slug: string): HomeBlock => ({ id: `team-next:${league}:${slug}`, type: "team-next", params: { league, team: slug }, label: slug });

test("followedTeams lists the team blocks in order and ignores every other block", () => {
  const blocks: HomeBlock[] = [{ id: "live", type: "live", params: {}, label: "Live" }, team("epl", "arsenal"), { id: "bts", type: "bts", params: {}, label: "Desk" }, team("cricket", "6")];
  assert.equal(followedTeams(blocks), "epl:arsenal,cricket:6");
  assert.equal(followedTeams([blocks[0]]), "");
  assert.equal(followedTeams([]), "");
});

test("followedTeams stays within what the route accepts", () => {
  const many = Array.from({ length: MAX_BLOCKS + 3 }, (_, i) => team("epl", `team-${i}`));
  assert.equal(followedTeams(many).split(",").length, 12);
});

test("momentsUrl carries the teams and whole seconds", () => {
  const url = new URL(momentsUrl("epl:arsenal,cricket:6", 1_790_000_123_999), "http://x");
  assert.equal(url.pathname, "/api/block/moments");
  assert.equal(url.searchParams.get("teams"), "epl:arsenal,cricket:6");
  assert.equal(url.searchParams.get("since"), "1790000123");
});

test("a moments block is never saved in, or shared with, a setup", () => {
  const out = normaliseBlocks([
    { type: "moments", params: { teams: "epl:arsenal", since: "1790000000" }, label: "Moments" },
    { type: "team-next", params: { league: "epl", team: "arsenal" }, label: "Arsenal" },
  ]);
  assert.deepEqual(out?.map((b) => b.type), ["team-next"]);
});
