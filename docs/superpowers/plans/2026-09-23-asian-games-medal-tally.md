# Asian Games Medal Tally + Live Cricket Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the site a `/asian-games` section with a medal tally covering every edition (1951–2026, historic editions static, the current edition refreshed hourly) sourced from Wikipedia, plus a hub page surfacing the Asian Games cricket matches the site already carries live. No other sport gets match-level coverage — there is no honest data source for it (see the spec).

**Architecture:** A standalone top-level route tree `src/app/asian-games/` (mirrors `src/app/f1/`, not a `[league]` entry). A new `medal_tally` table, keyed `(edition_year, nation_slug)` like `f1_standings(season_year, ...)`. A scraper pulls Wikipedia's rendered medal-table HTML via the MediaWiki REST API and parses it with Cheerio, walking `rowspan`/`colspan` generically so tied ranks and varying table markups across 20 editions all parse correctly. Edition metadata (host city, dates) is a curated pure-constants file, not scraped data. Cricket needs no new pipeline: Asian Games fixtures already flow through the existing cricket scraper (`MULTI_SPORT_GAMES` in `src/lib/homeData.ts`); this plan adds one predicate (`isAsianGamesCricket`) to filter them for the new hub page.

**Tech Stack:** Next.js 16 App Router (Server Components, `searchParams` for the edition switcher, `next/navigation` client component for the switcher control), `pg` for Postgres, a new `cheerio` dependency for HTML table parsing, `tsx` for scripts, systemd timers on the VM for scheduling.

**Spec:** [docs/superpowers/specs/2026-09-23-asian-games-medal-tally-design.md](../specs/2026-09-23-asian-games-medal-tally-design.md)

## Global Constraints

- Wikipedia requests always send the identifying User-Agent `"SportsDB/1.0 (https://github.com/PoojaPS17/sports-stats-site)"` — the same string `scripts/fetch-trending-wikipedia.ts` already uses. No request to Wikipedia is ever sent without it.
- No bot-detection bypass, ever: only the documented MediaWiki REST API, never `back.results.asiangames2026.org` or any other access-restricted backend.
- The medal tally page carries a Wikipedia CC BY-SA 4.0 attribution footer (required by the license).
- No new cricket scraping. Asian Games cricket matches come from the existing `getUpcomingCricketMatches` / `getLiveCricketMatches` pipeline, filtered.
- No separate "editions" database table. `src/lib/asianGamesEditions.ts` (pure constants) is the single source of truth for edition metadata; only `medal_tally` (scraped counts) is a table.
- Both new pages: `export const revalidate = 300;` (same as `f1/standings/page.tsx`).
- Every new scraper script follows the existing catch-and-continue-per-item convention (`scripts/fetch-standings.ts`) so one bad edition never blocks the others, and every DB write is an idempotent upsert (`ON CONFLICT ... DO UPDATE`).
- `rank` stored in `medal_tally` is always computed by the site's own tie-aware `medalRanks()` (from `sortMedalTally()`'s order), never trusted from Wikipedia's own rank-column markup — this is a deliberate simplification over the spec's original wording (see Task 4), ruled because it removes a whole class of parsing fragility across 20 differently-formatted historic tables and there is no `total` column stored either (rendered as `gold + silver + bronze`).

---

### Task 1: `medal_tally` table

**Files:**
- Modify: `db/schema.sql` (append at end of file)

**Interfaces:**
- Produces: table `medal_tally(edition_year, nation_slug, nation_name, gold, silver, bronze, rank, source_url, updated_at)`, primary key `(edition_year, nation_slug)`. Every later task reads/writes this exact shape.

- [ ] **Step 1: Append the table to `db/schema.sql`**

Add this block at the very end of the file (after the existing `scrape_runs` table):

```sql

-- Medal tally per Asian Games edition, scraped from Wikipedia (see
-- scripts/lib/asianGamesMedals.ts). `rank` is the site's own tie-aware
-- computation (src/lib/medalTallyOrder.ts), not read from Wikipedia's markup.
-- Edition metadata (host city, dates) lives in src/lib/asianGamesEditions.ts,
-- not here — a new edition is a rare, curated code change, not scraped data.
create table if not exists medal_tally (
  edition_year integer not null,
  nation_slug text not null,
  nation_name text not null,
  gold integer not null default 0,
  silver integer not null default 0,
  bronze integer not null default 0,
  rank integer,
  source_url text,
  updated_at timestamptz not null default now(),
  primary key (edition_year, nation_slug)
);
```

- [ ] **Step 2: Apply the migration**

