import { test } from "node:test";
import assert from "node:assert/strict";
import { blocksForSports, isSportPick, sportLines, SPORT_PICKS, trayPlaceholders, untilLabel } from "../src/lib/sportPicks";
import { editionFor, type EditionContext } from "../src/lib/editions";
import { blockId } from "../src/lib/blockTypes";
import { MAX_BLOCKS, normaliseBlocks } from "../src/lib/homeSetup";

const ctx: EditionContext = {
  cricketSides: [
    { id: "6", name: "India" },
    { id: "1", name: "England" },
  ],
  featuredCricketSeries: { id: "8604-2026", name: "ICC Men's T20 World Cup" },
};

const labels = (sports: Parameters<typeof blocksForSports>[0], code: string | null = null, extra = []) =>
  blocksForSports(sports, editionFor(code), ctx, extra).map((b) => b.label);

test("no sport picked builds nothing", () => {
  assert.deepEqual(blocksForSports([], editionFor("IN"), ctx), []);
});

test("live scores come first and the desk last, whatever is picked", () => {
  const l = labels(["f1"]);
  assert.equal(l[0], "Live in your blocks");
  assert.equal(l[l.length - 1], "Beyond the Scoreline");
});

test("cricket adds the national side and the featured series, only when the context has them", () => {
  assert.deepEqual(labels(["cricket"], "IN"), ["Live in your blocks", "India: next three", "ICC Men's T20 World Cup standings", "Beyond the Scoreline"]);
  const bare = blocksForSports(["cricket"], editionFor("IN"), { cricketSides: [], featuredCricketSeries: null }).map((b) => b.label);
  assert.deepEqual(bare, ["Live in your blocks", "Beyond the Scoreline"]);
});

test("football adds the visitor's domestic league first, then the Premier League and the Champions League", () => {
  assert.deepEqual(labels(["football"], "DE"), ["Live in your blocks", "Bundesliga standings", "Premier League standings", "Champions League standings", "Beyond the Scoreline"]);
  assert.deepEqual(labels(["football"]), ["Live in your blocks", "Premier League standings", "Champions League standings", "Beyond the Scoreline"]);
});

test("each US sport adds its own table, tennis adds nothing beyond the live block, F1 adds the drivers", () => {
  assert.deepEqual(labels(["nfl", "nba", "mlb"]), ["Live in your blocks", "NFL standings", "NBA standings", "MLB standings", "Beyond the Scoreline"]);
  assert.deepEqual(labels(["tennis"]), ["Live in your blocks", "Beyond the Scoreline"]);
  assert.deepEqual(labels(["f1"]), ["Live in your blocks", "F1: driver standings", "Beyond the Scoreline"]);
});

test("sports keep the order they were tapped in", () => {
  assert.deepEqual(labels(["nba", "cricket"], "IN"), ["Live in your blocks", "NBA standings", "India: next three", "ICC Men's T20 World Cup standings", "Beyond the Scoreline"]);
});

test("added teams sit between the sports and the desk, and a repeat of a sport's own block is dropped", () => {
  const side = { id: "6", name: "India" };
  const extra = [{ id: blockId("team-next", { league: "cricket", team: "6" }), type: "team-next" as const, params: { league: "cricket", team: "6" }, label: "India: next three" }];
  const l = labels(["cricket"], "IN", extra as never);
  assert.equal(l.filter((x) => x === `${side.name}: next three`).length, 1);
  assert.equal(l[l.length - 1], "Beyond the Scoreline");
});

test("the list is capped at the setup limit, keeps the live block and still ends on the desk", () => {
  const extra = Array.from({ length: 20 }, (_, i) => ({ id: `team-next:cricket:${i}`, type: "team-next" as const, params: { league: "cricket", team: String(i) }, label: `Side ${i}` }));
  const blocks = blocksForSports([...SPORT_PICKS], editionFor("IN"), ctx, extra);
  assert.equal(blocks.length, MAX_BLOCKS);
  assert.equal(blocks[0].type, "live");
  assert.equal(blocks[blocks.length - 1].type, "bts");
});

