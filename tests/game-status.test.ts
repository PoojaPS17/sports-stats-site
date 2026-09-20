import { test } from "node:test";
import assert from "node:assert/strict";
import { isCalledOff } from "../src/lib/gameStatus";

test("isCalledOff recognises postponed, cancelled, abandoned and suspended games", () => {
  for (const s of ["Postponed", "postponed", "Canceled", "Cancelled", "Abandoned", "Suspended"]) {
    assert.equal(isCalledOff(s), true, s);
  }
});

test("isCalledOff is false for everything else, including missing text", () => {
  for (const s of ["Final", "Scheduled", "", null, undefined]) {
    assert.equal(isCalledOff(s), false, String(s));
  }
});
