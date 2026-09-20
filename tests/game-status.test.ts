import { test } from "node:test";
import assert from "node:assert/strict";
import { calledOffLabel, gameCalledOffLabel, schemaEventStatus, isCalledOff, isGameCalledOff } from "../src/lib/gameStatus";

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

test("a game whose status text says cancelled or postponed was never played, even if it is stored as completed", () => {
  // cricket rows written before the writer stopped reading state post as finished, and tennis rows, can be stored completed
  assert.equal(isGameCalledOff({ completed: true, status_state: "post", status_detail: "Canceled" }), true);
  assert.equal(gameCalledOffLabel({ completed: true, status_state: "post", status_detail: "Canceled" }), "Cancelled");
  assert.equal(isGameCalledOff({ completed: true, status_state: "post", status_detail: "Postponed" }), true);
  // abandoned and suspended are results once finished; a finished game is otherwise never called off
  assert.equal(isGameCalledOff({ completed: true, status_state: "post", status_detail: "Abandoned" }), false);
  assert.equal(isGameCalledOff({ completed: true, status_state: "post", status_detail: "Suspended" }), false);
  assert.equal(isGameCalledOff({ completed: true, status_state: "post", status_detail: "Final" }), false);
  // a game in play stays live
  assert.equal(isGameCalledOff({ completed: true, status_state: "in", status_detail: "Postponed" }), false);
});

test("gameCalledOffLabel gives the label for an unfinished called-off game and null for everything else", () => {
  assert.equal(gameCalledOffLabel({ completed: false, status_state: "post", status_detail: "Postponed" }), "Postponed");
  assert.equal(gameCalledOffLabel({ completed: false, status_detail: "Canceled" }), "Cancelled");
  assert.equal(gameCalledOffLabel({ completed: true, status_state: "post", status_detail: "Abandoned" }), null);
  assert.equal(gameCalledOffLabel({ completed: false, status_state: "pre", status_detail: "Scheduled" }), null);
});

test("schemaEventStatus: called-off games are postponed or cancelled to a crawler, everything else scheduled", () => {
  const g = (completed: boolean, status_state: string | null, status_detail: string | null) => ({ completed, status_state, status_detail });
  assert.equal(schemaEventStatus(g(false, "post", "Postponed")), "https://schema.org/EventPostponed");
  assert.equal(schemaEventStatus(g(false, "post", "Suspended")), "https://schema.org/EventPostponed");
  assert.equal(schemaEventStatus(g(false, "post", "Canceled")), "https://schema.org/EventCancelled");
  assert.equal(schemaEventStatus(g(false, "post", "Abandoned")), "https://schema.org/EventCancelled");
  // fixtures, live games and results (schema.org has no "finished" status) are scheduled
  assert.equal(schemaEventStatus(g(false, "pre", "Scheduled")), "https://schema.org/EventScheduled");
  assert.equal(schemaEventStatus(g(false, "in", "Suspended")), "https://schema.org/EventScheduled");
  assert.equal(schemaEventStatus(g(true, "post", "Abandoned")), "https://schema.org/EventScheduled");
  assert.equal(schemaEventStatus(g(true, "post", "Final")), "https://schema.org/EventScheduled");
});