test("every block a pick builds survives the setup validator unchanged", () => {
  const blocks = blocksForSports([...SPORT_PICKS], editionFor("IN"), ctx);
  const normalised = normaliseBlocks(blocks);
  assert.ok(normalised);
  assert.deepEqual(normalised.map((b) => b.id), blocks.map((b) => b.id));
});

test("isSportPick accepts the seven sports and nothing else", () => {
  for (const s of SPORT_PICKS) assert.ok(isSportPick(s));
  assert.ok(!isSportPick("rugby"));
  assert.ok(!isSportPick(""));
});

test("tile lines say how many are live when anything is, else what the sport covers", () => {
  const lines = sportLines({
    liveCricket: 6,
    liveTennis: 0,
    sections: [
      { league: "epl", liveCount: 2 },
      { league: "ucl", liveCount: 1 },
      { league: "mlb", liveCount: 1 },
      { league: "nfl", liveCount: 0 },
    ],
  });
  assert.equal(lines.cricket.text, "6 live now");
  assert.equal(lines.football.text, "3 live now");
  assert.equal(lines.mlb.text, "1 live now");
  assert.equal(lines.nfl.text, "Scores, tables, leaders");
  assert.equal(lines.tennis.text, "Live matches, draws");
  assert.equal(lines.f1.live, 0);
});

const NOW = new Date("2026-10-08T12:00:00Z");
const inH = (h: number) => new Date(NOW.getTime() + h * 3_600_000).toISOString();
const base = { liveCricket: 0, liveTennis: 0, sections: [], now: NOW };

test("untilLabel is elapsed time only and null for a date that has passed", () => {
  assert.equal(untilLabel(inH(5), NOW, "Next game"), "Next game in 5 hours");
  assert.equal(untilLabel(inH(1.2), NOW, "Next game"), "Next game in 1 hour");
  assert.equal(untilLabel(inH(0.4), NOW, "Next game"), "Next game within the hour");
  assert.equal(untilLabel(inH(24 * 13), NOW, "Next game"), "Next game in 13 days");
  assert.equal(untilLabel(inH(-1), NOW, "Next game"), null);
  assert.equal(untilLabel(null, NOW, "Next game"), null);
});

test("tile lines count live games in every league, not only the four headline sections", () => {
  const lines = sportLines({ ...base, liveCricket: 2, sections: [], liveGames: [{ league: "mls" }, { league: "mls" }, { league: "mlb" }, { league: "ipl" }] });
  assert.equal(lines.football.text, "2 live now");
  assert.equal(lines.mlb.text, "1 live now");
  assert.equal(lines.cricket.text, "3 live now");
});

test("tile lines show the next fixture, between seasons, or the description when nothing is known", () => {
  const lines = sportLines({
    ...base,
    nextFixtures: { epl: inH(30), laliga: inH(80), nfl: inH(5), nba: inH(24 * 13), mlb: null },
    nextCricket: [inH(-2), inH(48)],
    nextTennis: [],
    nextF1: { start: inH(24 * 3), end: inH(24 * 5) },
  });
  assert.equal(lines.football.text, "Next game in 1 day");
  assert.equal(lines.nfl.text, "Next game in 5 hours");
  assert.equal(lines.nba.text, "Next game in 13 days");
  assert.equal(lines.mlb.text, "Between seasons");
  assert.equal(lines.cricket.text, "Next match in 2 days");
  assert.equal(lines.tennis.text, "Live matches, draws");
  assert.equal(lines.f1.text, "Next race in 3 days");
  // A football map that does not cover every league is unknown, not "between seasons".
  assert.equal(sportLines({ ...base, nextFixtures: { epl: null } }).football.text, "Nine leagues");
  // A race weekend under way says so.
  assert.equal(sportLines({ ...base, nextF1: { start: inH(-10), end: inH(20) } }).f1.text, "Race weekend now");
  // Live beats a scheduled fixture.
  assert.equal(sportLines({ ...base, liveTennis: 3, nextTennis: [inH(2)] }).tennis.text, "3 live now");
});

test("the picker tray always shows three rows: blocks first, placeholders after", () => {
  assert.equal(trayPlaceholders(0), 3);
  assert.equal(trayPlaceholders(1), 2);
  assert.equal(trayPlaceholders(3), 0);
  assert.equal(trayPlaceholders(9), 0);
});
