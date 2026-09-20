import { test } from "node:test";
import assert from "node:assert/strict";
import { calledOffLabel, gameCalledOffLabel, isCalledOff, isGameCalledOff } from "../src/lib/gameStatus";

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

test("a game in play is live, whatever its status text says: it is never called off", () => {
  assert.equal(isGameCalledOff({ completed: false, status_state: "in", status_detail: "Suspended" }), false);
  assert.equal(gameCalledOffLabel({ completed: false, status_state: "in", status_detail: "Suspended" }), null);
  // the same text on a game that is not in play is called off
  assert.equal(isGameCalledOff({ completed: false, status_state: "post", status_detail: "Suspended" }), true);
  assert.equal(isGameCalledOff({ completed: false, status_state: "pre", status_detail: "Suspended" }), true);
});

test("gameCalledOffLabel gives the label for an unfinished called-off game and null for everything else", () => {
  assert.equal(gameCalledOffLabel({ completed: false, status_state: "post", status_detail: "Postponed" }), "Postponed");
  assert.equal(gameCalledOffLabel({ completed: false, status_detail: "Canceled" }), "Cancelled");
  assert.equal(gameCalledOffLabel({ completed: true, status_state: "post", status_detail: "Abandoned" }), null);
  assert.equal(gameCalledOffLabel({ completed: false, status_state: "pre", status_detail: "Scheduled" }), null);
});
