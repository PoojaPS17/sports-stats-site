import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeFollows, encodeFollows, MAX_SHARED } from "../src/lib/followShare";

const arsenal = { kind: "team" as const, league: "epl", refId: "arsenal", label: "Arsenal", sublabel: "Premier League", href: "/epl/teams/arsenal" };
const luka = { kind: "player" as const, league: "nba", refId: "luka-doncic", label: "Luka Dončić", sublabel: undefined, href: "/nba/players/luka-doncic" };

test("a follow list survives a round trip, accents included", () => {
  assert.deepEqual(decodeFollows(encodeFollows([arsenal, luka])), [arsenal, luka]);
});

test("the encoded list is safe in a query string", () => {
  assert.match(encodeFollows([arsenal, luka]), /^[A-Za-z0-9_-]+$/);
});

test("a missing or damaged parameter is an empty list", () => {
  assert.deepEqual(decodeFollows(null), []);
  assert.deepEqual(decodeFollows(""), []);
  assert.deepEqual(decodeFollows("not-base64!!"), []);
  assert.deepEqual(decodeFollows(encodeFollows([arsenal]).slice(0, 10)), []);
});

test("rows with an unknown kind, an off-site link or the wrong shape are dropped", () => {
  const enc = (rows: unknown) => Buffer.from(JSON.stringify(rows)).toString("base64url");
  const rows = [
    ["team", "epl", "arsenal", "Arsenal", "", "/epl/teams/arsenal"],
    ["admin", "epl", "x", "X", "", "/x"],
    ["team", "epl", "evil", "Evil", "", "https://evil.example/"],
    ["team", "epl", "evil2", "Evil", "", "//evil.example/"],
    ["team", "epl", "evil3", "Evil", "", "/\\evil.example"],
    ["team", "epl", "short"],
    ["team", "epl", 7, "Num", "", "/a"],
  ];
  assert.deepEqual(decodeFollows(enc(rows)).map((r) => r.refId), ["arsenal"]);
});

test("a shared list is capped", () => {
  const many = Array.from({ length: 80 }, (_, i) => ({ ...arsenal, refId: `t${i}` }));
  assert.equal(decodeFollows(encodeFollows(many)).length, MAX_SHARED);
});