Run: `npm run migrate`
Expected: `[migrate] schema applied`, no errors. (This runs the whole `schema.sql` file, which is idempotent — safe even though most of the file's `create table if not exists` statements already exist.)

- [ ] **Step 3: Commit**

```bash
git add db/schema.sql
git commit -m "db: add medal_tally table for Asian Games medal tallies"
```

---

### Task 2: `src/lib/asianGamesEditions.ts` — edition constants

**Files:**
- Create: `src/lib/asianGamesEditions.ts`

**Interfaces:**
- Produces: `AsianGamesEdition` interface, `ASIAN_GAMES_EDITIONS: AsianGamesEdition[]`, `CURRENT_EDITION_YEAR: number`, `currentEdition(): AsianGamesEdition`, `isGamesOpen(edition, now?): boolean`, `wikipediaMedalTableTitle(year): string`. Task 4 (scraper) uses `wikipediaMedalTableTitle` and iterates `ASIAN_GAMES_EDITIONS`; Task 7/8 (pages) use `currentEdition()` and `isGamesOpen()`.
- Consumes: nothing (pure constants file, no imports from the DB — it is imported from Client Components later, same rule as `src/lib/nav.ts`).

- [ ] **Step 1: Write the file**

```ts
// Every (Summer) Asian Games edition, 1951-2026. A new edition is added here once, a
// deliberate few-line change roughly every 4 years when a new Games is confirmed and
// its host is announced — not scraped, because that's curated information (host
// city, official dates) with no single reliable scrapeable source, unlike the medal
// counts (scripts/lib/asianGamesMedals.ts).
//
// `year` is the Games' OFFICIAL edition year, matching the Wikipedia article title
// ("{year} Asian Games"), which is not always the calendar year it was actually held
// in: the 2022 Asian Games were postponed by the pandemic and held in September-
// October 2023, but kept the "2022" name (and Wikipedia title) throughout.
export interface AsianGamesEdition {
  year: number;
  edition: number;
  hostCity: string;
  hostCountry: string;
  /** ISO date (YYYY-MM-DD) the Games opened. */
  startDate: string;
  /** ISO date (YYYY-MM-DD) the Games closed. */
  endDate: string;
}

export const ASIAN_GAMES_EDITIONS: AsianGamesEdition[] = [
  { year: 1951, edition: 1, hostCity: "New Delhi", hostCountry: "India", startDate: "1951-03-04", endDate: "1951-03-11" },
  { year: 1954, edition: 2, hostCity: "Manila", hostCountry: "Philippines", startDate: "1954-05-01", endDate: "1954-05-09" },
  { year: 1958, edition: 3, hostCity: "Tokyo", hostCountry: "Japan", startDate: "1958-05-24", endDate: "1958-06-01" },
  { year: 1962, edition: 4, hostCity: "Jakarta", hostCountry: "Indonesia", startDate: "1962-08-24", endDate: "1962-09-04" },
  { year: 1966, edition: 5, hostCity: "Bangkok", hostCountry: "Thailand", startDate: "1966-12-09", endDate: "1966-12-20" },
  { year: 1970, edition: 6, hostCity: "Bangkok", hostCountry: "Thailand", startDate: "1970-12-09", endDate: "1970-12-20" },
  { year: 1974, edition: 7, hostCity: "Tehran", hostCountry: "Iran", startDate: "1974-09-01", endDate: "1974-09-16" },
  { year: 1978, edition: 8, hostCity: "Bangkok", hostCountry: "Thailand", startDate: "1978-12-09", endDate: "1978-12-20" },
  { year: 1982, edition: 9, hostCity: "New Delhi", hostCountry: "India", startDate: "1982-11-19", endDate: "1982-12-04" },
  { year: 1986, edition: 10, hostCity: "Seoul", hostCountry: "South Korea", startDate: "1986-09-20", endDate: "1986-10-02" },
  { year: 1990, edition: 11, hostCity: "Beijing", hostCountry: "China", startDate: "1990-09-22", endDate: "1990-10-07" },
  { year: 1994, edition: 12, hostCity: "Hiroshima", hostCountry: "Japan", startDate: "1994-10-02", endDate: "1994-10-16" },
  { year: 1998, edition: 13, hostCity: "Bangkok", hostCountry: "Thailand", startDate: "1998-12-06", endDate: "1998-12-20" },
  { year: 2002, edition: 14, hostCity: "Busan", hostCountry: "South Korea", startDate: "2002-09-29", endDate: "2002-10-14" },
  { year: 2006, edition: 15, hostCity: "Doha", hostCountry: "Qatar", startDate: "2006-12-01", endDate: "2006-12-15" },
  { year: 2010, edition: 16, hostCity: "Guangzhou", hostCountry: "China", startDate: "2010-11-12", endDate: "2010-11-27" },
  { year: 2014, edition: 17, hostCity: "Incheon", hostCountry: "South Korea", startDate: "2014-09-19", endDate: "2014-10-04" },
  { year: 2018, edition: 18, hostCity: "Jakarta & Palembang", hostCountry: "Indonesia", startDate: "2018-08-18", endDate: "2018-09-02" },
  // Postponed a year by the pandemic; kept the "2022" name and Wikipedia title throughout.
  { year: 2022, edition: 19, hostCity: "Hangzhou", hostCountry: "China", startDate: "2023-09-23", endDate: "2023-10-08" },
  { year: 2026, edition: 20, hostCity: "Aichi-Nagoya", hostCountry: "Japan", startDate: "2026-09-19", endDate: "2026-10-04" },
];

/**
 * The edition the recurring scraper polls and the medal tally page defaults to.
 * Update this (and add a new row above) when a new Games opens, roughly every 4 years.
 */
export const CURRENT_EDITION_YEAR = 2026;

export function currentEdition(): AsianGamesEdition {
  const found = ASIAN_GAMES_EDITIONS.find((e) => e.year === CURRENT_EDITION_YEAR);
  if (!found) throw new Error(`CURRENT_EDITION_YEAR (${CURRENT_EDITION_YEAR}) is not in ASIAN_GAMES_EDITIONS`);
  return found;
}

/** True while `edition` is in progress (its date window includes today), for the hub page's "Live" badge. */
export function isGamesOpen(edition: AsianGamesEdition, now: Date = new Date()): boolean {
  const day = now.toISOString().slice(0, 10);
  return day >= edition.startDate && day <= edition.endDate;
}

/**
 * Wikipedia's article title for this edition's medal table. Every edition from 1954
 * onward has a standalone page at this title; 1951 does not (see
 * scripts/lib/asianGamesMedals.ts for its fallback to the main "1951 Asian Games" article).
 */
export function wikipediaMedalTableTitle(year: number): string {
  return `${year} Asian Games medal table`;
}
```

- [ ] **Step 2: Write a smoke-test check**

There is no database or network call in this file, so add one small test alongside Task 3's test file rather than a whole new test file: skip a dedicated test here and cover it via Task 3's Step 1, which imports `ASIAN_GAMES_EDITIONS` for its fixtures. (Task 3 depends on this task's file existing.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/asianGamesEditions.ts
git commit -m "feat: Asian Games edition constants (1951-2026)"
```

---

### Task 3: `src/lib/medalTallyOrder.ts` — pure ordering

**Files:**
- Create: `src/lib/medalTallyOrder.ts`
- Test: `tests/medal-tally-order.test.ts`

**Interfaces:**
- Consumes: nothing (pure, no DB import — mirrors `src/lib/standingsOrder.ts`).
- Produces: `OrderableMedal` interface, `sortMedalTally<T>(rows: T[]): T[]`, `medalRanks<T>(sorted: T[]): number[]`. Task 4's `upsertMedalTally` and Task 8's medal tally page both call these.

- [ ] **Step 1: Write the failing test**

```ts
// tests/medal-tally-order.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { sortMedalTally, medalRanks, type OrderableMedal } from "../src/lib/medalTallyOrder";

const row = (over: Partial<OrderableMedal> = {}): OrderableMedal => ({
  nation_slug: "x", nation_name: "X", gold: 0, silver: 0, bronze: 0, ...over,
});

test("sorts by gold, then silver, then bronze, then name", () => {
  const rows = [
    row({ nation_name: "B", nation_slug: "b", gold: 1, silver: 0, bronze: 0 }),
    row({ nation_name: "A", nation_slug: "a", gold: 2, silver: 0, bronze: 0 }),
    row({ nation_name: "D", nation_slug: "d", gold: 1, silver: 2, bronze: 0 }),
    row({ nation_name: "C", nation_slug: "c", gold: 1, silver: 2, bronze: 1 }),
  ];
  const sorted = sortMedalTally(rows);
  assert.deepEqual(sorted.map((r) => r.nation_slug), ["a", "c", "d", "b"]);
});

test("ties on every count break by nation name", () => {
  const rows = [
    row({ nation_name: "Zed", nation_slug: "zed", gold: 1, silver: 1, bronze: 1 }),
    row({ nation_name: "Alpha", nation_slug: "alpha", gold: 1, silver: 1, bronze: 1 }),
  ];
  const sorted = sortMedalTally(rows);
  assert.deepEqual(sorted.map((r) => r.nation_slug), ["alpha", "zed"]);
});

test("medalRanks: distinct rows count up 1,2,3", () => {
  const sorted = sortMedalTally([
    row({ nation_slug: "a", gold: 3 }),
    row({ nation_slug: "b", gold: 2 }),
    row({ nation_slug: "c", gold: 1 }),
  ]);
  assert.deepEqual(medalRanks(sorted), [1, 2, 3]);
});

test("medalRanks: a full tie shares one rank, the next distinct row continues from the count above it (IOC convention: 1, 1, 3)", () => {
  const sorted = sortMedalTally([
    row({ nation_slug: "a", nation_name: "A", gold: 2, silver: 1, bronze: 0 }),
    row({ nation_slug: "b", nation_name: "B", gold: 2, silver: 1, bronze: 0 }),
    row({ nation_slug: "c", nation_name: "C", gold: 1, silver: 0, bronze: 0 }),
  ]);
  assert.deepEqual(medalRanks(sorted), [1, 1, 3]);
});

test("medalRanks: three-way tie at the top, next row is rank 4", () => {
  const sorted = sortMedalTally([
    row({ nation_slug: "a", nation_name: "A", gold: 1, silver: 0, bronze: 0 }),
    row({ nation_slug: "b", nation_name: "B", gold: 1, silver: 0, bronze: 0 }),
    row({ nation_slug: "c", nation_name: "C", gold: 1, silver: 0, bronze: 0 }),
    row({ nation_slug: "d", nation_name: "D", gold: 0, silver: 5, bronze: 0 }),
  ]);
  assert.deepEqual(medalRanks(sorted), [1, 1, 1, 4]);
});

test("does not mutate the input array", () => {
  const rows = [row({ nation_slug: "b", gold: 1 }), row({ nation_slug: "a", gold: 2 })];
  const original = [...rows];
  sortMedalTally(rows);
  assert.deepEqual(rows, original);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx tsx --test tests/medal-tally-order.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/medalTallyOrder'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/medalTallyOrder.ts
// How a medal tally is ordered. Pure (no database), mirrors standingsOrder.ts: order
// logic lives on its own so it can be tested on its own and shared by the medal
// tally page and the scraper (scripts/lib/asianGamesMedals.ts), which stores the
// rank this file computes rather than whatever Wikipedia's own markup shows —
// that removes a class of parsing fragility across 20 differently-formatted
// historic tables, and it means the site's rank can never disagree with its own
// sort order.
export interface OrderableMedal {
  nation_slug: string;
  nation_name: string;
  gold: number;
  silver: number;
  bronze: number;
}

/** IOC convention: gold, then silver, then bronze, then name breaks a full tie. Returns new rows; the input is left alone. */
export function sortMedalTally<T extends OrderableMedal>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) => b.gold - a.gold || b.silver - a.silver || b.bronze - a.bronze || a.nation_name.localeCompare(b.nation_name)
  );
}

/**
 * 1-based rank per row of an already-sorted (sortMedalTally) list, ties sharing a
 * position (1, 1, 3) rather than each getting a distinct number.
 */
export function medalRanks<T extends OrderableMedal>(sorted: T[]): number[] {
  const ranks: number[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i === 0) {
      ranks.push(1);
      continue;
    }
    const prev = sorted[i - 1];
    const cur = sorted[i];
    const tied = cur.gold === prev.gold && cur.silver === prev.silver && cur.bronze === prev.bronze;
    ranks.push(tied ? ranks[i - 1] : i + 1);
  }
  return ranks;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx --test tests/medal-tally-order.test.ts`
Expected: PASS, all 6 tests.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/medalTallyOrder.ts tests/medal-tally-order.test.ts
git commit -m "feat: pure medal-tally ordering (sortMedalTally, medalRanks)"
```

---

### Task 4: Wikipedia fetch + parse + upsert

**Files:**
- Modify: `package.json` (add `cheerio` dependency)
- Create: `scripts/lib/asianGamesMedals.ts`
- Test: `tests/asian-games-medals-parser.test.ts`

**Interfaces:**
- Consumes: `slugify` from `scripts/lib/espn.ts`, `sortMedalTally`/`medalRanks` from `src/lib/medalTallyOrder.ts` (Task 3), `pool` from `scripts/lib/db.ts`, `wikipediaMedalTableTitle` from `src/lib/asianGamesEditions.ts` (Task 2).
- Produces: `MedalTallyRow` interface, `parseMedalTableHtml(html: string): MedalTallyRow[]` (pure), `fetchMedalTable(editionYear: number): Promise<{ rows: MedalTallyRow[]; sourceUrl: string; sourceTitle: string }>`, `upsertMedalTally(editionYear: number, rows: MedalTallyRow[], sourceUrl: string): Promise<number>`. Task 5's two scripts call `fetchMedalTable` + `upsertMedalTally`.

- [ ] **Step 1: Add the `cheerio` dependency**

Run: `npm install cheerio`
Expected: `package.json` and `package-lock.json` both change; `cheerio` appears under `dependencies`.

- [ ] **Step 2: Write the failing parser test**

Create `tests/fixtures/` if it does not already exist, and save this fixture (a trimmed but structurally real Wikipedia medal-table HTML fragment, including a rowspan-tied pair and a `sortbottom` totals row) to `tests/fixtures/asian-games-medal-table.html`:

```html
<table class="wikitable sortable" style="text-align:center">
<tbody><tr>
<th>Rank</th>
<th>Nation</th>
<th>Gold</th>
<th>Silver</th>
<th>Bronze</th>
<th>Total</th>
</tr>
<tr>
<td>1</td>
<td style="text-align:left"><span class="flagicon"><img alt="" src="//upload.wikimedia.org/x.png"></span> <a href="/wiki/China" title="China">China</a></td>
<td>103</td>
<td>105</td>
<td>142</td>
<td>350</td>
</tr>
<tr>
<td rowspan="2">2</td>
<td style="text-align:left"><a href="/wiki/Japan" title="Japan">Japan</a></td>
<td>52</td>
<td>67</td>
<td>65</td>
<td>184</td>
</tr>
<tr>
<td style="text-align:left"><a href="/wiki/South_Korea" title="South Korea">South Korea</a></td>
<td>52</td>
<td>50</td>
<td>60</td>
<td>162</td>
</tr>
<tr>
<td>4</td>
<td style="text-align:left"><a href="/wiki/India" title="India">India*</a><sup id="cite_ref-1" class="reference"><a href="#cite_note-1">[a]</a></sup></td>
<td>28</td>
<td>38</td>
<td>41</td>
<td>107</td>
</tr>
<tr class="sortbottom">
<th>Total</th>
<td></td>
<td>235</td>
<td>260</td>
<td>308</td>
<td>803</td>
</tr>
</tbody></table>
```

Now the failing test:

```ts
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
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx tsx --test tests/asian-games-medals-parser.test.ts`
Expected: FAIL — `Cannot find module '../scripts/lib/asianGamesMedals'`.

- [ ] **Step 4: Write the implementation**

```ts
// scripts/lib/asianGamesMedals.ts
// Fetch and parse an Asian Games edition's medal table from Wikipedia, and upsert
// it into medal_tally. See docs/superpowers/specs/2026-09-23-asian-games-medal-tally-design.md
// for why Wikipedia (not the Games' own bot-protected results backend) and why the
// MediaWiki REST API's rendered HTML (not raw wikitext, which is template markup we
// would have to re-expand ourselves).
import * as cheerio from "cheerio";
import type { Element } from "cheerio";
import { pool } from "./db";
import { slugify } from "./espn";
import { sortMedalTally, medalRanks } from "../../src/lib/medalTallyOrder";
import { wikipediaMedalTableTitle } from "../../src/lib/asianGamesEditions";

const USER_AGENT = "SportsDB/1.0 (https://github.com/PoojaPS17/sports-stats-site)";

export interface MedalTallyRow {
  nation_slug: string;
  nation_name: string;
  gold: number;
  silver: number;
  bronze: number;
}

interface RawCell {
  text: string;
  rowspan: number;
  colspan: number;
}

function readCells($: cheerio.CheerioAPI, tr: Element): RawCell[] {
  return $(tr)
    .children("td, th")
    .map((_, td) => {
      const $td = $(td);
      return {
        text: $td.text().replace(/\s+/g, " ").trim(),
        rowspan: Number($td.attr("rowspan")) || 1,
        colspan: Number($td.attr("colspan")) || 1,
      };
    })
    .get();
}

/**
 * Realigns each row's cells to a fixed column count, filling in cells that a
 * previous row's rowspan covers so a column never silently shifts. Generic HTML
 * table walk: works whichever column(s) carry the rowspan (usually just Rank, but
 * this does not assume that), which varies across 20 editions' worth of markup
 * written by different Wikipedia editors over 70+ years.
 */
function walkRows(rows: RawCell[][], columnCount: number): string[][] {
  const pending: { text: string; rowsLeft: number }[] = Array.from({ length: columnCount }, () => ({ text: "", rowsLeft: 0 }));
  return rows.map((raw) => {
    const line: string[] = new Array(columnCount).fill("");
    let rawIdx = 0;
    for (let col = 0; col < columnCount; col++) {
      if (pending[col].rowsLeft > 0) {
        line[col] = pending[col].text;
        pending[col].rowsLeft--;
        continue;
      }
      const cell = raw[rawIdx++];
      if (!cell) continue;
      for (let c = 0; c < cell.colspan && col + c < columnCount; c++) {
        line[col + c] = cell.text;
        if (cell.rowspan > 1) pending[col + c] = { text: cell.text, rowsLeft: cell.rowspan - 1 };
      }
      col += cell.colspan - 1;
    }
    return line;
  });
}

function cleanNationName(raw: string): string {
  return raw
    .replace(/\[.*?\]/g, "") // footnote markers, e.g. "China[a]"
    .replace(/[*†‡]+\s*$/, "") // host-nation asterisk / footnote symbols
    .replace(/\s+/g, " ")
    .trim();
}

function parseCount(raw: string): number {
  const n = parseInt(raw.replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Parses every real nation row out of the first `table.wikitable` whose header
 * row has Nation/Gold/Silver/Bronze columns — found by header content, not table
 * index or section heading, so it doesn't matter whether the page has other
 * tables above it or which section the medal table sits in. Returns [] when no
 * such table is found.
 */
export function parseMedalTableHtml(html: string): MedalTallyRow[] {
  const $ = cheerio.load(html);
  const tables = $("table.wikitable").toArray();

  for (const table of tables) {
    const headerRow = $(table).find("tr").first();
    const headers = headerRow
      .children("th, td")
      .map((_, th) => $(th).text().trim().toLowerCase())
      .get();
    const nationCol = headers.findIndex((h) => /nation|noc|country|team/.test(h));
    const goldCol = headers.findIndex((h) => /gold/.test(h));
    const silverCol = headers.findIndex((h) => /silver/.test(h));
    const bronzeCol = headers.findIndex((h) => /bronze/.test(h));
    if (nationCol === -1 || goldCol === -1 || silverCol === -1 || bronzeCol === -1) continue;

    const bodyRows = $(table)
      .find("tr")
      .toArray()
      .slice(1) // drop the header row
      .filter((tr) => !$(tr).hasClass("sortbottom"))
      .map((tr) => readCells($, tr));
    const aligned = walkRows(bodyRows, headers.length);

    const out: MedalTallyRow[] = [];
    for (const line of aligned) {
      const nationName = cleanNationName(line[nationCol] ?? "");
      if (!nationName || /^totals?$/i.test(nationName)) continue;
      out.push({
        nation_slug: slugify(nationName),
        nation_name: nationName,
        gold: parseCount(line[goldCol] ?? ""),
        silver: parseCount(line[silverCol] ?? ""),
        bronze: parseCount(line[bronzeCol] ?? ""),
      });
    }
    if (out.length > 0) return out;
  }
  return [];
}

async function fetchWikipediaHtml(title: string): Promise<string | null> {
  const url = `https://en.wikipedia.org/w/rest.php/v1/page/${encodeURIComponent(title.replace(/ /g, "_"))}/html`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Wikipedia request failed (${res.status}): ${url}`);
  return res.text();
}

