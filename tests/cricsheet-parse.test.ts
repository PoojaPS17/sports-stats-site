// What the Cricsheet importer stores per match: who is on the scorecard, and who gets a card. Cricinfo lists
// a not-out batter who never faced a ball as "0* (0)" and counts an innings; its Matches column counts every
// appearance in the XI, whether or not the player batted, bowled or took a catch.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCards, buildScorecard, parseMatch } from "../scripts/lib/cricsheet-parse";

// Cricsheet person id -> Cricinfo id, as people.csv gives it.
const register = new Map<string, string | null>(
  ["a1", "a2", "a3", "a4", "b1", "b2", "b3", "b4", "s1", "s2"].map((k, i) => [`id-${k}`, String(101 + i)])
);
const cricinfo = (k: string) => register.get(`id-${k}`)!;
const registry = Object.fromEntries([...register.keys()].map((ident) => [ident.replace("id-", "P-"), ident]));
const nameOf = (k: string) => `P-${k}`;

const ball = (batter: string, nonStriker: string, bowler: string, batterRuns: number, extra: Record<string, unknown> = {}) => ({
  batter: nameOf(batter),
  non_striker: nameOf(nonStriker),
  bowler: nameOf(bowler),
  runs: { batter: batterRuns, extras: 0, total: batterRuns },
  ...extra,
});

function matchJson(over: Record<string, unknown> = {}) {
  return {
    info: {
      teams: ["Team A", "Team B"],
      dates: ["2025-03-01"],
      match_type: "T20",
      gender: "male",
      players: { "Team A": ["P-a1", "P-a2", "P-a3", "P-a4"], "Team B": ["P-b1", "P-b2", "P-b3", "P-b4"] },
      registry: { people: registry },
      ...over,
    },
    innings: [
      {
        team: "Team A",
        overs: [
          {
            over: 0,
            deliveries: [
              ball("a1", "a2", "b1", 4),
              // a1 is caught by b3; a2 comes on strike with a3 at the other end and a3 never faces a ball.
              ball("a1", "a2", "b1", 0, { wickets: [{ player_out: "P-a1", kind: "caught", fielders: [{ name: "P-b3" }] }] }),
              ball("a2", "a3", "b1", 1),
            ],
          },
        ],
      },
      {
        team: "Team B",
        target: { runs: 6, overs: 20 },
        overs: [
          {
            over: 0,
            deliveries: [
              // b1 hits the winning runs; b2 stands at the other end throughout and never faces.
              ball("b1", "b2", "a2", 6),
            ],
          },
        ],
      },
    ],
  };
}

function parse(over?: Record<string, unknown>) {
  const m = parseMatch("900001", matchJson(over), register);
  assert.ok(m);
  return m;
}

const team = (name: string) => ({ espn_id: name === "Team A" ? "1" : "2", name });
const teamOf = (m: NonNullable<ReturnType<typeof parseMatch>>) => (id: string) => (m.squads.get(id) ? team(m.squads.get(id)!).espn_id : null);

test("a not-out non-striker who never faced a ball is on the scorecard as 0 not out (0)", () => {
  const m = parse();
  const card = buildScorecard(m, team, (id) => id);
  const chase = card[1].battingRows;
  assert.deepEqual(chase.map((r) => r.athleteId), [cricinfo("b1"), cricinfo("b2")]);
  assert.deepEqual(chase[1].stats, ["0", "0", "0", "0", "-"]);
  // The same in the first innings: a3 came to the crease and was there at the end.
  assert.deepEqual(card[0].battingRows.map((r) => r.athleteId), [cricinfo("a1"), cricinfo("a2"), cricinfo("a3")]);
});

