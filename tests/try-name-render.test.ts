import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TryNameIsland, resultLabels } from "../src/components/home/TryNameIsland";
import { smallCard, type TryCard } from "../src/lib/tryCard";
import type { SearchResult } from "../src/lib/queries";

// What the server ships for "Try a name": the default card is in the HTML for everyone (so crawlers have it and the
// section is never an empty box), and the section hides itself for a visitor who already has a setup.

const card: TryCard = {
  ...smallCard({ league: "odi", slug: "ravi-test", name: "Ravi Test", team_name: "Alpha", team_color: "1470af" }),
  stats: [
    { value: "1050", label: "Runs" },
    { value: "105.00", label: "Average" },
    { value: "5", label: "100s" },
  ],
  statsCaption: "ODIs on this site · 11 matches",
  barsCaption: "Runs, last 3 innings",
  bars: [
    { value: 50, label: "50", title: "v Beta", href: "/odi/games/o1" },
    { value: 60, label: "60", title: "v Beta", href: "/odi/games/o2" },
    { value: 80, label: "80*", title: "v Beta", href: "/odi/games/o3" },
  ],
  insight: { lead: "", strong: "Averages 80.00 against Beta", tail: " in 6 innings, the best of the sides faced in 5 or more innings on this site." },
  note: "On this site: ODIs from stored scorecards, not an all-time career total.",
  small: false,
};

const html = (c: TryCard | null, chips = [{ league: "odi", slug: "ravi-test", name: "Ravi Test" }]) => renderToStaticMarkup(createElement(TryNameIsland, { initial: c, chips }));

test("the default card is in the server HTML with its figures, bars, insight and links", () => {
  const out = html(card);
  for (const text of ["Ravi Test", "1050", "105.00", "Averages 80.00 against Beta", "Full profile", "+ Follow Ravi Test", "Runs, last 3 innings", "ODIs on this site"]) assert.ok(out.includes(text), text);
  assert.ok(out.includes('href="/odi/players/ravi-test"'));
  assert.ok(out.includes('href="/odi/games/o3"'), "each bar links to its match");
  assert.ok(out.includes("Try:"), "the chips are there");
});

test("the section adds no h1 and hides nothing with display:none", () => {
  const out = html(card);
  assert.doesNotMatch(out, /<h1/);
  assert.doesNotMatch(out, /display:\s*none/);
  assert.doesNotMatch(out, /(?<![-\w])hidden(?![-\w])/);
});

test("a small card says so and still links to the page; with no card at all there is a prompt, not an empty box", () => {
  const small = html(smallCard({ league: "epl", slug: "bench-warmer", name: "Bench Warmer", team_name: null, team_color: null }), []);
  assert.match(small, /No game-by-game figures for Bench Warmer/);
  assert.ok(small.includes('href="/epl/players/bench-warmer"'));
  const none = html(null, []);
  assert.match(none, /Type a player/);
  assert.doesNotMatch(none, /try-card/);
});

test("a person with no player-form block (tennis, F1) gets no Follow button", () => {
  const f1 = smallCard({ league: "f1", slug: "max-verstappen", name: "Max Verstappen", team_name: null, team_color: null });
  assert.equal(f1.block, null);
  assert.doesNotMatch(html(f1, []), /Follow/);
});

test("two players of one name are told apart by club or competition", () => {
  const r = (name: string, league: string, slug: string, subtitle: string | null): SearchResult => ({ type: "player", name, league, slug, subtitle, image: null });
  assert.deepEqual(resultLabels([r("Rohit Sharma", "odi", "rohit-sharma", "India"), r("Rohit Sharma", "odi", "rohit-sharma-2", "Indonesia"), r("Virat Kohli", "odi", "virat-kohli", "India")]), ["Rohit Sharma (India)", "Rohit Sharma (Indonesia)", "Virat Kohli"]);
});

test("the first-visit wrapper is hidden under both saved states, like the builder hero", () => {
  const css = readFileSync(join(__dirname, "../src/app/globals.css"), "utf8");
  assert.match(css, /:root\[data-home="built"\] \.home-firstvisit,\s*:root\[data-home="collapsed"\] \.home-firstvisit\s*\{\s*display: none;/);
});