/**
 * Fetches and parses one edition's medal table. Tries the standalone
 * "{year} Asian Games medal table" article first (every edition from 1954
 * onward), then falls back to the main "{year} Asian Games" article (needed
 * only for 1951, which has no standalone medal-table page) — the same
 * header-content table search works on either page, so no section-heading
 * logic is needed for the fallback.
 */
export async function fetchMedalTable(editionYear: number): Promise<{ rows: MedalTallyRow[]; sourceUrl: string; sourceTitle: string }> {
  const standaloneTitle = wikipediaMedalTableTitle(editionYear);
  let html = await fetchWikipediaHtml(standaloneTitle);
  let title = standaloneTitle;
  if (html === null) {
    title = `${editionYear} Asian Games`;
    html = await fetchWikipediaHtml(title);
  }
  if (html === null) throw new Error(`No Wikipedia page found for ${editionYear} Asian Games (tried "${standaloneTitle}" and "${title}")`);
  const rows = parseMedalTableHtml(html);
  if (rows.length === 0) throw new Error(`Parsed zero medal rows from "${title}" - table structure may have changed`);
  return { rows, sourceUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`, sourceTitle: title };
}

/**
 * Upserts one edition's medal tally, computing `rank` with the site's own
 * tie-aware order (medalTallyOrder.ts) rather than trusting Wikipedia's rank
 * column. Also deletes any stored row for this edition that the fresh fetch no
 * longer has (a rare source correction), so re-scrapes never accumulate stale
 * nations.
 */
export async function upsertMedalTally(editionYear: number, rows: MedalTallyRow[], sourceUrl: string): Promise<number> {
  const sorted = sortMedalTally(rows);
  const ranks = medalRanks(sorted);
  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i];
    await pool.query(
      `insert into medal_tally (edition_year, nation_slug, nation_name, gold, silver, bronze, rank, source_url, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, now())
       on conflict (edition_year, nation_slug) do update set
         nation_name = excluded.nation_name, gold = excluded.gold, silver = excluded.silver,
         bronze = excluded.bronze, rank = excluded.rank, source_url = excluded.source_url, updated_at = now()`,
      [editionYear, r.nation_slug, r.nation_name, r.gold, r.silver, r.bronze, ranks[i], sourceUrl]
    );
  }
  const keep = sorted.map((r) => r.nation_slug);
  await pool.query(`delete from medal_tally where edition_year = $1 and nation_slug <> all($2::text[])`, [editionYear, keep.length > 0 ? keep : [""]]);
  return sorted.length;
}
```

Note: `Element` is cheerio's own exported DOM element type (re-exported from `domhandler`, cheerio's own dependency — no separate install needed). If a particular installed `cheerio` version doesn't export `Element` from its root and `tsc` fails on that import, the fallback is `tr: any` in `readCells`'s signature with a one-line comment (`// cheerio's element type isn't worth chasing across versions here`) — a purely local, cosmetic type-safety loss that changes nothing else in this file.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx tsx --test tests/asian-games-medals-parser.test.ts`
Expected: PASS, all 6 tests.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (adjust the `readCells` cell type per the Step 4 note if `domhandler`'s `AnyNode` does not resolve).

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json scripts/lib/asianGamesMedals.ts tests/asian-games-medals-parser.test.ts tests/fixtures/asian-games-medal-table.html
git commit -m "feat: Wikipedia medal-table fetch, rowspan-aware parser, upsert"
```

---

### Task 5: Scraper scripts + scheduling

**Files:**
- Create: `scripts/fetch-asian-games-medals.ts`
- Create: `scripts/backfill-asian-games-medals.ts`
- Modify: `package.json` (two new npm scripts)
- Modify: `scripts/lib/heartbeat.ts` (register a staleness window)
- Modify: `deploy/vm/scrape.sh` (wire the recurring fetch into `job_hourly`)

**Interfaces:**
- Consumes: `fetchMedalTable`, `upsertMedalTally` from `scripts/lib/asianGamesMedals.ts` (Task 4); `ASIAN_GAMES_EDITIONS`, `CURRENT_EDITION_YEAR` from `src/lib/asianGamesEditions.ts` (Task 2); `pool` from `scripts/lib/db.ts`; `recordRun` from `scripts/lib/heartbeat.ts`.
- Produces: two runnable npm scripts, `fetch:asian-games-medals` and `backfill:asian-games-medals`.

- [ ] **Step 1: Write `scripts/fetch-asian-games-medals.ts`**

```ts
// Recurring fetch of the current edition's medal tally. See
// backfill-asian-games-medals.ts for every past edition — this only ever covers
// the current edition (src/lib/asianGamesEditions.ts), run on a schedule the same
// way fetch-f1-standings.ts is.
import { pool } from "./lib/db";
import { fetchMedalTable, upsertMedalTally } from "./lib/asianGamesMedals";
import { recordRun } from "./lib/heartbeat";
import { CURRENT_EDITION_YEAR } from "../src/lib/asianGamesEditions";

async function main() {
  try {
    const { rows, sourceUrl } = await fetchMedalTable(CURRENT_EDITION_YEAR);
    const count = await upsertMedalTally(CURRENT_EDITION_YEAR, rows, sourceUrl);
    console.log(`[fetch-asian-games-medals] ${CURRENT_EDITION_YEAR}: upserted ${count} rows`);
    await recordRun(pool, "fetch-asian-games-medals");
    await pool.end();
  } catch (err) {
    console.error("[fetch-asian-games-medals] failed:", err instanceof Error ? err.message : err);
    await pool.end();
    process.exit(1);
  }
}

main();
```

- [ ] **Step 2: Write `scripts/backfill-asian-games-medals.ts`**

```ts
// One-time historical backfill of every past edition's medal tally (1951-2026).
// Run manually once (npm run backfill:asian-games-medals); not scheduled, because
// a closed edition's medal table never changes. Catch-and-continue per edition, like
// fetch-standings.ts's per-league loop: one edition's Wikipedia page having moved or
// changed structure should never block the other 19.
import { pool } from "./lib/db";
import { fetchMedalTable, upsertMedalTally } from "./lib/asianGamesMedals";
import { ASIAN_GAMES_EDITIONS } from "../src/lib/asianGamesEditions";

async function main() {
  for (const edition of ASIAN_GAMES_EDITIONS) {
    try {
      const { rows, sourceUrl } = await fetchMedalTable(edition.year);
      const count = await upsertMedalTally(edition.year, rows, sourceUrl);
      console.log(`[backfill-asian-games-medals] ${edition.year}: upserted ${count} rows`);
    } catch (err) {
      console.error(`[backfill-asian-games-medals] ${edition.year} failed:`, err instanceof Error ? err.message : err);
    }
  }
  await pool.end();
}

main().catch((err) => {
  console.error("[backfill-asian-games-medals] failed:", err);
  process.exit(1);
});
```

- [ ] **Step 3: Register both npm scripts**

In `package.json`, inside `"scripts"`, add these two lines (alongside the existing `fetch:f1-standings` / `backfill:f1-standings` pair — same neighborhood):

```json
    "fetch:asian-games-medals": "tsx scripts/fetch-asian-games-medals.ts",
    "backfill:asian-games-medals": "tsx scripts/backfill-asian-games-medals.ts",
```

- [ ] **Step 4: Register a staleness window**

In `scripts/lib/heartbeat.ts`, add one line to `MAX_AGE_MINUTES` (matching the existing `fetch-f1-standings` entry):

```ts
  "fetch-asian-games-medals": 180,
```

- [ ] **Step 5: Wire the recurring fetch into the VM's hourly job**

In `deploy/vm/scrape.sh`, in `job_hourly()`, add one line after the existing `run fetch:f1-standings`:

```bash
  run fetch:asian-games-medals
```

So `job_hourly()` reads:

```bash
job_hourly() {
  unset SCRAPE_MODE SCRAPE_LEAGUES
  run fetch:injuries
  run fetch:f1-scores
  run fetch:f1-standings
  run fetch:asian-games-medals
  run check:stale
}
```

- [ ] **Step 6: Run the backfill locally against the dev database**

Run: `npm run backfill:asian-games-medals`
Expected: 20 lines like `[backfill-asian-games-medals] 1951: upserted N rows` through `2026`, no more than a couple of failures (network-dependent; a transient Wikipedia failure on one edition is not a blocker — re-run the script, it is a safe upsert). Confirm success by checking the row count:

Run: `psql "$DATABASE_URL" -c "select edition_year, count(*) from medal_tally group by edition_year order by edition_year"`
Expected: one row per successfully-fetched edition, each with a plausible nation count (roughly 20-45 depending on the era).

- [ ] **Step 7: Run the recurring fetch**

Run: `npm run fetch:asian-games-medals`
Expected: `[fetch-asian-games-medals] 2026: upserted N rows`, `medal_tally` now has a 2026 row for every nation currently on Wikipedia's live-updating table.

- [ ] **Step 8: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add scripts/fetch-asian-games-medals.ts scripts/backfill-asian-games-medals.ts package.json scripts/lib/heartbeat.ts deploy/vm/scrape.sh
git commit -m "feat: schedule the Asian Games medal-tally scraper, add one-time backfill"
```

---

### Task 6: Cricket filter + read-side queries

**Files:**
- Modify: `src/lib/cricketFeatured.ts` (add `isAsianGamesCricket`)
- Create: `src/lib/asianGamesMedals.ts` (read queries for the pages — distinct from `scripts/lib/asianGamesMedals.ts`, same naming split the F1 domain already uses: `src/lib/f1.ts` reads, `scripts/lib/*` writes)

**Interfaces:**
- Consumes: `pool` from `src/lib/db.ts`; `sortMedalTally` from `src/lib/medalTallyOrder.ts` (Task 3); `CricketSeriesMatch` type from `src/lib/cricketSeries.ts` (existing).
- Produces: `isAsianGamesCricket(m: { series_name: string }): boolean`; `MedalTallyRow` (read-shape, includes `rank`), `getMedalTallyEditions(): Promise<number[]>`, `getMedalTally(editionYear: number): Promise<MedalTallyRow[]>`. Tasks 7 and 8 (pages) call all three.

- [ ] **Step 1: Add `isAsianGamesCricket` to `src/lib/cricketFeatured.ts`**

Add this function at the end of the file:

```ts
/**
 * True for a cricket match at the Asian Games specifically (not the broader
 * MULTI_SPORT_GAMES set in homeData.ts, which also matches Commonwealth Games and
 * Olympic cricket for homepage ranking purposes). Matched on the series name, not
 * a stored edition id, so the next Asian Games needs no code change here either.
 */
export function isAsianGamesCricket(m: { series_name: string }): boolean {
  return /\basian games\b/i.test(m.series_name);
}
```

- [ ] **Step 2: Write `src/lib/asianGamesMedals.ts`**

```ts
// Read-side queries for the Asian Games medal tally pages. The scraper (write
// side) is scripts/lib/asianGamesMedals.ts — same domain-name split as F1's
// src/lib/f1.ts (reads) vs scripts/lib/f1.ts (writes, via fetch-f1-*.ts).
import { pool } from "./db";
import { sortMedalTally, medalRanks, type OrderableMedal } from "./medalTallyOrder";

interface StoredMedalRow extends OrderableMedal {
  source_url: string | null;
  updated_at: string;
}

export interface MedalTallyRow extends StoredMedalRow {
  rank: number;
}

/** Every edition with stored medal data, most recent first. */
export async function getMedalTallyEditions(): Promise<number[]> {
  const { rows } = await pool.query(`select distinct edition_year from medal_tally order by edition_year desc`);
  return rows.map((r) => r.edition_year as number);
}

/** One edition's medal tally, ordered and ranked (medalTallyOrder.ts) — the stored
 * `rank` column is already this, but recomputing here means the page can never
 * show a rank that disagrees with the order it renders in. */
export async function getMedalTally(editionYear: number): Promise<MedalTallyRow[]> {
  const { rows } = await pool.query<StoredMedalRow>(
    `select nation_slug, nation_name, gold, silver, bronze, source_url, updated_at
     from medal_tally where edition_year = $1`,
    [editionYear]
  );
  const sorted = sortMedalTally(rows);
  const ranks = medalRanks(sorted);
  return sorted.map((r, i) => ({ ...r, rank: ranks[i] }));
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification against Task 5's backfilled data**

Run: `npx tsx -e "import('./src/lib/asianGamesMedals').then(async m => { console.log(await m.getMedalTallyEditions()); console.log((await m.getMedalTally(2026)).slice(0, 5)); process.exit(0); })"`
Expected: an array of edition years including `2026`, then the top 5 rows of the 2026 tally with plausible `rank`/`gold`/`silver`/`bronze` values.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cricketFeatured.ts src/lib/asianGamesMedals.ts
git commit -m "feat: isAsianGamesCricket filter + medal-tally read queries"
```

---

### Task 7: Edition switcher + hub page

**Files:**
- Create: `src/components/AsianGamesEditionSelect.tsx`
- Create: `src/app/asian-games/layout.tsx`
- Create: `src/app/asian-games/page.tsx`

**Interfaces:**
- Consumes: `currentEdition`, `isGamesOpen`, `ASIAN_GAMES_EDITIONS` from `src/lib/asianGamesEditions.ts` (Task 2); `getMedalTallyEditions` from `src/lib/asianGamesMedals.ts` (Task 6); `isAsianGamesCricket` from `src/lib/cricketFeatured.ts` (Task 6); `getUpcomingCricketMatches`, `getLiveCricketMatches` from `src/lib/cricketSeries.ts` (existing); `SeriesMatchList` from `src/components/CricketSeries.tsx` (existing); `SectionHeader` from `src/components/SectionHeader.tsx` (existing); `SubNav` from `src/components/SubNav.tsx` (existing); `pageMeta` from `src/lib/metadata.ts` (existing).
- Produces: `/asian-games` route; `AsianGamesEditionSelect` component reused by Task 8's medal tally page.

- [ ] **Step 1: Write `src/components/AsianGamesEditionSelect.tsx`**

Mirrors `src/components/F1SeasonSelect.tsx` exactly (same "read/write the URL param directly, not a server-computed href-builder" reasoning):

```tsx
"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function AsianGamesEditionSelect({ editions, defaultEdition }: { editions: number[]; defaultEdition: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const value = Number(searchParams.get("edition") ?? defaultEdition);

  function handleChange(next: string) {
    const sp = new URLSearchParams(searchParams.toString());
    if (Number(next) === defaultEdition) sp.delete("edition");
    else sp.set("edition", next);
    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <select
      value={value}
      onChange={(e) => handleChange(e.target.value)}
      className="nav-pill shrink-0 border border-[var(--border)] bg-[var(--surface)] text-sm text-[var(--text-muted)]"
    >
      {editions.map((e) => (
        <option key={e} value={e}>
          {e}
        </option>
      ))}
    </select>
  );
}
```

- [ ] **Step 2: Write `src/app/asian-games/layout.tsx`**

Mirrors `src/app/f1/layout.tsx`:

```tsx
import { SubNav } from "@/components/SubNav";

export default function AsianGamesLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SubNav
        title="Asian Games"
        titleHref="/asian-games"
        tabs={[
          { label: "Overview", href: "/asian-games", exact: true },
          { label: "Medal Tally", href: "/asian-games/medal-tally" },
        ]}
      />
      {children}
    </>
  );
}
```

- [ ] **Step 3: Write `src/app/asian-games/page.tsx`**

```tsx
import Link from "next/link";
import { pageMeta } from "@/lib/metadata";
import { currentEdition, isGamesOpen } from "@/lib/asianGamesEditions";
import { isAsianGamesCricket } from "@/lib/cricketFeatured";
import { getUpcomingCricketMatches, getLiveCricketMatches } from "@/lib/cricketSeries";
import { SeriesMatchList } from "@/components/CricketSeries";
import { SectionHeader } from "@/components/SectionHeader";
import { AdSlot } from "@/components/AdSlot";

