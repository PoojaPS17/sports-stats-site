import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Link from "next/link";
import { TeamLogo } from "../src/components/TeamLogo";
import { OpponentCell } from "../src/components/PlayerStatsShared";
import { RelatedLinks } from "../src/components/RelatedLinks";
import { PlayerIndexLink } from "../src/components/PlayerIndexLink";
import { PlayerIndexList } from "../src/components/PlayerIndexList";
import { packPlayers } from "../src/lib/playerIndex";
import { TeamHeader } from "../src/components/TeamHeader";
import { MatchHeader } from "../src/components/MatchHeader";
import type { GameRow } from "../src/lib/queries";
import type { PlayerLogRow } from "../src/lib/playerProfile";

// Every element of `type` reachable through `props.children`, without rendering function components.
function findAll(node: ReactNode, type: unknown, out: ReactElement<Record<string, unknown>>[] = []): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) {
    for (const n of node) findAll(n, type, out);
  } else if (isValidElement(node)) {
    const el = node as ReactElement<Record<string, unknown>>;
    if (el.type === type) out.push(el);
    findAll(el.props.children as ReactNode, type, out);
  }
  return out;
}

const logo = "https://a.espncdn.com/i/teamlogos/nba/500/lal.png";

test("TeamLogo is lazy and async-decoded by default, and priority turns both off", () => {
  const lazy = renderToStaticMarkup(createElement(TeamLogo, { name: "Los Angeles Lakers", logoUrl: logo, size: 22 }));
  assert.match(lazy, /loading="lazy"/);
  assert.match(lazy, /decoding="async"/);
  const eager = renderToStaticMarkup(createElement(TeamLogo, { name: "Los Angeles Lakers", logoUrl: logo, size: 48, priority: true }));
  assert.doesNotMatch(eager, /loading=/);
  assert.doesNotMatch(eager, /decoding=/);
});

test("TeamLogo keeps its alt text, source and size either way", () => {
  for (const priority of [false, true]) {
    const html = renderToStaticMarkup(createElement(TeamLogo, { name: "Los Angeles Lakers", logoUrl: logo, size: 22, priority }));
    assert.match(html, /alt="Los Angeles Lakers"/);
    assert.match(html, new RegExp(`src="${logo}"`));
    assert.match(html, /width="22"/);
    assert.match(html, /height="22"/);
  }
});

test("TeamLogo without an image is still the initials disc", () => {
  const html = renderToStaticMarkup(createElement(TeamLogo, { name: "Los Angeles Lakers", logoUrl: null }));
  assert.doesNotMatch(html, /<img/);
  assert.match(html, />AL</);
});

const logRow = {
  game_espn_id: "401585123",
  date: "2026-01-15T00:00:00.000Z",
  is_home: false,
  opponent_name: "Boston Celtics",
  opponent_logo: "https://a.espncdn.com/i/teamlogos/nba/500/bos.png",
} as PlayerLogRow;

test("a game-log opponent is a text link to the match: no crest, same href and name, no prefetch", () => {
  const el = OpponentCell({ league: "nba", row: logRow }) as ReactElement<Record<string, unknown>>;
  assert.equal(el.type, Link);
  assert.equal(el.props.href, "/nba/games/401585123");
  assert.equal(el.props.prefetch, false);
  const html = renderToStaticMarkup(el);
  assert.doesNotMatch(html, /<img/);
  assert.doesNotMatch(html, /teamlogos/);
  assert.match(html, /href="\/nba\/games\/401585123"/);
  assert.match(html, />at</);
  assert.match(html, />Boston Celtics</);
});

test("a game-log opponent with a date still shows the date", () => {
  const html = renderToStaticMarkup(OpponentCell({ league: "nba", row: { ...logRow, is_home: true }, withDate: true }));
  assert.match(html, />vs</);
  // exact now rather than Jan 14-or-15: an NBA date is the league's own Eastern day (lib/gameDay.ts), not the machine's zone
  assert.match(html, /Jan 14, 2026/);
});

