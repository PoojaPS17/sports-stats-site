import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";
import { NO_PREFETCH_PATH, prefetchFor } from "../src/lib/prefetch";

// Cloudflare Managed-Challenges game, team, player, h2h and compare pages for bots, so every `?_rsc`
// prefetch of such a link comes back 403 (a page can carry dozens). Links to those pages must not
// prefetch. This walks src and reads each <Link ...> opening tag, so a new link cannot quietly miss it.

const SRC = fileURLToPath(new URL("../src/", import.meta.url));

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

interface LinkTag { file: string; line: number; tag: string; href: string }

/** Every <Link ...> opening tag, scanned past nested braces and strings so `=>` or `>` inside a prop does not end it. */
function linkTags(): LinkTag[] {
  const tags: LinkTag[] = [];
  for (const path of walk(SRC)) {
    const s = readFileSync(path, "utf8");
    const re = /<Link\b/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s))) {
      let i = m.index + 5;
      let depth = 0;
      let quote: string | null = null;
      for (; i < s.length; i++) {
        const c = s[i];
        if (quote) { if (c === quote && s[i - 1] !== "\\") quote = null; continue; }
        if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
        if (c === "{") depth++;
        else if (c === "}") depth--;
        else if (c === ">" && depth === 0 && s[i - 1] !== "=") break;
      }
      const tag = s.slice(m.index, i + 1);
      const at = tag.indexOf("href=");
      let href = "";
      if (at >= 0) {
        const v = tag.slice(at + 5);
        if (v[0] === '"') href = v.slice(0, v.indexOf('"', 1) + 1);
        else if (v[0] === "{") {
          let d = 0;
          let q: string | null = null;
          let j = 0;
          for (; j < v.length; j++) {
            const c = v[j];
            if (q) { if (c === q && v[j - 1] !== "\\") q = null; continue; }
            if (c === '"' || c === "'" || c === "`") { q = c; continue; }
            if (c === "{") d++;
            else if (c === "}" && --d === 0) break;
          }
          href = v.slice(0, j + 1);
        }
      }
      tags.push({ file: relative(SRC, path), line: s.slice(0, m.index).split("\n").length, tag, href });
    }
  }
  return tags;
}

// The path families, plus the helpers that build them (their names stand in for the path in the source text).
const FAMILY = new RegExp(`${NO_PREFETCH_PATH.source}|h2hPath\\(|performancePagePath\\(`);
const LOCATION = (t: LinkTag) => `${t.file}:${t.line}`;
const OFF = /prefetch=\{false\}|prefetch=\{prefetchFor\(/;

// Links whose href is a variable or a call and which carry no prefetch prop: each only ever points at
// pages outside the families (league and series pages, week hubs, standings, tabs, articles, site pages).
const DYNAMIC_OK: Record<string, string> = {
  "app/[league]/page.tsx": "week hub",
  "app/cricket/series/[id]/page.tsx": "league hub link",
  "app/f1/standings/page.tsx": "standings group tabs",
  "app/top-games/page.tsx": "filter pills on the same page",
  "components/BeyondTheScorelineArticleLayout.tsx": "article links",
  "components/CricketMatchInfo.tsx": "series page",
  "components/CricketNextMatch.tsx": "series page",
  "components/Footer.tsx": "site pages",
  "components/MatchContextCard.tsx": "week hub",
  "components/MobileMenu.tsx": "nav items",
  "components/Nav.tsx": "nav items",
  "components/NavDropdown.tsx": "nav items",
  "components/ScoresBlocks.tsx": "standings",
  "components/SeasonTabs.tsx": "season tabs",
  "components/SiteLinks.tsx": "site pages",
  "components/StandingsViewTabs.tsx": "standings views",
  "components/SubNav.tsx": "league section tabs",
  "components/TennisCalendar.tsx": "tournament calendar",
  "components/WeekHub.tsx": "week hub",
  "components/home/blocks/BtsBlock.tsx": "article links",
  "components/home/blocks/F1DriversBlock.tsx": "F1 driver and event pages",
  "components/home/blocks/StandingsBlock.tsx": "the full-table link goes to standings (its team rows use prefetchFor)",
};

test("a Link to a game, team, player, h2h or compare page does not prefetch", () => {
  const bad = linkTags().filter((t) => FAMILY.test(t.href) && !/prefetch=\{false\}/.test(t.tag));
  assert.deepEqual(bad.map(LOCATION), [], "add prefetch={false} (see src/lib/prefetch.ts)");
});

test("a Link with a computed href either opts out via prefetchFor or is known to stay off those pages", () => {
  const bad = linkTags().filter((t) => {
    const computed = t.href.startsWith("{") && !t.href.startsWith("{`") && !t.href.startsWith('{"');
    return computed && !FAMILY.test(t.href) && !OFF.test(t.tag) && !/prefetch=/.test(t.tag) && !DYNAMIC_OK[t.file];
  });
  assert.deepEqual(bad.map((t) => `${LOCATION(t)} ${t.href}`), [], "use prefetch={prefetchFor(href)}, or list the file in DYNAMIC_OK if it can never point at those pages");
});

test("the scanner sees the links it should (guards against a silent parser failure)", () => {
  const tags = linkTags();
  assert.ok(tags.length > 150);
  assert.ok(tags.some((t) => /\/players\//.test(t.href) && /prefetch=\{false\}/.test(t.tag)));
});

test("prefetchFor switches prefetch off only for the five page families", () => {
  for (const p of ["/nba/games/401", "/nba/teams/lakers", "/nba/players/lebron-james", "/nba/h2h/a-vs-b", "/nba/compare?a=x", "/nba/compare/players", "/cricket/series/1/../../x/games/9"]) {
    assert.equal(prefetchFor(p), false, p);
  }
  for (const p of ["/nba/standings", "/nba/standings/2026", "/nba", "/cricket/matches/1554060", "/cricket/series/1554058", "/nba/teams", "/nba/leaders", "/nba/comparison", null, undefined]) {
    assert.equal(prefetchFor(p), undefined, String(p));
  }
});
