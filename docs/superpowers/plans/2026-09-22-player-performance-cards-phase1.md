# Player performance cards (phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After every NBA/NFL game, any player with a real box-score line gets a shareable, server-rendered PNG "performance card" at its own URL, with a "Share card" control on the game page (top performers and every box-score row) that downloads, copies, or opens the native share sheet with that image — no photos, light theme only, phase 1 scope only.

**Architecture:** One pure stat-selection module (`performanceLine`) reused by a single flexbox/inline-style-only React component (`PerformanceCard`), rendered exclusively through `next/og`'s `ImageResponse` (Satori) behind a new `GET` route with three fixed output sizes. The route is the only place that touches the database; it reuses the exact same `StatSpec`/`cell()`/`buildStagedProfile(...).regular` pipeline the player page already uses, so a card can never disagree with the page. The share affordance reuses `ImageActions`' existing share-sheet/clipboard/download logic via a new `imageUrl` prop (fetch the PNG as a blob) rather than duplicating it.

**Tech Stack:** Next.js 16 App Router (`next/og` `ImageResponse`, Satori), TypeScript, Postgres (existing schema, no migrations), `node:test` via `tsx` (existing test runner), `embedded-postgres` test DB helper (existing).

**Spec:** [`docs/superpowers/specs/2026-09-20-player-performance-cards-design.md`](../specs/2026-09-20-player-performance-cards-design.md)

## Global Constraints

- Card markup is flexbox and inline styles only — no `<table>`, no CSS grid — so it renders identically in Satori and (later) a browser. (Spec §1)
- Light theme only: reuse `CARD` from `src/lib/exportTheme.ts` verbatim. No new palette. (Spec §1)
- No photographs anywhere on the card: no headshots, no team logos. Team identity is a colored disc with the team's abbreviation. (Spec §1)
- Card has no stat logic of its own: every number comes from `StatSpec`/`cell()` (`src/lib/playerProfile.ts`) and `buildStagedProfile(...).regular`. (Spec §2)
- Route: `GET /[league]/games/[id]/players/[slug]/card?format=og|portrait|story`. `og` = 1200×630, `portrait` = 1080×1350, `story` = 1080×1920. Any other `format` value → 400. Unknown league, game, player, or a player with no stat line in that game → 404. (Spec §3)
- Phase 1 covers NBA and NFL only — no soccer, no cricket. A league outside `{nba, nfl}` on the card route → 404. (Spec, Phases)
- No tags ("Season high", "Triple-double") in phase 1 — explicitly deferred to phase 2 (see Deviations below).
- No new HTML page in phase 1 — the only UI change is a "Share card" control added to the existing game page. (Spec §3)
- The card loads no external image and makes no network call during render — no image URLs anywhere in the rendered element tree. (Spec §6, Testing)
- Cache-Control: `public, s-maxage=86400, stale-while-revalidate=604800` when the game has been final for more than 2 hours; `public, s-maxage=300` otherwise. (Spec §6)
- Font: bundle Inter Regular (400) and Bold (700), subsetted to Latin + Latin Extended, as local `.ttf` files read once at module scope — confirmed by the user 2026-09-22 (see Deviations). (Spec §6)
- One GA event per share/download/copy: `share_card`, with `league` and `format`. (Spec §8)

### Deviations from the spec (resolved during planning, 2026-09-22)

