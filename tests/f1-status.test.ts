import { test } from "node:test";
import assert from "node:assert/strict";
import { f1BackfillSessionStatus, f1EventDescription, f1EventStatus } from "../src/lib/f1Status";

// What ESPN sends for the 2026 season (sports.core.api.espn.com/v2/sports/racing/leagues/f1/seasons/2026/types/2/events, each
// event's competitions[].status): a run session is STATUS_FINAL / state post / completed true / "Final" with the field as
// competitors; the Bahrain (2026-04-10) and Saudi Arabian (2026-04-17) Grands Prix were cancelled: every session
// STATUS_CANCELED / state post / completed false / "Canceled" with no competitors; a future session is STATUS_SCHEDULED /
// state pre / completed false with its start as the detail ("Thu, September 24th at 4:30 AM EDT").

test("f1EventStatus: a race with a winner is a result", () => {
  assert.deepEqual(f1EventStatus({ winner_name: "Max Verstappen", race_status_state: "post", race_completed: true, race_status_detail: "Final" }), { kind: "result", label: null });
});

test("f1EventStatus: a Grand Prix ESPN cancelled is called off, whatever the calendar says", () => {
  assert.deepEqual(f1EventStatus({ winner_name: null, race_status_state: "post", race_completed: false, race_status_detail: "Canceled" }), { kind: "called-off", label: "Cancelled" });
  assert.deepEqual(f1EventStatus({ winner_name: null, race_status_state: "post", race_completed: false, race_status_detail: "Postponed" }), { kind: "called-off", label: "Postponed" });
  assert.deepEqual(f1EventStatus({ winner_name: null, race_status_state: null, race_completed: null, race_status_detail: "Canceled" }), { kind: "called-off", label: "Cancelled" });
});

test("f1EventStatus: a scheduled race is upcoming, and so is one with no race session on file", () => {
  assert.deepEqual(f1EventStatus({ winner_name: null, race_status_state: "post", race_completed: false, race_status_detail: "Sat, September 26th at 7:00 AM EDT" }), { kind: "upcoming", label: null });
  assert.deepEqual(f1EventStatus({ winner_name: null, race_status_state: null, race_completed: null, race_status_detail: null }), { kind: "upcoming", label: null });
});

test("f1EventStatus: a finished race is never called off, even with no winner on file", () => {
  assert.deepEqual(f1EventStatus({ winner_name: null, race_status_state: "post", race_completed: true, race_status_detail: "Final" }), { kind: "upcoming", label: null });
  assert.equal(f1EventStatus({ winner_name: null, race_status_state: "post", race_completed: true, race_status_detail: "Abandoned" }).kind, "upcoming");
});

test("f1BackfillSessionStatus: a session with a status keeps it, so a cancelled one is not marked Final", () => {
  assert.deepEqual(f1BackfillSessionStatus({ type: { state: "post", detail: "Canceled", completed: false } }), { state: "post", detail: "Canceled", completed: false });
  assert.deepEqual(f1BackfillSessionStatus({ type: { state: "pre", detail: "Thu, September 24th at 4:30 AM EDT", completed: false } }), { state: "pre", detail: "Thu, September 24th at 4:30 AM EDT", completed: false });
  assert.deepEqual(f1BackfillSessionStatus({ type: { state: "post", detail: "Final", completed: true } }), { state: "post", detail: "Final", completed: true });
});

test("f1EventStatus: a Race in play is live, whatever its status text says (a red flag reads Suspended)", () => {
  assert.deepEqual(f1EventStatus({ winner_name: null, race_status_state: "in", race_completed: false, race_status_detail: "Suspended" }), { kind: "live", label: "Live" });
  assert.deepEqual(f1EventStatus({ winner_name: null, race_status_state: "in", race_completed: false, race_status_detail: "In Progress" }), { kind: "live", label: "Live" });
});

test("f1BackfillSessionStatus: a post status with no completed flag is a finished session, as the old backfill stored it, unless it says cancelled", () => {
  assert.deepEqual(f1BackfillSessionStatus({ type: { state: "post", detail: "Final" } }), { state: "post", detail: "Final", completed: true });
  assert.deepEqual(f1BackfillSessionStatus({ type: { state: "post" } }), { state: "post", detail: "", completed: true });
  assert.deepEqual(f1BackfillSessionStatus({ type: { state: "post", detail: "Canceled" } }), { state: "post", detail: "Canceled", completed: false });
  // an explicit completed flag is believed
  assert.deepEqual(f1BackfillSessionStatus({ type: { state: "post", detail: "Final", completed: false } }), { state: "post", detail: "Final", completed: false });
});

test("f1BackfillSessionStatus: with no status to read, a past session is final, as before", () => {
  assert.deepEqual(f1BackfillSessionStatus(null), { state: "post", detail: "Final", completed: true });
  assert.deepEqual(f1BackfillSessionStatus({}), { state: "post", detail: "Final", completed: true });
});

test("f1EventDescription: a result names the winner, a called-off Grand Prix says so, a future one says results are added as sessions finish", () => {
  const base = { name: "Gulf Air Bahrain Grand Prix", race_status_state: "post" as string | null, race_completed: false as boolean | null };
  const at = " at Bahrain International Circuit";
  assert.equal(
    f1EventDescription({ ...base, winner_name: "Max Verstappen", race_status_detail: "Final" }, 2026, at),
    "Max Verstappen won the 2026 Gulf Air Bahrain Grand Prix at Bahrain International Circuit. Classifications for the race, qualifying and practice."
  );
  assert.equal(
    f1EventDescription({ ...base, winner_name: null, race_status_detail: "Canceled" }, 2026, at),
    "The 2026 Gulf Air Bahrain Grand Prix at Bahrain International Circuit was cancelled."
  );
  assert.equal(
    f1EventDescription({ ...base, winner_name: null, race_status_detail: "Postponed" }, 2026, at),
    "The 2026 Gulf Air Bahrain Grand Prix at Bahrain International Circuit was postponed."
  );
  assert.equal(
    f1EventDescription({ ...base, winner_name: null, race_status_detail: "Sat, September 26th at 7:00 AM EDT" }, 2026, at),
    "The 2026 Gulf Air Bahrain Grand Prix at Bahrain International Circuit: practice, qualifying and race classifications, added as each session finishes."
  );
});
