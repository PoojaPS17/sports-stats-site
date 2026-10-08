import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { bigFigure, BADGE, goLabel } from "../src/lib/bestOfWeek";
import { probView } from "../src/lib/rightNow";
import { HomeTabs } from "../src/components/home/HomeTabs";

test("a card's big figure and unit come from the fact's own figure", () => {
  assert.deepEqual(bigFigure({ figure: "112*" }), { num: "112*", unit: "" });
  assert.deepEqual(bigFigure({ figure: "5/23" }), { num: "5/23", unit: "" });
  assert.deepEqual(bigFigure({ figure: "3 goals" }), { num: "3", unit: "goals" });
  assert.deepEqual(bigFigure({ figure: "all 4" }), { num: "all 4", unit: "" });
  assert.deepEqual(bigFigure({ figure: "6 games in a row" }), { num: "6", unit: "games in a row" });
});

test("badges and link words exist for every kind a stored row can prove, and never claim an upset", () => {
  assert.equal(BADGE.hundred, "Hundred");
  assert.equal(BADGE["five-for"], "Five-for");
  assert.ok(!Object.values(BADGE).some((b) => /upset/i.test(b)));
  assert.equal(goLabel({ kind: "hundred", sport: "cricket" }), "Scorecard");
  assert.equal(goLabel({ kind: "win-streak", sport: "nba" }), "Team");
  assert.equal(goLabel({ kind: "forty-points", sport: "nba" }), "Match");
});

test("a win-probability line needs two stored points; its end is the last stored figure", () => {
  assert.equal(probView([{ home: 50 }], "Celtics"), null);
  const v = probView([{ home: 50 }, { home: 80 }, { home: 100 }], "Celtics")!;
  assert.equal(v.endPct, 100);
  assert.equal(v.points, "0.0,50.0 160.0,20.0 320.0,0.0");
});

test("Live now and Coming up are real tabs: tablist, tab, tabpanel, and the default panel shows with scripts off", () => {
  const html = renderToStaticMarkup(createElement(HomeTabs, { initial: "coming", liveCount: 0, live: createElement("p", null, "Nothing in play right now."), coming: createElement("p", null, "Fixture list") }));
  assert.match(html, /role="tablist"/);
  assert.equal((html.match(/role="tab"/g) ?? []).length, 2);
  assert.equal((html.match(/role="tabpanel"/g) ?? []).length, 2);
  assert.match(html, /aria-selected="true"[^>]*>Coming up/);
  // The panel that is not chosen is hidden, the chosen one is not.
  assert.match(html, /id="[^"]*-p-live"[^>]*hidden/);
  assert.doesNotMatch(html, /id="[^"]*-p-coming"[^>]*hidden/);
  assert.match(html, /Nothing in play right now\./);
});
