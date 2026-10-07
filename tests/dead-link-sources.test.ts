// Three sources of links that answered 404 to Googlebot (Search Console, 2026-10-07):
// list keys that glued a link's label onto its address, season-standings links on
// cricket game pages, and the projections link on leagues without projections.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { RelatedLinks } from "../src/components/RelatedLinks";
import { gameSeasonLinks } from "../src/lib/gameLinks";
import { ALL_LEAGUES, hasStandings } from "../src/lib/leagues";
import { supportsMatchweeks } from "../src/lib/matchweeks";

function findAll(node: ReactNode, type: unknown, out: ReactElement<Record<string, unknown>>[] = []): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) {
    for (const n of node) findAll(n, type, out);
    return out;
  }
  if (!isValidElement(node)) return out;
  const el = node as ReactElement<Record<string, unknown>>;
  if (el.type === type) out.push(el);
  findAll(el.props.children as ReactNode, type, out);
  return out;
}

test("related-link list keys are the address alone: Google read 'href + label' keys from the page payload as URLs", () => {
  const el = RelatedLinks({
    groups: [
      {
        title: "Teams",
        links: [
          { href: "/seriea/teams/sampdoria", label: "Sampdoria", sub: "Schedule" },
          { href: "/seriea/h2h/ac-milan-vs-sampdoria", label: "Sampdoria vs AC Milan" },
        ],
      },
    ],
  }) as ReactElement;
  const items = findAll(el, "li");
  assert.equal(items.length, 2);
  assert.deepEqual(
    items.map((li) => li.key),
    ["/seriea/teams/sampdoria", "/seriea/h2h/ac-milan-vs-sampdoria"],
  );
});

test("a game page links to the season's standings only where the league has a table, and to its weeks only where it has them", () => {
  for (const league of ALL_LEAGUES) {
    const links = gameSeasonLinks(league, 2026);
    const hrefs = links.map((l) => l.href);
    assert.equal(hrefs.includes(`/${league}/standings/2026`), hasStandings(league), `${league} standings link`);
    assert.equal(hrefs.some((h) => /\/(week|matchweek|matchday)\/2026$/.test(h)), supportsMatchweeks(league), `${league} week link`);
    assert.ok(hrefs.includes(`/${league}/leaders`), `${league} leaders link`);
  }
  assert.deepEqual(gameSeasonLinks("t20i", 2026).map((l) => l.href), ["/t20i/leaders"]);
  assert.deepEqual(gameSeasonLinks("nba", 2026).map((l) => l.href), ["/nba/standings/2026", "/nba/week/2026", "/nba/leaders"]);
});

test("guard: the power-rankings page shows its projections link only where the league has projections", () => {
  const src = readFileSync(new URL("../src/app/[league]/power-rankings/page.tsx", import.meta.url), "utf8");
  assert.match(src, /supportsProjections\(league\) && \(?\s*<Link href=\{`\/\$\{league\}\/projections`\}/);
});
