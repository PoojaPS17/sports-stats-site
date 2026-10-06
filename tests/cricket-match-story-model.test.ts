import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deriveMatchStory } from "../src/lib/cricketBalls";
import { matchStoryModel } from "../src/lib/cricketMatchStoryModel";

const items = JSON.parse(readFileSync(new URL("./fixtures/espn-cricket-playbyplay-1529230.json", import.meta.url), "utf8")) as unknown[];
const story = deriveMatchStory(items);
const near = (a: number, b: number, msg?: string) => assert.ok(Math.abs(a - b) < 0.11, msg ?? `${a} is not within 0.1 of ${b}`);

test("the worm starts at the origin and ends at each side's total", () => {
  const m = matchStoryModel(story);
  assert.equal(m.overLimit, 20);
  assert.equal(m.worm.length, 2);
  assert.ok(m.worm[0].points.startsWith(`${m.plot.x0},${m.plot.y1}`));
  assert.equal(m.worm[0].end.label, "171");
  assert.equal(m.worm[1].end.label, "172/2");
  const lastInd = m.worm[1].points.split(" ").at(-1)!.split(",").map(Number);
  const span = m.plot.x1 - m.plot.x0;
  near(lastInd[0], m.plot.x0 + (14.67 / 20) * span);
  near(lastInd[1], m.plot.y1 - (172 / 200) * (m.plot.y1 - m.plot.y0));
});

test("wicket markers sit on the line at the fall of wicket", () => {
  const m = matchStoryModel(story);
  assert.equal(m.wormWickets.length, 12);
  const first = m.wormWickets[0];
  assert.equal(first.teamId, "4");
  near(first.x, m.plot.x0 + (4.5 / 20) * (m.plot.x1 - m.plot.x0));
  near(first.y, m.plot.y1 - (38 / 200) * (m.plot.y1 - m.plot.y0));
});

test("bars are one per side per over, scaled to the biggest over rounded up to a multiple of six", () => {
  const m = matchStoryModel(story);
  assert.equal(m.bars.length, 35);
  const big = m.bars.find((b) => b.teamId === "6" && b.over === 14)!;
  near(big.h, m.plot.y1 - m.plot.y0);
  assert.deepEqual(
    m.barGrid.map((g) => g.label),
    ["0", "6", "12", "18", "24"]
  );
  const zero = m.bars.find((b) => b.teamId === "4" && b.over === 6)!;
  assert.equal(zero.h, 2);
  assert.equal(zero.wickets, 2);
  const pair = m.bars.filter((b) => b.over === 3);
  assert.ok(pair[1].x > pair[0].x + pair[0].w, "the two sides' bars for an over sit side by side");
});

test("hit zones cover every over to the limit and the default over is the biggest", () => {
  const m = matchStoryModel(story);
  assert.equal(m.hitZones.length, 20);
  assert.equal(m.defaultOver, 14);
  assert.deepEqual(
    m.axis.map((a) => a.label),
    ["Overs", "5", "10", "15", "20"]
  );
});

test("an ODI gets a 50-over frame and a 10-over axis", () => {
  const long = story.map((inn) => ({ ...inn, overs: Array.from({ length: 50 }, (_, i) => ({ number: i + 1, runs: 5, wickets: 0, balls: [] })) }));
  const m = matchStoryModel(long);
  assert.equal(m.overLimit, 50);
  assert.deepEqual(
    m.axis.map((a) => a.label),
    ["Overs", "10", "20", "30", "40", "50"]
  );
  assert.equal(m.hitZones.length, 50);
});

test("the frame follows ESPN's over limit: a rain-reduced match is drawn on its own axis", () => {
  const short = story.map((inn) => ({ ...inn, limit: 8, overs: inn.overs.slice(0, 8), worm: inn.worm.slice(0, 8), wickets: inn.wickets.filter((w) => w.over < 8) }));
  const m = matchStoryModel(short);
  assert.equal(m.overLimit, 8);
  assert.equal(m.hitZones.length, 8);
  assert.deepEqual(
    m.axis.map((a) => a.label),
    ["Overs", "5", "8"]
  );
});

test("worm lines and bars carry their innings period so a super over keeps its own key and style", () => {
  const superOver = { ...story[0], period: 3, overs: story[0].overs.slice(0, 1), worm: story[0].worm.slice(0, 1), wickets: [], partnerships: [] };
  const m = matchStoryModel([...story, superOver]);
  assert.deepEqual(
    m.worm.map((w) => w.period),
    [1, 2, 3]
  );
  assert.ok(m.bars.some((b) => b.period === 3));
});

test("an empty story still gives a drawable frame", () => {
  const m = matchStoryModel([]);
  assert.equal(m.overLimit, 20);
  assert.deepEqual(m.worm, []);
  assert.equal(m.defaultOver, 1);
});

test("two innings that end close together keep their end labels apart", () => {
  // Both sides finish near the same corner: a chase won in the last over (3rd ODI: 351/7 and 352/5).
  const close = story.map((inn, i) => ({ ...inn, total: { ...inn.total, runs: 351 + i, wickets: 7 - 2 * i }, worm: inn.worm.map((p, j, arr) => (j === arr.length - 1 ? { ...p, over: 49.5 + i * 0.2, runs: 351 + i } : p)) }));
  const m = matchStoryModel(close);
  const [a, b] = m.worm.map((w) => w.end);
  assert.ok(Math.abs(a.y - b.y) >= 13.9, `labels ${a.y} and ${b.y} would overlap`);
});
