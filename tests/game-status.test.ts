import { test } from "node:test";
import assert from "node:assert/strict";
import { calledOffLabel, isCalledOff, isGameCalledOff } from "../src/lib/gameStatus";

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

test("calledOffLabel names why a called-off game was closed, and is null for anything else", () => {
  assert.equal(calledOffLabel("Postponed"), "Postponed");
  assert.equal(calledOffLabel("Canceled"), "Cancelled");
  assert.equal(calledOffLabel("Cancelled"), "Cancelled");
  assert.equal(calledOffLabel("Match abandoned"), "Abandoned");
  assert.equal(calledOffLabel("Suspended"), "Suspended");
  for (const s of ["Final", "Scheduled", "", null, undefined]) {
    assert.equal(calledOffLabel(s), null, String(s));
  }
});

test("isGameCalledOff is true only for an unfinished called-off game", () => {
  assert.equal(isGameCalledOff({ completed: false, status_detail: "Postponed" }), true);
  assert.equal(isGameCalledOff({ completed: false, status_detail: "Canceled" }), true);
  // a finished abandoned cricket match is a result
  assert.equal(isGameCalledOff({ completed: true, status_detail: "Abandoned" }), false);
  assert.equal(isGameCalledOff({ completed: false, status_detail: "Scheduled" }), false);
  assert.equal(isGameCalledOff({ completed: false, status_detail: null }), false);
});
