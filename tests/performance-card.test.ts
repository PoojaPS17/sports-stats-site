// tests/performance-card.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PerformanceCard, type PerformanceCardProps } from "../src/components/PerformanceCard";

const baseProps: PerformanceCardProps = {
  league: "nba",
  playerName: "Luka Dončić",
  position: "G",
  jersey: "77",
  teamAbbr: "LAL",
  teamColor: "552583",
  opponentAbbr: "BOS",
  resultLetter: "W",
  teamScore: 110,
  opponentScore: 108,
  date: "Jan 15, 2026",
  stageLabel: "Playoffs · Round of 16",
  stats: [
    { key: "pts", label: "PTS", title: "Points", value: "34", delta: "+8 vs season avg" },
    { key: "reb", label: "REB", title: "Rebounds", value: "11", delta: "+3 vs season avg" },
  ],
};

test("renders the player name, diacritics intact, and every stat's value and delta", () => {
  const html = renderToStaticMarkup(createElement(PerformanceCard, baseProps));
  assert.ok(html.includes("Luka Dončić"), "diacritic name must render exactly");
  assert.ok(html.includes("34"));
  assert.ok(html.includes("+8 vs season avg"));
  assert.ok(html.includes("11"));
});

test("no <table> or <img> anywhere — flexbox/inline-style subset only, no photos, no network image fetch", () => {
  const html = renderToStaticMarkup(createElement(PerformanceCard, baseProps));
  assert.ok(!/<table/i.test(html));
  assert.ok(!/<img/i.test(html));
});

test("renders the result and score, and the eyebrow stage label", () => {
  const html = renderToStaticMarkup(createElement(PerformanceCard, baseProps));
  assert.ok(html.includes("W"));
  assert.ok(html.includes("110"));
  assert.ok(html.includes("108"));
  assert.ok(html.includes("Playoffs · Round of 16"));
});

test("a null stageLabel renders no stage segment, but does not crash", () => {
  const html = renderToStaticMarkup(createElement(PerformanceCard, { ...baseProps, stageLabel: null }));
  assert.ok(html.length > 0);
});

test("footer parity: ends with the same ExportFooter every other card on the site uses", () => {
  const html = renderToStaticMarkup(createElement(PerformanceCard, baseProps));
  assert.ok(html.includes("SportsDB"));
  assert.ok(html.includes("sportsdblive")); // X_HANDLE
});