test("related links are not prefetched, and keep every href, label and sub-label", () => {
  const groups = [
    {
      title: "Teams",
      links: [
        { href: "/nba/teams/boston-celtics", label: "Boston Celtics", sub: "Eastern", image: logo },
        { href: "/nba/teams/miami-heat", label: "Miami Heat" },
      ],
    },
  ];
  const el = RelatedLinks({ groups }) as ReactElement;
  const links = findAll(el, Link);
  assert.equal(links.length, 2);
  for (const l of links) assert.equal(l.props.prefetch, false);
  assert.deepEqual(
    links.map((l) => l.props.href),
    ["/nba/teams/boston-celtics", "/nba/teams/miami-heat"],
  );
  const html = renderToStaticMarkup(el);
  assert.match(html, /Boston Celtics/);
  assert.match(html, /Eastern/);
  assert.match(html, /Miami Heat/);
  // the small crest is below the fold: lazy
  assert.match(html, /loading="lazy"/);
});

const player = (o: Partial<{ name: string; slug: string; team_name: string | null }> = {}) => ({
  name: "Patrick Mahomes",
  slug: "patrick-mahomes",
  team_name: "Kansas City Chiefs" as string | null,
  ...o,
});

test("a players-index row is a text link with no avatar, not prefetched, with the player's name, team and href", () => {
  const el = PlayerIndexLink({ league: "nfl", name: "Patrick Mahomes", slug: "patrick-mahomes", team: "Kansas City Chiefs" }) as ReactElement<Record<string, unknown>>;
  assert.equal(el.type, Link);
  assert.equal(el.props.href, "/nfl/players/patrick-mahomes");
  assert.equal(el.props.prefetch, false);
  const html = renderToStaticMarkup(el);
  assert.doesNotMatch(html, /<img/);
  assert.doesNotMatch(html, /<svg/);
  assert.doesNotMatch(html, /rounded-full/); // no initials disc either
  assert.doesNotMatch(html, /class=/); // the look comes from .player-grid in globals.css, not per-row classes
  assert.equal(html, '<a href="/nfl/players/patrick-mahomes">Patrick Mahomes<span>Kansas City Chiefs</span></a>');
});

test("a players-index row for a player with no team shows the name and no empty team line", () => {
  const html = renderToStaticMarkup(PlayerIndexLink({ league: "ucl", name: "Free Agent", slug: "free-agent", team: null }));
  assert.equal(html, '<a href="/ucl/players/free-agent">Free Agent</a>');
});

test("packPlayers keeps every player in order and sends each team name once, in its display form", () => {
  const ps = [
    player({ name: "Aaron Rodgers", slug: "aaron-rodgers", team_name: "New York Jets" }),
    player({ name: "Free Agent", slug: "free-agent", team_name: null }),
    player({ name: "Garrett Wilson", slug: "garrett-wilson", team_name: "New York Jets" }),
    player({ name: "Saki Kumagai", slug: "saki-kumagai", team_name: "Japan Women" }),
  ];
  const packed = packPlayers(ps);
  assert.deepEqual(packed.teams, ["New York Jets", "Japan-W"]);
  assert.deepEqual(packed.rows, [
    ["Aaron Rodgers", "aaron-rodgers", 0],
    ["Free Agent", "free-agent", -1],
    ["Garrett Wilson", "garrett-wilson", 0],
    ["Saki Kumagai", "saki-kumagai", 1],
  ]);
  assert.equal(packed.rows.length, ps.length);
  assert.deepEqual(packPlayers([]), { teams: [], rows: [] });
});

