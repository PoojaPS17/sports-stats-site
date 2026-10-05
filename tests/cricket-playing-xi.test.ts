import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { playingXi } from "../src/lib/cricketPlayingXi";

// ESPN's cricket summary (site.web.api.espn.com/apis/site/v2/sports/cricket/8048/summary?event=<id>) carries each side's
// squad under rosters[].roster[]: `captain` and `starter` flags, the match role under `position.name` ("Wicketkeeper",
// "Bowler", "Allrounder", "Unknown") and the player's usual role under athlete.position ("Opening batter", "Bowling
// allrounder", "Unknown"). The fixture is the President's Trophy 2026-27 match 1553790, trimmed to those fields.
const summary = JSON.parse(readFileSync(new URL("./fixtures/espn-cricket-summary-1553790.json", import.meta.url), "utf8"));

test("playingXi: one list per side, in roster order, eleven players each", () => {
  const xi = playingXi(summary);
  assert.deepEqual(
    xi.map((t) => [t.teamId, t.team, t.players.length]),
    [
      ["2831", "Khan Research Laboratories", 11],
      ["1549016", "Hyderabad Kingsmen Academy", 11],
    ]
  );
  assert.deepEqual(xi[0].players.slice(0, 2).map((p) => p.name), ["Shahzaib Khan", "Asim Ali"]);
});

test("playingXi: the captain and the wicketkeeper are marked, the usual role is kept when ESPN knows it", () => {
  const krl = playingXi(summary)[0].players;
  const captain = krl.find((p) => p.captain);
  assert.equal(captain?.name, "Iftikhar Ahmed");
  assert.equal(captain?.role, "Middle-order batter");
  const keeper = krl.find((p) => p.keeper);
  assert.equal(keeper?.name, "Asim Ali");
  // "Unknown" is ESPN's placeholder, not a role.
  assert.equal(keeper?.role, null);
  assert.equal(krl.filter((p) => p.captain).length, 1);
  assert.equal(krl.filter((p) => p.keeper).length, 1);
  assert.equal(krl.find((p) => p.name === "Arshad Iqbal")?.role, "Bowler");
});

test("playingXi: only the starters when ESPN flags them, everyone when it does not", () => {
  const withSubs = {
    rosters: [
      {
        team: { id: "1", displayName: "A" },
        roster: [
          { captain: false, starter: true, position: { name: "Unknown" }, athlete: { id: "10", displayName: "In" } },
          { captain: false, starter: false, position: { name: "Unknown" }, athlete: { id: "11", displayName: "Sub" } },
        ],
      },
    ],
  };
  assert.deepEqual(playingXi(withSubs)[0].players.map((p) => p.name), ["In"]);
  const noFlags = { rosters: [{ team: { id: "1", displayName: "A" }, roster: [{ athlete: { id: "10", displayName: "One" } }, { athlete: { id: "11", displayName: "Two" } }] }] };
  assert.deepEqual(playingXi(noFlags)[0].players.map((p) => p.name), ["One", "Two"]);
});

test("playingXi: no rosters, an empty roster or an error body gives nothing", () => {
  assert.deepEqual(playingXi(null), []);
  assert.deepEqual(playingXi({ code: 2502, detail: "bad gateway" }), []);
  assert.deepEqual(playingXi({ rosters: [{ team: { id: "1", displayName: "A" }, roster: [] }] }), []);
});
