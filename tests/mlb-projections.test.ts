// Projections are off for MLB on purpose. The outcome columns in simulator.ts are written per
// playoff format, and the trailing branch — the one an unlisted league falls into — is the NBA's
// "Top 6 / Play-in". Baseball has no play-in, so the page would be confidently wrong; it 404s
// instead, and nothing links to it.
import test from "node:test";
import assert from "node:assert/strict";
import { supportsProjections } from "../src/lib/simulator";
import { LeagueSubNav } from "../src/components/LeagueSubNav";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

test("MLB has no projections page", () => {
  assert.equal(supportsProjections("mlb"), false);
  // The two sports whose formats are modelled keep theirs.
  assert.equal(supportsProjections("nfl"), true);
  assert.equal(supportsProjections("nba"), true);
});

test("the MLB sub-nav offers no Projections tab, but does offer the ones MLB has", () => {
  const html = renderToStaticMarkup(createElement(LeagueSubNav, { league: "mlb" }));
  assert.ok(!html.includes("Projections"), "no Projections tab for MLB");
  assert.ok(html.includes("/mlb/standings"));
  assert.ok(html.includes("/mlb/leaders"));
  assert.ok(html.includes("/mlb/injuries"));
  // The week hub is honest for baseball (calendar months), so it is offered.
  assert.ok(html.includes("/mlb/week"));
});
