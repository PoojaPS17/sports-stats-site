import { test } from "node:test";
import assert from "node:assert/strict";
import { blocksForSports, isSportPick, sportLines, SPORT_PICKS } from "../src/lib/sportPicks";
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
