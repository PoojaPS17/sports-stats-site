import { test } from "node:test";
import assert from "node:assert/strict";
import { ogPosition } from "../src/lib/ogCard";

test("a real position is kept, trimmed", () => {
  assert.equal(ogPosition("G"), "G");
  assert.equal(ogPosition(" WK "), "WK");
});

test("a placeholder or missing position is dropped", () => {
  for (const p of ["UKN", "ukn", "Unknown", "N/A", "-", "--", "", "  ", null, undefined]) assert.equal(ogPosition(p), null, String(p));
});
