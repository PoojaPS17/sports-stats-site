// tests/asian-games-medals-parser.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseMedalTableHtml } from "../scripts/lib/asianGamesMedals";

const fixture = readFileSync(resolve(process.cwd(), "tests/fixtures/asian-games-medal-table.html"), "utf8");

test("parses every real nation row, in source order", () => {
  const rows = parseMedalTableHtml(fixture);
  assert.deepEqual(
    rows.map((r) => r.nation_slug),
    ["china", "japan", "south-korea", "india"]
  );
});

test("reads gold/silver/bronze correctly for a non-rowspanned row", () => {
  const rows = parseMedalTableHtml(fixture);
  const china = rows.find((r) => r.nation_slug === "china")!;
  assert.deepEqual([china.gold, china.silver, china.bronze], [103, 105, 142]);
});

test("a rowspanned rank cell does not shift the following row's columns (Japan and South Korea both read correctly)", () => {
  const rows = parseMedalTableHtml(fixture);
  const japan = rows.find((r) => r.nation_slug === "japan")!;
  const korea = rows.find((r) => r.nation_slug === "south-korea")!;
  assert.deepEqual([japan.gold, japan.silver, japan.bronze], [52, 67, 65]);
  assert.deepEqual([korea.gold, korea.silver, korea.bronze], [52, 50, 60]);
});

test("strips footnote markers and host-nation asterisks from the nation name", () => {
  const rows = parseMedalTableHtml(fixture);
  const india = rows.find((r) => r.nation_slug === "india")!;
  assert.equal(india.nation_name, "India");
});

test("drops the sortbottom Total row", () => {
  const rows = parseMedalTableHtml(fixture);
  assert.equal(rows.some((r) => /total/i.test(r.nation_name)), false);
  assert.equal(rows.length, 4);
});

test("returns an empty array for HTML with no gold/silver/bronze table", () => {
  assert.deepEqual(parseMedalTableHtml("<html><body><table class=\"wikitable\"><tr><th>A</th><th>B</th></tr></table></body></html>"), []);
});