- **Tags are Phase 2, not Phase 1.** The spec's "Phases" section explicitly scopes `performanceTags` to phase 2, but its "Testing" section lists `performanceTags` boundaries under phase-1-shaped testing. The "Phases" section is the authoritative scope statement (it is what phase 1 literally builds); this plan does not implement or test `performanceTags`. No tags row is rendered.
- **Font choice.** The spec says "bundle one subsetted TTF" without naming the font. The user was shown a side-by-side render of Inter and Noto Sans (including the diacritic acceptance names) and chose **Inter**, Regular + Bold, confirming light-mode-only cards (already spec'd).
- **Season baseline for the "vs season avg" comparison chip.** The spec says the chip compares "against the player's regular-season average... from `buildStagedProfile(...).regular`" without saying which season. This plan uses the specific season the game belongs to (`profile.regular.seasons.find(s => s.season === row.season_year)`), falling back to `profile.regular.career` if that season has no entry (should not happen in practice, since the game itself is in the log). A career-wide average would make "+8 vs season avg" read as "vs career avg", which contradicts the chip's own label.

## Task 1: Bundle the card font

**Files:**
- Create: `assets/fonts/Inter-Regular.ttf`, `assets/fonts/Inter-Bold.ttf` (binary, fetched — see Step 1)
- Create: `src/lib/cardFont.ts`
- Test: `tests/card-font.test.ts`

**Interfaces:**
- Produces: `CARD_FONTS: { name: string; data: Buffer; weight: 400 | 700; style: "normal" }[]` — exported from `src/lib/cardFont.ts`, for `ImageResponse`'s `fonts` option (Task 5).

- [ ] **Step 1: Fetch the subsetted Inter TTF files**

`next/og` (`ImageResponse`) only accepts `ttf`/`otf`/`woff` (not `woff2`), and Google Fonts serves `woff2` by default to modern user agents. Fetch the CSS with a legacy user agent so Google Fonts serves `ttf` links, restricted to Latin + Latin Extended so the file stays small:

```bash
mkdir -p assets/fonts
UA="Mozilla/5.0 (Windows NT 6.1) AppleWebKit/534.34 (KHTML, like Gecko) PhantomJS/1.9.7 Safari/534.34"
curl -s -A "$UA" "https://fonts.googleapis.com/css2?family=Inter:wght@400;700&subset=latin,latin-ext" -o /tmp/inter.css
grep -oE "https://fonts.gstatic.com/[^)]+\.ttf" /tmp/inter.css
```

That prints two (or more, one per Unicode range) `.ttf` URLs. Google Fonts variable-font families can split a weight across several `unicode-range` blocks under the same `@font-face` — if `grep` prints more than 2 URLs, open `/tmp/inter.css` and match each URL to its `font-weight: 400` or `font-weight: 700` block, and pick the block(s) that cover the Latin + Latin Extended ranges (skip any Cyrillic/Greek/Vietnamese-only range blocks — Inter's `latin,latin-ext` subset request should already exclude those, so this is a sanity check, not expected to matter). Download the regular-weight file to `assets/fonts/Inter-Regular.ttf` and the bold-weight file to `assets/fonts/Inter-Bold.ttf`:

```bash
curl -s -A "$UA" "<the font-weight:400 .ttf URL>" -o assets/fonts/Inter-Regular.ttf
curl -s -A "$UA" "<the font-weight:700 .ttf URL>" -o assets/fonts/Inter-Bold.ttf
ls -la assets/fonts/
```

Confirm both files exist and their combined size is comfortably under the 500 KB `ImageResponse` bundle ceiling (spec target: "under about 150 KB" combined — if the combined size is noticeably larger, re-run the `curl` to the CSS endpoint with `&text=` set to a short representative string instead of `&subset=latin,latin-ext` is a fallback, but try the subset approach first since the card must render arbitrary player names, not a fixed string).

- [ ] **Step 2: Write the font loader**

```ts
// src/lib/cardFont.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Read once at module scope (next/og docs: "The font doesn't depend on request
// data, so read it once at module scope") — assets/fonts holds two Latin +
// Latin Extended subsets of Inter (see docs/superpowers/specs/2026-09-20-
// player-performance-cards-design.md §6 for the diacritic acceptance names).
const regular = readFileSync(join(process.cwd(), "assets/fonts/Inter-Regular.ttf"));
const bold = readFileSync(join(process.cwd(), "assets/fonts/Inter-Bold.ttf"));

export const CARD_FONTS: { name: string; data: Buffer; weight: 400 | 700; style: "normal" }[] = [
  { name: "Inter", data: regular, weight: 400, style: "normal" },
  { name: "Inter", data: bold, weight: 700, style: "normal" },
];
```

- [ ] **Step 3: Write the failing test**

```ts
// tests/card-font.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { CARD_FONTS } from "../src/lib/cardFont";

test("the card font bundle has a regular and a bold Inter weight, well under the ImageResponse 500KB ceiling", () => {
  assert.equal(CARD_FONTS.length, 2);
  const weights = CARD_FONTS.map((f) => f.weight).sort();
  assert.deepEqual(weights, [400, 700]);
  for (const f of CARD_FONTS) {
    assert.equal(f.name, "Inter");
    assert.equal(f.style, "normal");
    assert.ok(f.data.byteLength > 0, "font file must not be empty");
  }
  const total = CARD_FONTS.reduce((sum, f) => sum + f.data.byteLength, 0);
  assert.ok(total < 300_000, `combined font size ${total} bytes is too large for a 500KB ImageResponse budget shared with JSX/CSS`);
});
```

- [ ] **Step 4: Run the test to verify it passes** (it should pass immediately once the files exist — this test is a size/shape guard, not TDD-red-then-green)

Run: `npx tsx --test tests/card-font.test.ts`
Expected: PASS. If it fails on the size assertion, go back to Step 1 and use a tighter `text=` subset instead of the full `latin,latin-ext` range.

- [ ] **Step 5: Commit**

```bash
git add assets/fonts/Inter-Regular.ttf assets/fonts/Inter-Bold.ttf src/lib/cardFont.ts tests/card-font.test.ts
git commit -m "feat: bundle Inter font for performance-card rendering"
```

## Task 2: Team-color contrast utility

**Files:**
- Create: `src/lib/cardColor.ts`
- Test: `tests/card-color.test.ts`

**Interfaces:**
- Produces: `cardAccentColor(teamColor: string | null): string` — a `#rrggbb` string, always a valid CSS color, for the card's disc/oversized-stat accent (Task 4).

- [ ] **Step 1: Write the failing test**

```ts
// tests/card-color.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { cardAccentColor } from "../src/lib/cardColor";
import { CARD } from "../src/lib/exportTheme";

test("a missing team color falls back to the card accent", () => {
  assert.equal(cardAccentColor(null), CARD.accent);
});

test("a normal dark team color is used as-is, normalized to a leading #", () => {
  assert.equal(cardAccentColor("1d428a"), "#1d428a");
  assert.equal(cardAccentColor("#1d428a"), "#1d428a");
});

test("a team color too close to the white card surface falls back to the card accent", () => {
  // Golden State's pale gold and a plain white both fail a 3:1 contrast check against CARD.surface (#ffffff).
  assert.equal(cardAccentColor("ffc72c"), CARD.accent);
  assert.equal(cardAccentColor("ffffff"), CARD.accent);
});

test("a mid-tone team color that does pass 3:1 is kept", () => {
  // A saturated blue comfortably clears 3:1 against white.
  assert.equal(cardAccentColor("0057b8"), "#0057b8");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test tests/card-color.test.ts`
Expected: FAIL with "Cannot find module '../src/lib/cardColor'"

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/cardColor.ts
import { CARD } from "./exportTheme";

// WCAG relative luminance of an sRGB color (0..1).
function relativeLuminance(hex: string): number {
  const n = parseInt(hex, 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two #rrggbb-less hex colors (no leading #), 1 (no contrast) to 21 (max). */
export function contrastRatio(hexA: string, hexB: string): number {
  const la = relativeLuminance(hexA);
  const lb = relativeLuminance(hexB);
  const [lighter, darker] = la >= lb ? [la, lb] : [lb, la];
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * The card's accent color for a team: the team's own stored color when it clears a 3:1
 * contrast check against the card's white surface (CARD.surface), else CARD.accent. Null
 * (no stored color) always falls back to CARD.accent. See design doc §1 ("Contrast must
 * be checked for team colours that are very light").
 */
export function cardAccentColor(teamColor: string | null): string {
  if (!teamColor) return CARD.accent;
  const hex = teamColor.replace(/^#/, "").toLowerCase();
  if (!/^[0-9a-f]{6}$/.test(hex)) return CARD.accent;
  const surfaceHex = CARD.surface.replace(/^#/, "").toLowerCase();
  return contrastRatio(hex, surfaceHex) >= 3 ? `#${hex}` : CARD.accent;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx --test tests/card-color.test.ts`
Expected: PASS (all 4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/cardColor.ts tests/card-color.test.ts
git commit -m "feat: contrast-checked team accent color for performance cards"
```

## Task 3: `performanceLine` — pure stat selection and season-average deltas

**Files:**
- Create: `src/lib/performanceLine.ts`
- Test: `tests/performance-line.test.ts`

**Interfaces:**
- Consumes: `PlayerLogRow`, `PlayerProfile`, `Line`, `StatSpec`, `cell`, `formatStat` from `src/lib/playerProfile.ts`; `PlayerSport` from the same file.
- Produces:
  ```ts
  export interface PerformanceStat {
    key: string;
    label: string;       // StatSpec.label, e.g. "PTS", "Pass YDS"
    title: string;       // StatSpec.title, e.g. "Points"
    value: string;       // formatted with formatStat, e.g. "34", "11-19"
    delta: string | null; // e.g. "+8 vs season avg"; null when no season baseline exists
  }
  export function performanceLine(sport: PlayerSport, row: PlayerLogRow, seasonProfile: PlayerProfile): PerformanceStat[]
  ```
  Consumed by `PerformanceCard` (Task 4) and the `card` route (Task 5).

- [ ] **Step 1: Write the failing tests**

```ts
// tests/performance-line.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { performanceLine } from "../src/lib/performanceLine";
import { buildProfile, type PlayerLogRow, type Stats } from "../src/lib/playerProfile";

function nbaRow(overrides: Partial<PlayerLogRow> = {}): PlayerLogRow {
  const stats: Stats = { box: { MIN: "36", PTS: "34", REB: "11", AST: "9", STL: "2", BLK: "1", TO: "3", FG: "12-19", "3PT": "3-7", FT: "7-8", "+/-": "-4" } };
  return {
    game_espn_id: "g1", date: "2026-01-15T00:00:00.000Z", season_year: 2025, round: null, week: null,
    stage: "regular", season_type: 2, competition_type: "STD", is_home: true,
    team_espn_id: "1", team_name: "Lakers", team_slug: "lakers", team_abbr: "LAL", team_logo: null,
    opponent_espn_id: "2", opponent_name: "Celtics", opponent_slug: "celtics", opponent_abbr: "BOS", opponent_logo: null,
    team_score: 110, opponent_score: 108, result: "W", stats, ...overrides,
  };
}

function nflRow(overrides: Partial<PlayerLogRow> = {}): PlayerLogRow {
  const stats: Stats = { passing: { "C/ATT": "24/35", YDS: "312", TD: "3", INT: "1", RTG: "108.2" } };
  return {
    game_espn_id: "g1", date: "2026-01-15T00:00:00.000Z", season_year: 2025, round: null, week: 10,
    stage: "regular", season_type: 2, competition_type: "STD", is_home: true,
    team_espn_id: "1", team_name: "Chiefs", team_slug: "chiefs", team_abbr: "KC", team_logo: null,
    opponent_espn_id: "2", opponent_name: "Bills", opponent_slug: "bills", opponent_abbr: "BUF", opponent_logo: null,
    team_score: 27, opponent_score: 20, result: "W", stats, ...overrides,
  };
}

test("NBA: headline stats are PTS/REB/AST/STL/BLK plus shooting splits and +/-, with a delta vs that season's average", () => {
  const row = nbaRow();
  // A season of games averaging lower than this one game, so the delta is a known positive number.
  const seasonRows = Array.from({ length: 10 }, () => nbaRow({ stats: { box: { MIN: "30", PTS: "26", REB: "8", AST: "6", STL: "1", BLK: "1", TO: "2", FG: "9-18", "3PT": "2-6", FT: "6-7", "+/-": "+1" } } }));
  const profile = buildProfile("nba", seasonRows);
  const line = performanceLine("nba", row, profile);

  const byKey = new Map(line.map((s) => [s.key, s]));
  assert.deepEqual([...byKey.keys()].sort(), ["ast", "blk", "fg_pct", "ftm_fta", "pts", "reb", "stl", "tpm_tpa"].sort());
  assert.equal(byKey.get("pts")!.value, "34");
  assert.equal(byKey.get("pts")!.delta, "+8 vs season avg");
  assert.equal(byKey.get("ftm_fta")!.value, "7-8");
  assert.equal(byKey.get("tpm_tpa")!.value, "3-7");
});

test("NBA: a negative +/- stays negative in both value and delta", () => {
  const row = nbaRow(); // "+/-": "-4"
  const seasonRows = Array.from({ length: 5 }, () => nbaRow({ stats: { box: { MIN: "30", PTS: "20", REB: "8", AST: "5", STL: "1", BLK: "1", TO: "2", FG: "8-16", "3PT": "2-5", FT: "2-3", "+/-": "+6" } } }));
  const profile = buildProfile("nba", seasonRows);
  const line = performanceLine("nba", row, profile);
  const pm = line.find((s) => s.key === "pm")!;
  assert.equal(pm.value, "-4");
  assert.equal(pm.delta, "-10 vs season avg");
});

test("NFL: passing headline stats read the same sum-aggregated specs the player page uses, with a per-game season average for the delta", () => {
  const row = nflRow(); // 312 pass yards this game
  // 5 games at 250 pass yards each = 1250 season total, 250/gm average, so the delta is +62.
  const seasonRows = Array.from({ length: 5 }, () => nflRow({ stats: { passing: { "C/ATT": "20/32", YDS: "250", TD: "2", INT: "1", RTG: "95.0" } } }));
  const profile = buildProfile("nfl", seasonRows);
  const line = performanceLine("nfl", row, profile);
  const passYds = line.find((s) => s.key === "pass_yds")!;
  assert.equal(passYds.value, "312");
  assert.equal(passYds.delta, "+62 vs season avg");
});

test("a stat with no season line (first game of a season with only this one row) has a null delta, not a crash", () => {
  const row = nbaRow();
  const profile = buildProfile("nba", [row]);
  const line = performanceLine("nba", row, profile);
  // Averaged against itself, the delta is +0 — assert it's present and zero, not null, proving no divide-by-zero/NaN.
  const pts = line.find((s) => s.key === "pts")!;
  assert.equal(pts.delta, "+0 vs season avg");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsx --test tests/performance-line.test.ts`
Expected: FAIL with "Cannot find module '../src/lib/performanceLine'"

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/performanceLine.ts
import { cell, formatStat, type Line, type PlayerLogRow, type PlayerProfile, type PlayerSport, type StatSpec } from "./playerProfile";

export interface PerformanceStat {
  key: string;
  label: string;
  title: string;
  value: string;
  delta: string | null;
}

// Fixed per spec §1 ("NBA: PTS, REB, AST, STL, BLK, with FG, 3P, FT made-attempted and +/-"),
// not the `headline`-flagged subset used by the career strip (that subset omits STL/BLK/+/-
// and the made-attempted pairs).
const NBA_KEYS = ["pts", "reb", "ast", "stl", "blk", "fg_pct", "pm"] as const;
// Made-attempted pairs shown as "12-19" rather than as two separate spec rows.
const NBA_MA_PAIRS: { key: string; made: string; att: string; title: string }[] = [
  { key: "fgm_fga", made: "fgm", att: "fga", title: "Field goals" },
  { key: "tpm_tpa", made: "tpm", att: "tpa", title: "Three-pointers" },
  { key: "ftm_fta", made: "ftm", att: "fta", title: "Free throws" },
];

function seasonLineFor(row: PlayerLogRow, profile: PlayerProfile): Line {
  return profile.seasons.find((s) => s.season === row.season_year)?.line ?? profile.career;
}

// A spec's season-average per game: SeasonLine.line already holds a per-game average for an
// "avg"-aggregated spec (NBA), but a per-game *total* for a "sum"-aggregated spec (NFL) — that
// total must be divided by the season's game count to be comparable to one game's value.
function seasonAverage(spec: StatSpec, seasonLine: Line, seasonGames: number): number | null {
  const v = seasonLine[spec.key];
  if (v == null) return null;
  if (spec.agg !== "sum") return v;
  return seasonGames > 0 ? v / seasonGames : null;
}

function deltaLabel(gameValue: number | null, avg: number | null, spec: StatSpec): string | null {
  if (gameValue == null || avg == null) return null;
  const diff = gameValue - avg;
  const sign = diff >= 0 ? "+" : "-";
  return `${sign}${formatStat(spec, Math.abs(diff))} vs season avg`;
}

function statFor(spec: StatSpec, row: PlayerLogRow, seasonLine: Line, seasonGames: number): PerformanceStat {
  const gameValue = spec.value(row.stats);
  const avg = seasonAverage(spec, seasonLine, seasonGames);
  return { key: spec.key, label: spec.label, title: spec.title, value: formatStat(spec, gameValue), delta: deltaLabel(gameValue, avg, spec) };
}

function nbaLine(row: PlayerLogRow, profile: PlayerProfile): PerformanceStat[] {
  const bySpecKey = new Map(profile.profile.specs.map((s) => [s.key, s]));
  const seasonLine = seasonLineFor(row, profile);
  const seasonEntry = profile.seasons.find((s) => s.season === row.season_year);
  const seasonGames = seasonEntry?.recorded ?? profile.rows.length;

  const simple = NBA_KEYS.map((key) => statFor(bySpecKey.get(key)!, row, seasonLine, seasonGames));
  const pairs = NBA_MA_PAIRS.map(({ key, made, att, title }) => {
    const madeSpec = bySpecKey.get(made)!;
    const attSpec = bySpecKey.get(att)!;
    const m = madeSpec.value(row.stats);
    const a = attSpec.value(row.stats);
    return { key, label: madeSpec.label.replace("M", ""), title, value: m == null || a == null ? "–" : `${formatStat(madeSpec, m)}-${formatStat(attSpec, a)}`, delta: null };
  });
  return [...simple.filter((s) => NBA_KEYS.includes(s.key as (typeof NBA_KEYS)[number])), ...pairs];
}

function nflLine(row: PlayerLogRow, profile: PlayerProfile): PerformanceStat[] {
  const seasonLine = seasonLineFor(row, profile);
  const seasonEntry = profile.seasons.find((s) => s.season === row.season_year);
  const seasonGames = seasonEntry?.recorded ?? profile.rows.length;
  // Position-appropriate specs are already resolved by buildProfile/nflProfile (active category
  // detection from the player's own row history) — reuse them rather than re-deriving a position
  // group here, so a card can never disagree with the page about which categories this player plays.
  return profile.profile.specs.filter((s) => s.headline).map((spec) => statFor(spec, row, seasonLine, seasonGames));
}

export function performanceLine(sport: PlayerSport, row: PlayerLogRow, profile: PlayerProfile): PerformanceStat[] {
  if (sport === "nba") return nbaLine(row, profile);
  if (sport === "nfl") return nflLine(row, profile);
  throw new Error(`performanceLine: unsupported sport "${sport}" — phase 1 is NBA and NFL only`);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx --test tests/performance-line.test.ts`
Expected: PASS (all 4 tests). If the NBA key-set assertion fails, check `NBA_SPECS` in `src/lib/playerProfile.ts` for the exact `fgm`/`fga`/`tpm`/`tpa`/`ftm`/`fta`/`pm` keys before changing `NBA_KEYS`/`NBA_MA_PAIRS` — do not rename spec keys to make the test pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/performanceLine.ts tests/performance-line.test.ts
git commit -m "feat: pure performanceLine stat selection for NBA and NFL cards"
```

## Task 4: `PerformanceCard` component

**Files:**
- Create: `src/components/PerformanceCard.tsx`
- Test: `tests/performance-card.test.ts`

**Interfaces:**
- Consumes: `PerformanceStat[]` from Task 3; `cardAccentColor` from Task 2; `CARD`, `CARD_FONT` from `src/lib/exportTheme.ts`; `ExportFooter` from `src/components/ExportFooter.tsx`; `gameRoundLabel` from `src/lib/stage.ts`; `formatGameDate` from `src/lib/gameDay.ts`; `LEAGUE_LABEL` from `src/lib/leagues.ts`.
- Produces:
  ```ts
  export interface PerformanceCardProps {
    league: "nba" | "nfl";
    playerName: string;
    position: string | null;
    jersey: string | null;
    teamAbbr: string | null;
    teamColor: string | null; // raw stored value, not yet contrast-checked — the component checks it
    opponentAbbr: string | null;
    resultLetter: "W" | "L" | null;
    teamScore: number | null;
    opponentScore: number | null;
    date: string; // already formatted, e.g. "Sep 20, 2026" — callers use formatGameDate
    stageLabel: string | null; // e.g. "Playoffs · Round of 16"; null renders no eyebrow stage segment
    stats: PerformanceStat[];
  }
  export function PerformanceCard(props: PerformanceCardProps): JSX.Element
  ```
  Consumed by the `card` route (Task 5).

- [ ] **Step 1: Write the failing test**

Following the existing `renderToStaticMarkup`-based structural test pattern (`tests/lighter-html.test.ts`):

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test tests/performance-card.test.ts`
Expected: FAIL with "Cannot find module '../src/components/PerformanceCard'"

- [ ] **Step 3: Write the implementation**

```tsx
// src/components/PerformanceCard.tsx
import { CARD, CARD_FONT } from "@/lib/exportTheme";
import { cardAccentColor } from "@/lib/cardColor";
import { ExportFooter } from "./ExportFooter";
import { LEAGUE_LABEL } from "@/lib/leagues";
import type { PerformanceStat } from "@/lib/performanceLine";

export interface PerformanceCardProps {
  league: "nba" | "nfl";
  playerName: string;
  position: string | null;
  jersey: string | null;
  teamAbbr: string | null;
  teamColor: string | null;
  opponentAbbr: string | null;
  resultLetter: "W" | "L" | null;
  teamScore: number | null;
  opponentScore: number | null;
  date: string;
  stageLabel: string | null;
  stats: PerformanceStat[];
}

// Flexbox and inline styles only — this subset renders identically in Satori (ImageResponse,
// the card route) and a real browser, per design doc §1. No <table>, no CSS grid, no <img>.
export function PerformanceCard({ league, playerName, position, jersey, teamAbbr, teamColor, opponentAbbr, resultLetter, teamScore, opponentScore, date, stageLabel, stats }: PerformanceCardProps) {
  const accent = cardAccentColor(teamColor);

  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: CARD.surface, fontFamily: CARD_FONT, padding: 40, position: "relative" }}>
      {/* Oversized jersey number watermark, behind everything else. */}
      {jersey && (
        <div style={{ position: "absolute", top: -40, right: 20, fontSize: 340, fontWeight: 700, color: `${accent}1a`, lineHeight: 1 }}>{jersey}</div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 16, color: CARD.textMuted, fontWeight: 700 }}>
        <span>{LEAGUE_LABEL[league]}</span>
        <span>·</span>
        <span>{date}</span>
        {stageLabel && (
          <>
            <span>·</span>
            <span>{stageLabel}</span>
          </>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 20 }}>
        <div style={{ display: "flex", width: 64, height: 64, borderRadius: 32, background: accent, color: CARD.surface, alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 700 }}>
          {teamAbbr ?? ""}
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 40, fontWeight: 700, color: CARD.text }}>{playerName}</div>
          <div style={{ fontSize: 18, color: CARD.textMuted, marginTop: 4 }}>
            {[position, jersey ? `#${jersey}` : null].filter(Boolean).join(" · ")}
            {opponentAbbr ? ` vs ${opponentAbbr}` : ""}
          </div>
        </div>
      </div>

      {resultLetter && teamScore != null && opponentScore != null && (
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 12 }}>
          <span style={{ fontSize: 22, fontWeight: 700, color: resultLetter === "W" ? CARD.win : CARD.loss }}>{resultLetter}</span>
          <span style={{ fontSize: 22, fontWeight: 700, color: CARD.text }}>
            {teamScore}-{opponentScore}
          </span>
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 28 }}>
        {stats.map((s) => (
          <div key={s.key} style={{ display: "flex", flexDirection: "column", background: CARD.bg, borderRadius: 12, padding: "14px 18px", minWidth: 130 }}>
            <span style={{ fontSize: 30, fontWeight: 700, color: accent }}>{s.value}</span>
            <span style={{ fontSize: 13, color: CARD.textMuted, marginTop: 2 }}>{s.label}</span>
            {s.delta && <span style={{ fontSize: 12, color: CARD.textFaint, marginTop: 4 }}>{s.delta}</span>}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", flex: 1 }} />
      <ExportFooter context={`${LEAGUE_LABEL[league]} · Player card`} />
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx --test tests/performance-card.test.ts`
Expected: PASS (all 5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/PerformanceCard.tsx tests/performance-card.test.ts
git commit -m "feat: PerformanceCard component (flexbox/inline-style subset, light theme)"
```

## Task 5: The `card` route

**Files:**
- Create: `src/app/[league]/games/[id]/players/[slug]/card/route.ts`
- Test: `tests/performance-card-route.test.ts`

**Interfaces:**
- Consumes: `CARD_FONTS` (Task 1), `PerformanceCard` (Task 4), `performanceLine` (Task 3); `isLeague`, `getGameByEspnId`, `getPlayerBySlug`, `getPlayerLog`, `getPlayerReportedGames`, `getPlayerEspnSeasons` from `src/lib/queries.ts`; `buildStagedProfile`, `playerSport` from `src/lib/playerProfile.ts`; `gameRoundLabel` from `src/lib/stage.ts`; `formatGameDate` from `src/lib/gameDay.ts`.
- Produces: `GET(request, { params }): Promise<Response>` at the route above — an `image/png` response, consumed by the browser directly (link previews, phase 2) and by `ImageActions`' new `imageUrl` fetch path (Task 6).

- [ ] **Step 1: Write the failing route test**

This is the first test in the repo to invoke a `route.ts` `GET` with dynamic `params` (see `tests/country.test.ts` for the no-params template) against a throwaway Postgres (see `tests/leaders-db.test.ts` for the insert-helper pattern) — no existing shared fixture covers this, so the inserts are written out in full below.

```ts
// tests/performance-card-route.test.ts
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";

let db: TestDb;
let GET: (request: Request, ctx: { params: Promise<{ league: string; id: string; slug: string }> }) => Promise<Response>;

const q = (sql: string, args: unknown[] = []) => db.pool.query(sql, args);

async function seedGame(id: string, completed: boolean, statusDetail = "Final") {
  await q(
    `insert into teams (league, espn_id, name, slug, abbreviation, color) values ('nba','1','Los Angeles Lakers','los-angeles-lakers','LAL','552583'), ('nba','2','Boston Celtics','boston-celtics','BOS','007a33')
     on conflict (league, espn_id) do nothing`,
  );
  await q(
    `insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, season_year, completed, status_detail, home_score, away_score)
     values ('nba', $1, now() - interval '3 hours', 'Lakers vs Celtics', '1', '2', 2025, $2, $3, 110, 108)`,
    [id, completed, statusDetail],
  );
}

async function seedPlayer(slug: string, espnId: string) {
  await q(`insert into players (league, espn_id, team_espn_id, name, slug, position, jersey) values ('nba', $1, '1', 'Luka Dončić', $2, 'G', '77')`, [espnId, slug]);
}

async function seedBoxRow(gameId: string, playerId: string, stats: object) {
  await q(`insert into player_game_stats (league, game_espn_id, player_espn_id, team_espn_id, stats) values ('nba', $1, $2, '1', $3)`, [gameId, playerId, JSON.stringify(stats)]);
}

const NBA_LINE = { box: { MIN: "36", PTS: "34", REB: "11", AST: "9", STL: "2", BLK: "1", TO: "3", FG: "12-19", "3PT": "3-7", FT: "7-8", "+/-": "-4" } };

before(async () => {
  db = await startTestDb();
  ({ GET } = await import("../src/app/[league]/games/[id]/players/[slug]/card/route"));

  await seedGame("g1", true);
  await seedPlayer("luka-doncic", "p1");
  await seedBoxRow("g1", "p1", NBA_LINE);
});

after(async () => {
  await (await import("../src/lib/db")).pool.end();
  await db.stop();
});

test("a real league/game/player triple with a box score returns a PNG", async () => {
  const req = new Request("http://localhost/nba/games/g1/players/luka-doncic/card?format=og");
  const res = await GET(req, { params: Promise.resolve({ league: "nba", id: "g1", slug: "luka-doncic" }) });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "image/png");
  const bytes = new Uint8Array(await res.arrayBuffer());
  // PNG magic number: 89 50 4E 47 0D 0A 1A 0A
  assert.deepEqual([...bytes.slice(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
});

test("format is required to be one of og|portrait|story, else 400", async () => {
  const req = new Request("http://localhost/nba/games/g1/players/luka-doncic/card?format=huge");
  const res = await GET(req, { params: Promise.resolve({ league: "nba", id: "g1", slug: "luka-doncic" }) });
  assert.equal(res.status, 400);
});

test("an unknown game returns 404", async () => {
  const req = new Request("http://localhost/nba/games/nope/players/luka-doncic/card?format=og");
  const res = await GET(req, { params: Promise.resolve({ league: "nba", id: "nope", slug: "luka-doncic" }) });
  assert.equal(res.status, 404);
});

test("an unknown player returns 404", async () => {
  const req = new Request("http://localhost/nba/games/g1/players/nobody/card?format=og");
  const res = await GET(req, { params: Promise.resolve({ league: "nba", id: "g1", slug: "nobody" }) });
  assert.equal(res.status, 404);
});

test("a real player with no box-score row for this game (e.g. did not play) returns 404", async () => {
  await seedPlayer("bench-guy", "p2");
  const req = new Request("http://localhost/nba/games/g1/players/bench-guy/card?format=og");
  const res = await GET(req, { params: Promise.resolve({ league: "nba", id: "g1", slug: "bench-guy" }) });
  assert.equal(res.status, 404);
});

test("a league outside NBA/NFL returns 404 even if the route pattern otherwise matches", async () => {
  const req = new Request("http://localhost/epl/games/g1/players/luka-doncic/card?format=og");
  const res = await GET(req, { params: Promise.resolve({ league: "epl", id: "g1", slug: "luka-doncic" }) });
  assert.equal(res.status, 404);
});

test("a long-final game (more than 2 hours old) gets the day-long cache header", async () => {
  const req = new Request("http://localhost/nba/games/g1/players/luka-doncic/card?format=og");
  const res = await GET(req, { params: Promise.resolve({ league: "nba", id: "g1", slug: "luka-doncic" }) });
  assert.equal(res.headers.get("cache-control"), "public, s-maxage=86400, stale-while-revalidate=604800");
});

test("a game finished less than 2 hours ago gets the short cache header", async () => {
  await seedGame("g2", true);
  await q(`update games set date = now() - interval '30 minutes' where espn_id = 'g2'`);
  await seedBoxRow("g2", "p1", NBA_LINE);
  const req = new Request("http://localhost/nba/games/g2/players/luka-doncic/card?format=og");
  const res = await GET(req, { params: Promise.resolve({ league: "nba", id: "g2", slug: "luka-doncic" }) });
  assert.equal(res.headers.get("cache-control"), "public, s-maxage=300");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test tests/performance-card-route.test.ts`
Expected: FAIL with "Cannot find module '../src/app/[league]/games/[id]/players/[slug]/card/route'"

- [ ] **Step 3: Write the route implementation**

```ts
// src/app/[league]/games/[id]/players/[slug]/card/route.ts
import { ImageResponse } from "next/og";
import { createElement } from "react";
import { isLeague, getGameByEspnId, getPlayerBySlug, getPlayerLog, getPlayerReportedGames, getPlayerEspnSeasons } from "@/lib/queries";
import { buildStagedProfile, playerSport } from "@/lib/playerProfile";
import { performanceLine } from "@/lib/performanceLine";
import { PerformanceCard } from "@/components/PerformanceCard";
import { CARD_FONTS } from "@/lib/cardFont";
import { gameRoundLabel } from "@/lib/stage";
import { formatGameDate } from "@/lib/gameDay";

export const revalidate = 300;

const SIZES: Record<string, { width: number; height: number }> = {
  og: { width: 1200, height: 630 },
  portrait: { width: 1080, height: 1350 },
  story: { width: 1080, height: 1920 },
};

// Phase 1 is NBA and NFL only (design doc, "Phases"): every other league returns 404, the
// same "route can only render pairs that exist" guarantee as the game/player/box-score checks.
const SUPPORTED_LEAGUES = new Set(["nba", "nfl"]);

function notFound() {
  return new Response("Not found", { status: 404 });
}

export async function GET(request: Request, { params }: { params: Promise<{ league: string; id: string; slug: string }> }) {
  const { league, id, slug } = await params;
  const format = new URL(request.url).searchParams.get("format") ?? "og";
  const size = SIZES[format];
  if (!size) return new Response("Bad format", { status: 400 });
  if (!isLeague(league) || !SUPPORTED_LEAGUES.has(league)) return notFound();

  const [game, player] = await Promise.all([getGameByEspnId(league, id), getPlayerBySlug(league, slug)]);
  if (!game || !player) return notFound();

  const sport = playerSport(league);
  const [log, reportedGames, espnSeasons] = await Promise.all([getPlayerLog(league, player.espn_id), getPlayerReportedGames(league, player.espn_id), getPlayerEspnSeasons(league, player.espn_id)]);
  const row = log.find((r) => r.game_espn_id === id);
  // No stat line for this player in this game (a lineman, special-teams-only NFL player, or a
  // player who did not play): the route can only render pairs that exist. Design doc §3.
  if (!row) return notFound();

  const profile = buildStagedProfile(sport, log, reportedGames, espnSeasons).regular;
  const stats = performanceLine(sport, row, profile);

  const isHomeTeam = row.team_espn_id === game.home_team_espn_id;
  const teamColor = isHomeTeam ? game.home_color : game.away_color;

  const element = createElement(PerformanceCard, {
    league,
    playerName: player.name,
    position: player.position ?? null,
    jersey: player.jersey ?? null,
    teamAbbr: row.team_abbr,
    teamColor,
    opponentAbbr: row.opponent_abbr,
    resultLetter: row.result,
    teamScore: row.team_score,
    opponentScore: row.opponent_score,
    date: formatGameDate(game.date, league, { month: "short", day: "numeric", year: "numeric" }),
    stageLabel: gameRoundLabel(game),
    stats,
  });

  const png = new ImageResponse(element, { ...size, fonts: CARD_FONTS });

  // ESPN corrects box scores shortly after a game — a game final for more than 2 hours is
  // treated as settled (day-long cache); anything newer gets a 5-minute cache. Design doc §6.
  const finalOver2Hours = game.completed && Date.now() - new Date(game.date).getTime() > 2 * 60 * 60 * 1000;
  const cacheControl = finalOver2Hours ? "public, s-maxage=86400, stale-while-revalidate=604800" : "public, s-maxage=300";

  const headers = new Headers(png.headers);
  headers.set("cache-control", cacheControl);
  return new Response(png.body, { status: png.status, headers });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx --test tests/performance-card-route.test.ts`
Expected: PASS (all 8 tests).

If the 200-status test fails specifically inside `ImageResponse` rendering (not the DB/lookup logic), the likely cause is a Satori-incompatible element in `PerformanceCard` — most likely the inline `<svg><path>` X/Twitter glyph inside `ExportFooter`. If that happens: read the actual error, confirm it names the `<svg>`/`<path>` element, and only then fall back to replacing that glyph with a plain `@{X_HANDLE}` text span with no icon *inside `PerformanceCard`'s own footer usage* — do not modify `ExportFooter` itself, since every other card on the site depends on its current (working, html-to-image-rendered) form. Report this deviation if it happens; it is not expected (`PixelBall`, used the same way, is plain `<svg><rect>`, which Satori documents support for).

- [ ] **Step 5: Commit**

```bash
git add "src/app/[league]/games/[id]/players/[slug]/card/route.ts" tests/performance-card-route.test.ts
git commit -m "feat: performance-card image route (og/portrait/story formats)"
```

## Task 6: `ImageActions` gains an `imageUrl` fetch-blob path

**Files:**
- Modify: `src/components/ImageActions.tsx`
- Test: `tests/image-actions-props.test.ts`

**Interfaces:**
- Produces: `ImageActions` now accepts an optional `imageUrl?: string`. When set, `card` becomes optional and `render()` fetches `imageUrl` for the blob instead of using `html-to-image` on an offscreen `card` render. Consumed by the game-page share controls (Tasks 7-8).

- [ ] **Step 1: Write the failing test**

This is a structural/props test (the existing component has no unit tests — it's exercised via the page-level tests and manual verification the rest of the codebase relies on for client interactivity); this test only locks in the new prop's type-level contract and the module's static shape so a later change can't silently drop `imageUrl` support.

```ts
// tests/image-actions-props.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("ImageActions accepts an optional imageUrl prop and makes card optional when it's used", () => {
  const src = readFileSync("src/components/ImageActions.tsx", "utf8");
  assert.match(src, /imageUrl\?:\s*string/, "imageUrl must be an optional prop");
  assert.match(src, /card\?:\s*ReactNode/, "card must become optional now that imageUrl is an alternative render source");
});

test("render() fetches imageUrl as a blob when provided, instead of requiring html-to-image", () => {
  const src = readFileSync("src/components/ImageActions.tsx", "utf8");
  assert.match(src, /if\s*\(imageUrl\)/);
  assert.match(src, /fetch\(imageUrl\)/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test tests/image-actions-props.test.ts`
Expected: FAIL (both assertions) — the prop and fetch branch don't exist yet.

- [ ] **Step 3: Modify `ImageActions.tsx`**

Change the props signature (was: `{ filename, card, width = 720, shareTitle }: { filename: string; card: ReactNode; width?: number; shareTitle: string }`):

```tsx
export function ImageActions({ filename, card, imageUrl, width = 720, shareTitle }: { filename: string; card?: ReactNode; imageUrl?: string; width?: number; shareTitle: string }) {
```

Change `render()` (was the `html-to-image` version at lines 29-35) to branch on `imageUrl`:

```tsx
const render = async (): Promise<Blob> => {
  if (imageUrl) {
    const res = await fetch(imageUrl);
    if (!res.ok) throw new Error("render failed");
    return res.blob();
  }
  // Loaded on the first click rather than shipped with every page that has a share button.
  const { toBlob } = await import("html-to-image");
  const blob = ref.current ? await toBlob(ref.current, { pixelRatio: 2, cacheBust: true, backgroundColor: CARD.bg }) : null;
  if (!blob) throw new Error("render failed");
  return blob;
};
```

Guard the offscreen preview render (the fixed-position div that captures `card` via `html-to-image`) so it's skipped when there's no `card` to render:

```tsx
{card && (
  <div style={{ position: "fixed", top: 0, left: -99999, pointerEvents: "none" }}>
    <div ref={ref} style={{ width, background: CARD.bg, padding: 20, fontFamily: CARD_FONT }}>
      {card}
    </div>
  </div>
)}
```

(Leave everything else in the file — the two button pills, the share/download handlers' bodies, the busy/copied state — unchanged; `render()` is the only function whose *output source* changes, not its callers.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx --test tests/image-actions-props.test.ts`
Expected: PASS (both tests)

Then run the full suite once to confirm the two existing call sites (`src/app/[league]/records/page.tsx`, `src/app/[league]/h2h/[pair]/page.tsx`), which pass `card` and no `imageUrl`, still type-check and behave unchanged:

Run: `npm run build 2>&1 | tail -40` (a full `next build` is the cheapest way to type-check every `ImageActions` call site at once; a partial `tsc --noEmit` would also work if the repo has that script — check `package.json` first)
Expected: build succeeds with no new type errors referencing `ImageActions`.

- [ ] **Step 5: Commit**

```bash
git add src/components/ImageActions.tsx tests/image-actions-props.test.ts
git commit -m "feat: ImageActions accepts a pre-rendered imageUrl (fetch-blob) alongside its html-to-image path"
```

## Task 7: "Share card" on the game page's top-performer block

**Files:**
- Modify: `src/app/[league]/games/[id]/page.tsx`

**Interfaces:**
- Consumes: `ImageActions` (Task 6, `imageUrl` prop), `MatchLeaders`/`MatchLeader` (existing), `absoluteUrl` from `src/lib/site.ts`.

- [ ] **Step 1: Locate the existing top-performer section and confirm current props**

Re-read `src/app/[league]/games/[id]/page.tsx` around the `MatchLeaders` section (the `Game leaders` section header, currently ~line 265-270) immediately before editing, since it's shared context other tasks in this plan also touched conceptually (game id, league, playerSlugs are already in scope there per the research: `league`, `id`, `playerSlugs: Map<string, string>`, `leaders: MatchLeader[]`).

- [ ] **Step 2: Add one "Share card" control per game leader with a resolvable player slug**

`MatchLeaders` itself is a presentational list; rather than threading per-row share affordances through it (which would touch its existing, unrelated tests/consumers), add a small row of per-leader share buttons directly in `page.tsx`, next to the existing `MatchLeaders` block, keyed by the same `leaders`/`playerSlugs` data already fetched there:

```tsx
{leaders.length > 0 && (
  <section>
    <SectionHeader tools={<ImageActions filename={`${id}-leaders-${league}`} width={860} shareTitle={`${matchName} game leaders`} card={<MatchLeadersExportCard league={league} game={game} leaders={leaders} />} />}>Game leaders</SectionHeader>
    <MatchLeaders league={league} game={game} leaders={leaders} playerSlugs={playerSlugs} />
    {(league === "nba" || league === "nfl") && (
      <div className="mt-2 flex flex-wrap gap-2">
        {leaders.map((l) => {
          const slug = playerSlugs.get(l.athlete_id);
          if (!slug) return null;
          return (
            <ImageActions
              key={l.athlete_id}
              filename={`${id}-${slug}-card-${league}`}
              imageUrl={`/${league}/games/${id}/players/${slug}/card?format=og`}
              shareTitle={`${l.athlete} performance card`}
            />
          );
        })}
      </div>
    )}
  </section>
)}
```

The `(league === "nba" || league === "nfl")` guard mirrors the route's own 404 for unsupported leagues (Task 5, Global Constraints) — this avoids rendering share buttons that would 404, for soccer/cricket game pages, without needing a new capability check helper.

- [ ] **Step 3: Manual verification (no DB access locally — see Task 10 for the full live check)**

This task's own correctness (does the button render, does the URL shape match the route) is folded into Task 10's end-to-end browser pass, since it needs a live game with real leaders data to exercise meaningfully — a synthetic unit test here would just re-assert the JSX above without adding confidence beyond what Task 10's browser check already gives.

- [ ] **Step 4: Commit**

```bash
git add "src/app/[league]/games/[id]/page.tsx"
git commit -m "feat: share-card control on the game page's top-performer block"
```

## Task 8: "Share card" on each NBA/NFL box-score row

**Files:**
- Modify: `src/components/PlayerBoxScoreTable.tsx`
- Modify: `src/app/[league]/games/[id]/page.tsx`

**Interfaces:**
- Consumes: `ImageActions` (Task 6).
- Produces: `PlayerBoxScoreTable` gains a required `gameId: string` prop (the game's espn id, needed to build the card URL — not previously threaded into this component per the research findings).

- [ ] **Step 1: Add `gameId` to `PlayerBoxScoreTable`'s props**

Change the signature (was: `{ league, team, playerSlugs }: { league: League; team: TeamPlayerBox; playerSlugs: Map<string, string> }`):

```tsx
export function PlayerBoxScoreTable({
  league,
  gameId,
  team,
  playerSlugs,
}: {
  league: League;
  gameId: string;
  team: TeamPlayerBox;
  playerSlugs: Map<string, string>;
}) {
```

- [ ] **Step 2: Add a per-row share control next to the existing player-name link**

The row cell today (see research, lines ~44-51) is:

```tsx
<td className="py-2 pl-4 font-medium">
  {slug ? (
    <Link href={`/${league}/players/${slug}`} className="hover:underline">
      {row.name}
    </Link>
  ) : (
    row.name
  )}
</td>
```

Change it to also render the share control when a slug resolves and the league is NBA/NFL (this component is also used for soccer, which the card route does not support — Task 5's `SUPPORTED_LEAGUES` guard):

```tsx
<td className="py-2 pl-4 font-medium">
  <div className="flex items-center gap-2">
    {slug ? (
      <Link href={`/${league}/players/${slug}`} className="hover:underline">
        {row.name}
      </Link>
    ) : (
      row.name
    )}
    {slug && (league === "nba" || league === "nfl") && (
      <ImageActions filename={`${gameId}-${slug}-card-${league}`} imageUrl={`/${league}/games/${gameId}/players/${slug}/card?format=og`} shareTitle={`${row.name} performance card`} />
    )}
  </div>
</td>
```

Add the import at the top of the file: `import { ImageActions } from "./ImageActions";`

- [ ] **Step 3: Pass `gameId` from the call site**

In `src/app/[league]/games/[id]/page.tsx`, the existing call site (research, lines 297-303) is:

```tsx
{playerBox.map((team) => (
  <PlayerBoxScoreTable key={team.teamId} league={league} team={team} playerSlugs={playerSlugs} />
))}
```

Change to:

```tsx
{playerBox.map((team) => (
  <PlayerBoxScoreTable key={team.teamId} league={league} gameId={id} team={team} playerSlugs={playerSlugs} />
))}
```

- [ ] **Step 4: Type-check**

Run: `npm run build 2>&1 | tail -40`
Expected: build succeeds. If it fails on a different `PlayerBoxScoreTable` call site not covered above, that call site was missed by the earlier research — find it (`grep -rn "PlayerBoxScoreTable" src/`) and add the `gameId` prop there too before proceeding.

- [ ] **Step 5: Commit**

```bash
git add src/components/PlayerBoxScoreTable.tsx "src/app/[league]/games/[id]/page.tsx"
git commit -m "feat: share-card control on each NBA/NFL box-score row"
```

## Task 9: `share_card` GA event

**Files:**
- Modify: `src/components/ImageActions.tsx`

**Interfaces:**
- Produces: fires `window.gtag?.("event", "share_card", { league, format, action })` once per share/download/copy, using the existing `window.gtag?.(...)` call pattern from `src/components/GoogleAnalytics.tsx:65`.

- [ ] **Step 1: Parse `league` and `format` out of `imageUrl` for the event**

Rather than adding two more props (every call site would need updating again), derive them from `imageUrl` itself, since its shape is always `/${league}/games/.../card?format=...` per Task 5's route — this keeps Tasks 7-8's call sites untouched:

```tsx
function cardAnalytics(imageUrl: string | undefined): { league: string; format: string } | null {
  if (!imageUrl) return null;
  const m = imageUrl.match(/^\/(\w+)\/games\/.+\/card\?format=(\w+)/);
  return m ? { league: m[1], format: m[2] } : null;
}
```

- [ ] **Step 2: Fire the event from `download()` and `share()`**

In `download()`, right after a successful `save(await render())` (the existing try body):

```tsx
async function download() {
  if (busy) return;
  setBusy("download");
  try {
    save(await render());
    const analytics = cardAnalytics(imageUrl);
    if (analytics) window.gtag?.("event", "share_card", { ...analytics, action: "download" });
  } catch {
    /* a blocked cross-origin asset can fail the canvas export; the page still works */
  } finally {
    setBusy(null);
  }
}
```

In `share()`, after each successful branch (native share succeeds, or falls back to `save`; clipboard write succeeds; final `save` fallback) — the three success points in the existing function body:

```tsx
async function share() {
  if (busy) return;
  setBusy("share");
  const analytics = cardAnalytics(imageUrl);
  try {
    const probe = new File([], `${filename}.png`, { type: "image/png" });
    if (navigator.canShare?.({ files: [probe] })) {
      const blob = await render();
      try {
        await navigator.share({ files: [new File([blob], `${filename}.png`, { type: "image/png" })], title: shareTitle });
        if (analytics) window.gtag?.("event", "share_card", { ...analytics, action: "share" });
      } catch (e) {
        if ((e as DOMException).name !== "AbortError") {
          save(blob);
          if (analytics) window.gtag?.("event", "share_card", { ...analytics, action: "download" });
        }
      }
    } else if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": render() })]);
      setCopied(true);
      if (analytics) window.gtag?.("event", "share_card", { ...analytics, action: "copy" });
      window.setTimeout(() => setCopied(false), 2500);
    } else {
      save(await render());
      if (analytics) window.gtag?.("event", "share_card", { ...analytics, action: "download" });
    }
  } catch {
    /* clipboard or share refused: nothing was sent, and Download image is right beside it */
  } finally {
    setBusy(null);
  }
}
```

Note: `cardAnalytics(imageUrl)` returns `null` for every existing (non-card) `ImageActions` usage — those call sites pass `card`, not `imageUrl` — so this is additive and fires zero events for the site's other ~30 existing export buttons.

- [ ] **Step 3: Type-check**

Run: `npm run build 2>&1 | tail -40`
Expected: build succeeds. `window.gtag` is already typed as optional in `GoogleAnalytics.tsx:12` (`gtag?: (...args: unknown[]) => void`) on `Window` — confirm that type augmentation is global (not scoped to that one file) before assuming `window.gtag?.(...)` type-checks here; if it's file-scoped, add the same `declare global { interface Window { gtag?: ... } }` block (copy its exact shape) to `ImageActions.tsx`.

- [ ] **Step 4: Commit**

```bash
git add src/components/ImageActions.tsx
git commit -m "feat: share_card GA event on download, share and copy"
```

## Task 10: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: every test passes, including all new tests from Tasks 1-6 and the full pre-existing suite (no regressions).

- [ ] **Step 2: Type-check and build**

Run: `npm run build 2>&1 | tail -60`
Expected: clean build, no type errors.

- [ ] **Step 3: Live browser verification**

The local dev server cannot reach the production database (port 5432 is closed to the public internet per prior security hardening — this is expected, not a regression to fix). This step therefore runs against whichever environment the DB is reachable from at plan-execution time (most likely: after deploying to the VM, the same pattern used for the Phase B HTML-slimming ship). For each of these, capture a screenshot or the response headers as evidence, not just a visual glance:

1. `GET /nba/games/<a-real-recent-game-id>/players/<a-real-player-slug>/card?format=og` directly in the browser — confirm a PNG renders, the player's name is correct, stats match that game's actual box score (cross-check against the game page itself), and the footer matches the site's other export cards.
2. Same URL with `?format=portrait` and `?format=story` — confirm the layout doesn't clip or overflow at the taller aspect ratios (the component test suite only checks content, not visual layout at all three sizes).
3. A player with a diacritic name (Dončić, Jokić, Vučević, Şengün, or another available in the live data) at `format=og` — zoom in on the name and confirm every diacritic mark renders (this is the one thing the `renderToStaticMarkup`-based component tests from Task 4 cannot catch, since they don't exercise Satori/the real font file).
4. An NFL quarterback and an NFL running back — confirm each gets its own position-appropriate stat set (passing vs rushing), proving `performanceLine`'s reuse of `buildProfile`'s active-category detection works end to end, not just in the synthetic Task 3 fixtures.
5. On an actual game page: the "Share card" button next to a top performer and next to a box-score row — click "Download image" and confirm a real PNG downloads (desktop) or, on a phone/mobile emulation, that "Share image" opens the native share sheet with the image attached.
6. Response headers on a card for a game finished well over 2 hours ago: confirm `Cache-Control: public, s-maxage=86400, stale-while-revalidate=604800`. On a very recently finished game (if one is available at test time): confirm `public, s-maxage=300`.
7. A malformed request: `?format=xlarge` → 400; a nonexistent player slug → 404; a lineman or special-teams-only NFL player (a real one from a live game, if identifiable) → 404.

- [ ] **Step 4: Report results and update the durable memory note**

Once Step 3 passes, update `production-hosting.md` in the memory directory (the same file the Phase B HTML-slimming ship was recorded in) with what shipped, the commit, and the live-verification evidence — following the same pattern already used for that entry, so future sessions have the same level of confidence about this feature's shipped state without re-reading this plan.
