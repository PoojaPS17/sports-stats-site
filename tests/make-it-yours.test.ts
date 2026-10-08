import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildLogMs, calendarFeedPath, parseSteps, stepsDone } from "../src/lib/makeItYours";
import { decodeFollows } from "../src/lib/followShare";
import type { HomeBlock } from "../src/lib/blockTypes";

const block = (type: HomeBlock["type"], params: Record<string, string>, label: string): HomeBlock => ({ id: `${type}:${JSON.stringify(params)}`, type, params, label });

test("progress counts the saved page plus each step actually taken", () => {
  assert.equal(stepsDone({ phone: false, cal: false, dismissed: false }), 1);
  assert.equal(stepsDone({ phone: true, cal: false, dismissed: false }), 2);
  assert.equal(stepsDone({ phone: true, cal: true, dismissed: true }), 3);
});

test("stored steps parse strictly: anything but true is not done, junk is no strip", () => {
  assert.deepEqual(parseSteps('{"phone":true,"cal":"yes"}'), { phone: true, cal: false, dismissed: false });
  assert.equal(parseSteps(null), null);
  assert.equal(parseSteps("not json"), null);
});

test("the calendar feed covers league teams only, and a page with none has no feed", () => {
  const epl = block("team-next", { league: "epl", team: "arsenal" }, "Arsenal: next three");
  const side = block("team-next", { league: "cricket", team: "6" }, "India: next three");
  assert.equal(calendarFeedPath([side, block("live", {}, "Live")]), null);
  const path = calendarFeedPath([epl, side])!;
  assert.ok(path.startsWith("/calendar/follows?f="));
  const items = decodeFollows(decodeURIComponent(path.split("f=")[1]));
  assert.deepEqual(items.map((i) => [i.kind, i.league, i.refId, i.label]), [["team", "epl", "arsenal", "Arsenal"]]);
});

test("the build log runs a beat per real block and is skipped for reduced motion", () => {
  assert.equal(buildLogMs(0), 520);
  assert.equal(buildLogMs(6), 6 * 170 + 520);
  const src = readFileSync(join(__dirname, "../src/components/home/SportPicker.tsx"), "utf8");
  assert.match(src, /prefers-reduced-motion/);
  assert.match(src, /blocks\.map\(\(b\) => b\.label\)/, "log lines are the blocks being saved");
});
