import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFollowsFeed } from "../src/lib/ics";

// These cases return before the database is asked, so they run without one.
test("a list with no team or match yields a valid empty calendar", async () => {
  const feed = await buildFollowsFeed([
    { kind: "player", league: "nba", refId: "luka-doncic" },
    { kind: "series", league: "cricket", refId: "8604-2026" },
    { kind: "tournament", league: "tennis", refId: "1" },
  ]);
  assert.equal(feed.filename, "my-follows.ics");
  assert.match(feed.ics, /^BEGIN:VCALENDAR/);
  assert.match(feed.ics, /END:VCALENDAR\s*$/);
  assert.doesNotMatch(feed.ics, /BEGIN:VEVENT/);
});

test("a team or match in a league we do not carry is ignored", async () => {
  const feed = await buildFollowsFeed([
    { kind: "team", league: "not-a-league", refId: "x" },
    { kind: "game", league: "also-not", refId: "1" },
  ]);
  assert.doesNotMatch(feed.ics, /BEGIN:VEVENT/);
});