export const metadata = pageMeta(
  "Asian Games",
  "Asian Games schedule, live cricket matches and the medal tally, 1951-2026.",
  "/asian-games"
);

export const revalidate = 300;

export default async function AsianGamesPage() {
  const edition = currentEdition();
  const open = isGamesOpen(edition);

  const [liveAll, upcomingAll] = await Promise.all([getLiveCricketMatches(true), getUpcomingCricketMatches(30, 20, true)]);
  const liveCricket = liveAll.filter(isAsianGamesCricket);
  const liveIds = new Set(liveCricket.map((m) => m.espn_id));
  const upcomingCricket = upcomingAll.filter((m) => isAsianGamesCricket(m) && !liveIds.has(m.espn_id));

  return (
    <div className="flex flex-col gap-6">
      <div className="card px-4 py-4">
        <h1 className="page-title">{edition.hostCity} {edition.year}</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          {edition.hostCity}, {edition.hostCountry} &middot; {edition.startDate} to {edition.endDate}
          {open && <span className="ml-2 rounded-full bg-[var(--live)] px-2 py-0.5 text-xs font-bold text-white">LIVE</span>}
        </p>
        <Link href="/asian-games/medal-tally" className="mt-3 inline-block text-sm font-semibold text-[var(--accent)] hover:underline">
          View the medal tally &rarr;
        </Link>
      </div>

      <AdSlot label="Asian Games top" />

      <section>
        <SectionHeader
          action={{ label: "All cricket", href: "/cricket/series" }}
          description="The Asian Games sports this site covers live. Every other sport is on the medal tally only — see the medal tally page for why."
        >
          Cricket
        </SectionHeader>
        {liveCricket.length > 0 && (
          <>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Live now</p>
            <SeriesMatchList matches={liveCricket} showSeries />
          </>
        )}
        {upcomingCricket.length > 0 ? (
          <>
            <p className="mb-2 mt-4 text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Upcoming</p>
            <SeriesMatchList matches={upcomingCricket} showSeries />
          </>
        ) : (
          liveCricket.length === 0 && <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">No Asian Games cricket fixtures on record right now.</p>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (`--live` is a real CSS variable, defined in `src/app/globals.css`'s `:root` and dark-mode blocks — confirmed present; the codebase has no existing "LIVE" text-pill component to match, so this is a small one-off, styled consistently with the site's other `rounded-full` pills.)

- [ ] **Step 5: Manual verification**

Run: `npm run dev`, visit `/asian-games`.
Expected: page renders with the 2026 Aichi-Nagoya header, a LIVE badge (today, 2026-09-23, is inside the Games' window), a link to the medal tally, and the live/upcoming Asian Games cricket matches the site already has (cross-check against the homepage's cricket "Coming up" section from the earlier verification in this conversation — the same two Japan v Afghanistan / Hong Kong v Malaysia matches should appear here too).

- [ ] **Step 6: Commit**

```bash
git add src/components/AsianGamesEditionSelect.tsx src/app/asian-games/layout.tsx src/app/asian-games/page.tsx
git commit -m "feat: Asian Games hub page (status, live/upcoming cricket)"
```

---

### Task 8: Medal tally page

**Files:**
- Create: `src/app/asian-games/medal-tally/page.tsx`

**Interfaces:**
- Consumes: `getMedalTallyEditions`, `getMedalTally` from `src/lib/asianGamesMedals.ts` (Task 6); `CURRENT_EDITION_YEAR` from `src/lib/asianGamesEditions.ts` (Task 2); `AsianGamesEditionSelect` from `src/components/AsianGamesEditionSelect.tsx` (Task 7); `pageMeta` from `src/lib/metadata.ts`.
- Produces: `/asian-games/medal-tally` route.

- [ ] **Step 1: Write `src/app/asian-games/medal-tally/page.tsx`**

```tsx
import { pageMeta } from "@/lib/metadata";
import { getMedalTallyEditions, getMedalTally } from "@/lib/asianGamesMedals";
import { CURRENT_EDITION_YEAR } from "@/lib/asianGamesEditions";
import { AsianGamesEditionSelect } from "@/components/AsianGamesEditionSelect";
import { AdSlot } from "@/components/AdSlot";

export const metadata = pageMeta("Asian Games Medal Tally", "Gold, silver and bronze medal counts for every Asian Games edition, 1951-2026.", "/asian-games/medal-tally");

export const revalidate = 300;

export default async function AsianGamesMedalTallyPage({ searchParams }: { searchParams: Promise<{ edition?: string }> }) {
  const { edition: editionParam } = await searchParams;
  const editions = await getMedalTallyEditions();
  const defaultEdition = editions.includes(CURRENT_EDITION_YEAR) ? CURRENT_EDITION_YEAR : (editions[0] ?? CURRENT_EDITION_YEAR);
  const activeEdition = editionParam && editions.includes(Number(editionParam)) ? Number(editionParam) : defaultEdition;

  const rows = await getMedalTally(activeEdition);
  const sourceUrl = rows[0]?.source_url ?? `https://en.wikipedia.org/wiki/${activeEdition}_Asian_Games_medal_table`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="page-title">Asian Games Medal Tally</h1>
        {editions.length > 1 && <AsianGamesEditionSelect editions={editions} defaultEdition={defaultEdition} />}
      </div>

      <AdSlot label="Asian Games medal tally top" />

      {rows.length === 0 ? (
        <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">No {activeEdition} medal data on record.</p>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="table-head text-left">
                <th className="py-2 pl-4 font-medium">#</th>
                <th className="py-2 font-medium">Nation</th>
                <th className="py-2 text-right font-medium">Gold</th>
                <th className="py-2 text-right font-medium">Silver</th>
                <th className="py-2 text-right font-medium">Bronze</th>
                <th className="py-2 pr-4 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.nation_slug} className="table-row">
                  <td className="py-2 pl-4 tabular-nums text-[var(--text-muted)]">{r.rank}</td>
                  <td className="py-2 font-medium">{r.nation_name}</td>
                  <td className="py-2 text-right tabular-nums">{r.gold}</td>
                  <td className="py-2 text-right tabular-nums">{r.silver}</td>
                  <td className="py-2 text-right tabular-nums">{r.bronze}</td>
                  <td className="py-2 pr-4 text-right font-bold tabular-nums">{r.gold + r.silver + r.bronze}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-[var(--text-muted)]">
        Medal data from Wikipedia&apos;s{" "}
        <a href={sourceUrl} className="underline" target="_blank" rel="noopener noreferrer">
          &quot;{activeEdition} Asian Games medal table&quot;
        </a>
        , used under{" "}
        <a href="https://creativecommons.org/licenses/by-sa/4.0/" className="underline" target="_blank" rel="noopener noreferrer">
          CC BY-SA 4.0
        </a>
        .
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, visit `/asian-games/medal-tally`.
Expected: table sorted gold-first for the 2026 edition (defaulted), the edition dropdown lists all 20 backfilled years, switching editions via the dropdown updates the URL to `?edition=YYYY` and the table, and the Wikipedia attribution line renders with a working link.

- [ ] **Step 4: Commit**

```bash
git add src/app/asian-games/medal-tally/page.tsx
git commit -m "feat: Asian Games medal tally page with edition switcher"
```

---

### Task 9: Nav + sitemap

**Files:**
- Modify: `src/lib/nav.ts`
- Modify: `src/lib/sitemap.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new (wiring only).

- [ ] **Step 1: Add the nav entry**

In `src/lib/nav.ts`, add a new item to `NAV_ITEMS` right after the existing `{ label: "F1", href: "/f1" }` entry:

```ts
  { label: "Asian Games", href: "/asian-games" },
```

- [ ] **Step 2: Add sitemap entries**

In `src/lib/sitemap.ts`, in the `core()` function, add two lines right after the existing F1 entries (`entry("/f1/standings", ...)`):

```ts
    entry("/asian-games", "daily", 0.6),
    entry("/asian-games/medal-tally", "daily", 0.5),
```

(Query-string edition variants are intentionally not enumerated — same reasoning `pageMeta`'s canonical-URL comment gives for F1 seasons: one canonical URL per page, not one per edition.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, confirm "Asian Games" appears in the header nav and links to `/asian-games`; visit `/sitemaps/core.xml` (or wherever the core sitemap is served — check `src/app/sitemap.xml/route.ts` or equivalent if the direct path 404s) and confirm both new URLs appear.

- [ ] **Step 5: Commit**

```bash
git add src/lib/nav.ts src/lib/sitemap.ts
git commit -m "feat: add Asian Games to site nav and sitemap"
```

---

## Final verification (after all tasks)

- [ ] Full test suite: `npm test` — expect all tests passing, including the 6 new `medal-tally-order` tests and the 6 new `asian-games-medals-parser` tests.
- [ ] `npx tsc --noEmit` — clean.
- [ ] `npm run lint` — clean.
- [ ] Click through `/asian-games` and `/asian-games/medal-tally` (including switching editions down to 1951) in a real browser; confirm no console errors.
- [ ] Confirm the Wikipedia attribution footer and its two links render and resolve.