test("his card counts an innings, not out, with no balls faced", () => {
  const m = parse();
  const cards = buildCards(m, teamOf(m), (id) => id);
  assert.deepEqual(cards.get(cricinfo("b2"))?.batting, { runs: 0, ballsFaced: 0, fours: 0, sixes: 0, notOut: true });
  assert.deepEqual(cards.get(cricinfo("a3"))?.batting, { runs: 0, ballsFaced: 0, fours: 0, sixes: 0, notOut: true });
  // Dismissed for a real score: out, so not a not-out.
  assert.equal(cards.get(cricinfo("a1"))?.batting?.notOut, false);
});

test("a wicket in the innings is still counted once, and a batter run out at the far end who never faced still bats", () => {
  const data = matchJson();
  data.innings[1].overs[0].deliveries.push(
    ball("b1", "b2", "a2", 0, { wickets: [{ player_out: "P-b2", kind: "run out", fielders: [{ name: "P-a3" }] }] })
  );
  const m = parseMatch("900001", data, register)!;
  const chase = m.innings[1];
  assert.equal(chase.wickets, 1);
  assert.equal(chase.batters.find((b) => b.id === cricinfo("b2"))?.out, true);
});

test("an XI player who never batted, bowled or caught gets an empty card", () => {
  const m = parse();
  const cards = buildCards(m, teamOf(m), (id) => id);
  const idle = cards.get(cricinfo("b4"));
  assert.ok(idle, "b4 was in the XI and is a match played");
  assert.equal(idle.teamId, "2");
  assert.equal(idle.batting, undefined);
  assert.equal(idle.bowling, undefined);
  assert.equal(idle.catches, undefined);
  // What is written to player_game_stats: no keys at all, and no "undefined" in the JSON.
  assert.equal(JSON.stringify({ batting: idle.batting, bowling: idle.bowling, catches: idle.catches }), "{}");
  assert.ok(cards.has(cricinfo("a4")));
});

test("a player who is not in either XI gets no card", () => {
  const m = parse();
  const cards = buildCards(m, teamOf(m), (id) => id);
  assert.equal(cards.has(cricinfo("s1")), false);
  assert.equal(cards.has(cricinfo("s2")), false);
  // One card per squad member and nobody else: 4 + 4.
  assert.equal(cards.size, 8);
});

test("a substitute who came on and did nothing gets no card, one who took a catch does", () => {
  const m = parse({
    players: { "Team A": ["P-a1", "P-a2", "P-a3", "P-a4", "P-s1"], "Team B": ["P-b1", "P-b2", "P-b3", "P-b4", "P-s2"] },
    replacements: {
      match: [
        { in: "P-s1", out: "P-a4", team: "Team A", reason: "concussion_substitute" },
        { in: "P-s2", out: "P-b4", team: "Team B", reason: "impact_player" },
      ],
    },
  });
  // s2 takes the catch that dismisses a1 in place of b3.
  m.innings[0].catches.set(cricinfo("s2"), 1);
  const cards = buildCards(m, teamOf(m), (id) => id);
  assert.equal(cards.has(cricinfo("s1")), false, "s1 was named but never took part");
  assert.equal(cards.get(cricinfo("s2"))?.catches, 1);
  assert.ok(cards.has(cricinfo("a4")), "the player he replaced was in the XI");
});

test("a catch, a stumping and a bowler's own catch each count once for the fielder", () => {
  const data = matchJson();
  data.innings[0].overs[0].deliveries.push(
    ball("a2", "a3", "b1", 0, { wickets: [{ player_out: "P-a2", kind: "stumped", fielders: [{ name: "P-b3" }] }] }),
    ball("a3", "a4", "b1", 0, { wickets: [{ player_out: "P-a3", kind: "caught and bowled", fielders: [{ name: "P-b1" }] }] })
  );
  const m = parseMatch("900001", data, register)!;
  const cards = buildCards(m, teamOf(m), (id) => id);
  // b3: the caught in the base match plus the stumping.
  assert.equal(cards.get(cricinfo("b3"))?.catches, 2);
  assert.equal(cards.get(cricinfo("b1"))?.catches, 1);
});
