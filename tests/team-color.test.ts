import { test } from "node:test";
import assert from "node:assert/strict";
import { teamHex, stripeStyle } from "../src/lib/teamColor";

test("teamHex accepts ESPN's bare hex and a leading #", () => {
  assert.equal(teamHex("003594"), "#003594");
  assert.equal(teamHex("#FB4F14"), "#fb4f14");
  assert.equal(teamHex("fff"), "#ffffff");
});

test("teamHex falls back on nothing or garbage", () => {
  assert.equal(teamHex(null), "#64748b");
  assert.equal(teamHex("not a colour"), "#64748b");
  assert.equal(teamHex(undefined, "#000000"), "#000000");
});

test("stripeStyle sets both custom properties", () => {
  assert.deepEqual(stripeStyle("003594", null), { "--c1": "#003594", "--c2": "#64748b" });
});