test("the players list shows every player once, each with the right link and team", () => {
  const ps = [
    player({ name: "Aaron Rodgers", slug: "aaron-rodgers", team_name: "New York Jets" }),
    player({ name: "Free Agent", slug: "free-agent", team_name: null }),
    player({ name: "Garrett Wilson", slug: "garrett-wilson", team_name: "New York Jets" }),
    player({ name: "Saki Kumagai", slug: "saki-kumagai", team_name: "Japan Women" }),
  ];
  const html = renderToStaticMarkup(createElement(PlayerIndexList, { league: "nfl", ...packPlayers(ps) }));
  assert.match(html, /^<div class="player-grid grid /);
  assert.deepEqual(html.match(/<a [^>]*>.*?<\/a>/g), [
    '<a href="/nfl/players/aaron-rodgers">Aaron Rodgers<span>New York Jets</span></a>',
    '<a href="/nfl/players/free-agent">Free Agent</a>',
    '<a href="/nfl/players/garrett-wilson">Garrett Wilson<span>New York Jets</span></a>',
    '<a href="/nfl/players/saki-kumagai">Saki Kumagai<span>Japan-W</span></a>',
  ]);
  assert.doesNotMatch(html, /<img/);
});

// Googlebot reads the first 2 MB of a page's HTML, and the page carries a client component's props a
// second time in its data. The largest lists are nfl (6,386 players) and ucl (8,942); the HTML plus that
// data (estimated from the props' JSON, escaped for a script tag, with 10% to spare) must stay under
// 1.5 MB. Every row here has a 19-letter name, a 24-letter slug and a 20-letter team from 40 different
// teams: longer than a typical player, and every player has a team.
test("the biggest players indexes stay under 1.5 MB of HTML plus page data", () => {
  const teams = Array.from({ length: 40 }, (_, i) => `Paris Saint-Germain ${String(i).padStart(2, "0")}`.slice(0, 20));
  for (const [league, count] of [["nfl", 6386], ["ucl", 8942]] as const) {
    const ps = Array.from({ length: count }, (_, i) => player({ name: "Christian McCaffrey", slug: `christian-mccaffrey-${i}`.padEnd(24, "x"), team_name: teams[i % teams.length] }));
    const props = { league, ...packPlayers(ps) };
    const html = Buffer.byteLength(renderToStaticMarkup(createElement(PlayerIndexList, props)));
    const data = Math.ceil(Buffer.byteLength(JSON.stringify(props)) * 1.1);
    assert.ok(html + data < 1_500_000, `${league}: ${count} players = ${html} bytes of HTML + ${data} of page data`);
  }
});

test("a team page header loads its crest straight away; a crest further down the page waits", () => {
  const head = renderToStaticMarkup(createElement(TeamHeader, { league: "nba", slug: "boston-celtics", name: "Boston Celtics", logoUrl: logo, color: "007A33" }));
  assert.match(head, /<img[^>]*alt="Boston Celtics"/);
  assert.doesNotMatch(head, /loading=/);
});

test("a match page header loads both crests straight away", () => {
  const game = {
    espn_id: "401585123",
    date: "2026-01-15T00:00:00.000Z",
    home_name: "Boston Celtics",
    away_name: "Los Angeles Lakers",
    home_slug: "boston-celtics",
    away_slug: "los-angeles-lakers",
    home_logo: "https://a.espncdn.com/i/teamlogos/nba/500/bos.png",
    away_logo: logo,
    home_color: null,
    away_color: null,
    home_score: 101,
    away_score: 99,
    home_score_display: null,
    away_score_display: null,
    home_winner: true,
    away_winner: false,
    completed: true,
    status_state: "post",
    status_detail: "Final",
    status_summary: null,
    round: null,
  } as unknown as GameRow;
  const head = renderToStaticMarkup(createElement(MatchHeader, { league: "nba", game }));
  assert.equal([...head.matchAll(/<img[^>]*>/g)].length, 2, "both crests are images");
  assert.doesNotMatch(head, /loading="lazy"/);
  assert.doesNotMatch(head, /decoding="async"/);
});

// Source-text guard, not a behaviour test: it only checks that the page hands the whole list to packPlayers
// and does no per-row trimming or crests of its own. tests/lighter-html.test.ts above covers what it renders.
test("guard: the players index page renders every player it is given", () => {
  const src = readFileSync(new URL("../src/app/[league]/players/page.tsx", import.meta.url), "utf8");
  assert.match(src, /packPlayers\(players\)/);
  assert.doesNotMatch(src, /\.slice\(|\.filter\(|\.length\s*>\s*\d{2,}/);
  assert.doesNotMatch(src, /TeamLogo/);
});

// Source-text guard, not a behaviour test: a static import of html-to-image would put the library back into
// every page's bundle, which nothing else here would notice.
test("guard: html-to-image is loaded on demand inside the click handler, not at the top of ImageActions", () => {
  const src = readFileSync(new URL("../src/components/ImageActions.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(src, /^import[^\n]*html-to-image/m);
  assert.match(src, /await import\("html-to-image"\)/);
});
