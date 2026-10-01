# Build Your Homepage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a visitor build their own SportsDB homepage out of blocks, pre-filled for their country, saved in the browser and carried to another device by link; and move the brand mark to the "lit block" on the header, icons and share images.

**Architecture:** The homepage HTML stays one edge-cached document. A client component reads a saved setup from `localStorage` and replaces the hero with the built state and a grid of blocks, each fetched from one cacheable route `/api/block/<type>?…` whose URL fully describes the block. A pre-paint script marks the document so returning visitors never see the builder flash. Pure libraries (`editions`, `homeSetup`, `homeHeroLine`, `blockParams`) carry the logic and are unit-tested; React components stay thin.

**Tech Stack:** Next.js 16.3.5 App Router (ISR homepage, route handlers, `next/og` image routes), React 19, Tailwind 4 with the site's CSS tokens, Postgres via `pg`, tests with `node:test` through `tsx` (`npm test`), embedded Postgres for route tests (`tests/helpers/testDb.ts`).

**Spec:** `docs/superpowers/specs/2026-10-01-build-your-homepage-design.md`

## Global Constraints

- Work only in the worktree `/Users/ps/Claude/sports-stats-site/worktrees/build-your-homepage` on branch `feat/build-your-homepage`. Never touch the `app/` checkout or switch its branch (it belongs to another session). The worktree has no `node_modules`: run `npm ci` there before Task 1.
- `AGENTS.md`: before writing any Next.js code, read the relevant guide under `node_modules/next/dist/docs/` (route handlers, `use client`, metadata image routes). This Next version differs from training data.
- The homepage must stay ISR (`revalidate = 10`) and must never read a cookie or header to render. All personalisation is client-side.
- Every block fetch is a GET whose URL fully describes the block, with `Cache-Control: public, s-maxage=<per type>, stale-while-revalidate=<4×>`. Lifetimes: live 30, team-next 60, standings 900, series-standings 900, player-form 900, f1-drivers 3600, bts 3600 seconds.
- No photos. New components use tokens only: `var(--sig)`, `var(--sig-ink)`, `var(--sig-soft)`, `var(--sig-on)`, `var(--mast)`, `var(--mast-text)`, `var(--mast-muted)`, `var(--mast-line)`, `var(--surface)`, `var(--border)`, `var(--text)`, `var(--text-muted)`, the `.display`, `.eyebrow`, `.card`, `.pill`, `.pill-live`, `.live-dot`, `.band`, `.band-hero`, `.bleed` classes.
- Copy is verbatim from the spec's "Copy" table. Block names use plain words and a colon ("Kohli: last five"), never a middle dot.
- Storage key `sportsdb-home`, event `sportsdb:home-changed`, at most 12 blocks, setup version `v: 1`.
- Every write button shows visible success feedback ("Added", "Link copied") for two seconds.
- Tests are `node:test` files in `tests/*.test.ts` run by `npm test` (`tsx --test tests/*.test.ts`). Run a single file with `npx tsx --test tests/<file>.test.ts`.
- Commit after every task with a message ending in `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Do not commit the `AGENTS.md` block changes `next dev` makes unless they are already in the diff.
- No new dependencies.

## File map

| File | Responsibility |
|---|---|
| `src/components/Logo.tsx` | The lit-block mark (`PixelBall`, `LogoMark`) and the Barlow `Wordmark` |
| `src/app/logo-512.png/route.tsx` | The 512px brand PNG, generated (replaces `public/logo-512.png`) |
| `src/lib/exportTheme.ts` | The downloadable cards' fixed light palette, mirroring the site's light tokens, and the display face |
| `src/lib/cardFont.ts` | + Barlow Condensed ExtraBold for the server-rendered player card |
| `src/components/ExportFooter.tsx` | The navy brand band every downloadable card ends with, and `ExportWordmark` |
| `src/components/PerformanceCard.tsx` | The server-rendered NBA/NFL player card, same band and faces in Satori's subset |
| `src/lib/blockTypes.ts` | Block type names, `HomeBlock`, `blockId`, and every block's payload type (shared by server and client, no DB imports) |
| `src/lib/blockParams.ts` | Parameter validation per type and the cache lifetime table (pure) |
| `src/lib/editions.ts` | Country → edition, starting blocks, edition copy (pure) |
| `src/lib/editionContext.ts` | Server: the cricket sides and featured series the editions need, cached 15 min |
| `src/lib/homeSetup.ts` | Setup schema, parse/validate, storage read/write, encode/decode for the transfer link, pure list edits |
| `src/lib/homeHeroLine.ts` | The built hero's two generated lines (pure) |
| `src/lib/followBlocks.ts` | Follow item or search result → block (pure) |
| `src/lib/blockCatalogue.ts` | The add palette groups (pure, takes the edition context) |
| `src/lib/blockLoaders.ts` | Server: `loadBlock(type, params)` using the existing query layer |
| `src/lib/queries.ts` | + `getCricketRecentInnings` |
| `src/app/api/block/[type]/route.ts` | The block route handler |
| `src/app/api/region/route.ts` | + `country` in the response |
| `src/components/home/useBlocksData.ts` | Client hook: fetch every block of a setup, retry, live refresh |
| `src/components/home/BlockFrame.tsx` | One block's chrome: handle, title, tag, remove, move buttons |
| `src/components/home/blocks/*.tsx` | One renderer per block type |
| `src/components/home/BlockPalette.tsx` | Add palette with groups and search |
| `src/components/home/HomeBuilder.tsx` | First-visit builder and the edit card |
| `src/components/home/BuiltHero.tsx` | The built state's hero band |
| `src/components/home/HomeBlocks.tsx` | Built state: reads setup, owns block order, drag reorder, add/remove, transfer link import |
| `src/components/home/CollapsedBar.tsx` | The one-line bar after "I'll decide later" |
| `src/components/home/SendToPhone.tsx` | The transfer-link button |
| `src/components/AddToHomepageButton.tsx` | "Add to my homepage" beside `FollowButton` |

---

### Task 1: The lit-block mark, wordmark, icons and share images

**Files:**
- Modify: `src/components/Logo.tsx` (whole file)
- Modify: `src/components/Nav.tsx:20-24`, `src/components/Footer.tsx:39-42`
- Modify: `src/app/icon.tsx`, `src/app/apple-icon.tsx`, `src/app/opengraph-image.tsx:20-27`, `src/app/beyond-the-scoreline/[slug]/opengraph-image.tsx:66`, `src/app/[league]/teams/[slug]/opengraph-image.tsx:60`, `src/app/[league]/games/[id]/opengraph-image.tsx:95`, `src/app/f1/events/[id]/opengraph-image.tsx:44`
- Create: `src/app/logo-512.png/route.tsx`
- Delete: `src/app/favicon.ico`, `public/logo-512.png`
- Test: `tests/logo.test.ts`

**Interfaces:**
- Produces: `PixelBall(props: { size: number; fill: string; live: string; background?: string; backgroundRadius?: number; inset?: number })`, `LogoMark({ size?: number })`, `Wordmark({ size?: number; className?: string })` from `@/components/Logo`.

- [ ] **Step 1: Install dependencies in the worktree and confirm the suite runs**

Run:
```bash
cd /Users/ps/Claude/sports-stats-site/worktrees/build-your-homepage && npm ci && npm test 2>&1 | tail -5
```
Expected: the last lines report `# pass N` and `# fail 0`.

- [ ] **Step 2: Write the failing test**

Create `tests/logo.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PixelBall, Wordmark } from "../src/components/Logo";

test("the mark is four blocks and only the top-right one is lit", () => {
  const html = renderToStaticMarkup(createElement(PixelBall, { size: 40, fill: "#ffffff", live: "#c6f135" }));
  assert.equal((html.match(/<rect /g) ?? []).length, 4);
  assert.match(html, /x="21" y="7" width="12" height="12" rx="3" fill="#c6f135"/);
  assert.equal((html.match(/#c6f135/g) ?? []).length, 1);
});

test("a background draws a tile behind an inset mark", () => {
  const html = renderToStaticMarkup(createElement(PixelBall, { size: 64, fill: "#ffffff", live: "#c6f135", background: "#0b1324", inset: 0.72 }));
  assert.equal((html.match(/<rect /g) ?? []).length, 5);
  assert.match(html, /<rect width="40" height="40" rx="8.8" fill="#0b1324"/);
  assert.match(html, /scale\(0.72\)/);
});

test("the wordmark sets DB in the signature colour", () => {
  const html = renderToStaticMarkup(createElement(Wordmark, {}));
  assert.match(html, /Sports<span class="text-\[var\(--sig\)\]">DB<\/span>/);
  assert.match(html, /class="display/);
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx tsx --test tests/logo.test.ts`
Expected: FAIL. The first test fails on the rect count (the old ball has 21 cells) and the third fails because `Wordmark` is not exported.

- [ ] **Step 4: Replace `src/components/Logo.tsx`**

```tsx
// The SportsDB mark: four blocks on a 2×2 grid with the top-right one lit in the live
// colour. It is the picture of the homepage (your blocks, one of them live) and the same
// geometry serves the header, the favicon and app icon, the 512px logo and the share
// images, so the brand is one shape everywhere.

const GRID = 40;
// Block positions as [x, y] in the 40-unit box. Index 1 (top right) is the lit one.
const CELLS: [number, number][] = [
  [7, 7],
  [21, 7],
  [7, 21],
  [21, 21],
];
const LIT = 1;
const SIDE = 12;
const RADIUS = 3;

export interface PixelBallProps {
  size: number;
  /** Colour of the three unlit blocks; the lit block takes `live`. Plain colours, so it also renders in share images. */
  fill: string;
  live: string;
  /** Optional square tile behind the mark (app icon, share image, logo PNG). */
  background?: string;
  backgroundRadius?: number;
  /** Fraction of the box the mark occupies when a tile is drawn. */
  inset?: number;
}

/** The mark as plain SVG, colours given explicitly. Use LogoMark in the page chrome. */
export function PixelBall({ size, fill, live, background, backgroundRadius = 0.22, inset = 0.6 }: PixelBallProps) {
  const scale = background ? inset : 1;
  const offset = ((1 - scale) * GRID) / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${GRID} ${GRID}`} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {background && <rect width={GRID} height={GRID} rx={GRID * backgroundRadius} fill={background} />}
      <g transform={`translate(${offset} ${offset}) scale(${scale})`}>
        {CELLS.map(([x, y], i) => (
          <rect key={`${x}-${y}`} x={x} y={y} width={SIDE} height={SIDE} rx={RADIUS} fill={i === LIT ? live : fill} />
        ))}
      </g>
    </svg>
  );
}

/** The mark in the page's own colours: blocks in the surrounding text colour, the lit one in Volt. */
export function LogoMark({ size = 30 }: { size?: number }) {
  return <PixelBall size={size} fill="currentColor" live="var(--sig)" />;
}

/** "SPORTSDB" in the display face, DB in Volt. Inherits the surrounding text colour for "Sports". */
export function Wordmark({ size = 26, className = "" }: { size?: number; className?: string }) {
  return (
    <span className={`display leading-none tracking-[0.01em] ${className}`} style={{ fontSize: size }}>
      Sports<span className="text-[var(--sig)]">DB</span>
    </span>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx tsx --test tests/logo.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 6: Put the wordmark in the header and footer**

In `src/components/Nav.tsx` change the import and the brand link:

```tsx
import { LogoMark, Wordmark } from "./Logo";
```
```tsx
        <Link href="/" className="mr-3 flex shrink-0 items-center gap-2.5 text-[var(--mast-text)]" aria-label="SportsDB home">
          <LogoMark size={30} />
          <Wordmark size={26} />
        </Link>
```

In `src/components/Footer.tsx` change the import and the brand link:

```tsx
import { LogoMark, Wordmark } from "./Logo";
```
```tsx
          <Link href="/" className="flex items-center gap-2 text-[var(--mast-text)]">
            <LogoMark size={26} />
            <Wordmark size={22} />
          </Link>
```

- [ ] **Step 7: Move the icons and share images onto navy and Volt**

First swap the share images' old blue-grey palette for the masthead tokens in one pass (background, text, muted text, the blue link colour becomes Volt):

```bash
cd /Users/ps/Claude/sports-stats-site/worktrees/build-your-homepage && sed -i '' \
  -e 's/#0b1220/#0b1324/g' -e 's/#16223a/#121c33/g' -e 's/#e8edf6/#eef1f7/g' -e 's/#9aa7bd/#9aa5bd/g' \
  -e 's/#6b788f/#6b7890/g' -e 's/#233047/#1b2640/g' -e 's/#6ea0ff/#c6f135/g' \
  src/app/opengraph-image.tsx "src/app/[league]/games/[id]/opengraph-image.tsx" \
  "src/app/[league]/teams/[slug]/opengraph-image.tsx" "src/app/f1/events/[id]/opengraph-image.tsx" \
  "src/app/[league]/games/[id]/players/[slug]/opengraph-image.tsx" && git diff --stat
```
Expected: five files changed. Then make the edits below by hand (the mark lines still carry the old rose `#f87171` until you replace them).

`src/app/icon.tsx`, replace the element and the comment:

```tsx
import { ImageResponse } from "next/og";
import { PixelBall } from "@/components/Logo";

// Browser-tab icon: the mark on the navy masthead tile so it stays legible at 16px on
// any tab-strip colour.
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <PixelBall size={64} fill="#ffffff" live="#c6f135" background="#0b1324" backgroundRadius={0.22} inset={0.72} />,
    size
  );
}
```

`src/app/apple-icon.tsx`:

```tsx
import { ImageResponse } from "next/og";
import { PixelBall } from "@/components/Logo";

// Home-screen icon. iOS rounds the corners itself, so the tile is square here.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <PixelBall size={180} fill="#ffffff" live="#c6f135" background="#0b1324" backgroundRadius={0} inset={0.66} />,
    size
  );
}
```

`src/app/opengraph-image.tsx`: change the gradient and the mark line:

```tsx
          background: "linear-gradient(135deg, #0b1324 0%, #121c33 100%)",
          color: "#eef1f7",
```
```tsx
          <PixelBall size={64} fill="#ffffff" live="#c6f135" />
```

In the other four share images replace the `PixelBall` line, keeping each file's `size`:

- `src/app/beyond-the-scoreline/[slug]/opengraph-image.tsx:66` → `<PixelBall size={24} fill="#ffffff" live="#c6f135" />`
- `src/app/[league]/teams/[slug]/opengraph-image.tsx:60` → `<PixelBall size={26} fill="#ffffff" live="#c6f135" />`
- `src/app/[league]/games/[id]/opengraph-image.tsx:95` → `<PixelBall size={28} fill="#ffffff" live="#c6f135" />`
- `src/app/f1/events/[id]/opengraph-image.tsx:44` → `<PixelBall size={28} fill="#ffffff" live="#c6f135" />`

`ExportFooter.tsx` and `PerformanceCard.tsx` read their own card palette; Task 1B moves them.

- [ ] **Step 8: Generate the 512px logo from the same geometry**

Create `src/app/logo-512.png/route.tsx`:

```tsx
import { ImageResponse } from "next/og";
import { PixelBall } from "@/components/Logo";

// The brand PNG that the Organization structured data points at (lib/structuredData.ts).
// Generated from the mark's own geometry so it can never drift from the header.
export const dynamic = "force-static";

export function GET() {
  return new ImageResponse(
    <PixelBall size={512} fill="#ffffff" live="#c6f135" background="#0b1324" backgroundRadius={0.2} inset={0.66} />,
    { width: 512, height: 512 }
  );
}
```

Then delete the two static files so the generated ones are the only ones:

```bash
git rm -q public/logo-512.png src/app/favicon.ico
```

- [ ] **Step 9: Check types, lint and the build**

Run: `npx tsc --noEmit && npm run lint && npm run build 2>&1 | tail -15`
Expected: no type errors, no lint errors, build succeeds and the route list includes `/logo-512.png`, `/icon` and `/apple-icon`.

- [ ] **Step 10: Look at the icons**

Add a dev-server entry for this worktree if `.claude/launch.json` lacks one:

```json
{
  "version": "0.0.1",
  "configurations": [
    { "name": "home-builder", "runtimeExecutable": "npm", "runtimeArgs": ["run", "dev", "--", "-p", "3011"], "port": 3011 }
  ]
}
```

Start it with `preview_start {name: "home-builder"}` and open `http://localhost:3011/icon`, `/apple-icon`, `/logo-512.png` and `/opengraph-image`. Each shows four rounded blocks, the top-right in Volt, on a navy tile; the header shows the mark then "SPORTSDB" in Barlow Condensed with DB in Volt. Take a screenshot of the header for the task record.

- [ ] **Step 11: Commit**

```bash
git add -A && git commit -m "Move the brand to the lit-block mark on navy and Volt

Four blocks, one lit, replace the 5×5 pixel ball in the header, the tab and
home-screen icons, the generated 512px logo and the five share images. The
wordmark is set in Barlow Condensed with DB in Volt.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 1B: The downloadable cards and the player card on the new brand

Every "Share image / Download image" button on the site (`ImageActions`, 38 pages) renders one of 28 card components off-screen in a fixed light palette and captures it with `html-to-image`; the NBA/NFL player card (`PerformanceCard`) is instead drawn on the server by `next/og` (Satori) for the `/card` route and the player share image. All of them read colours from one file, `src/lib/exportTheme.ts`, and end with `ExportFooter` (or the card's Satori-safe mirror of it). This task moves that palette to the site's light tokens, sets titles and scores in Barlow Condensed, and turns the footer into the navy masthead band with the lit block and the wordmark.

**Files:**
- Modify: `src/lib/exportTheme.ts` (whole file), `src/lib/cardFont.ts` (whole file), `src/components/ExportFooter.tsx` (whole file), `src/components/PerformanceCard.tsx` (whole file)
- Modify: `src/components/ExportShell.tsx:9-11,32`, `src/components/ExportTeamLine.tsx:36`, `src/components/StandingsExportCard.tsx:13`
- Create: `assets/fonts/BarlowCondensed-ExtraBold.ttf` (downloaded, OFL licence), `tests/export-theme.test.ts`
- Test: `tests/export-theme.test.ts`, `tests/performance-card.test.ts:52-56`, `tests/card-font.test.ts:5-16`

**Interfaces:**
- Consumes: `PixelBall` from Task 1 (`fill`, `live` as plain colours).
- Produces: `CARD` gains `sig`, `mast`, `mastText`, `mastMuted`; new export `CARD_DISPLAY_FONT: string`; `ExportFooter({ context, inset = 24, radius = 16 })`; `ExportWordmark({ size = 18 })` from `@/components/ExportFooter`; `CARD_FONTS` has a third entry `{ name: "Barlow Condensed", weight: 800 }`.

- [ ] **Step 1: Vendor the display face for the server-rendered card**

Satori cannot use the font `next/font` serves to the browser (woff2, loaded at build time), so the player card needs its own TTF. Barlow Condensed is published under the SIL Open Font License, so a copy can live in the repo beside the two Inter subsets.

Run:
```bash
cd /Users/ps/Claude/sports-stats-site/worktrees/build-your-homepage && curl -fsSL -o assets/fonts/BarlowCondensed-ExtraBold.ttf "https://github.com/google/fonts/raw/main/ofl/barlowcondensed/BarlowCondensed-ExtraBold.ttf" && ls -l assets/fonts && file assets/fonts/BarlowCondensed-ExtraBold.ttf
```
Expected: three `.ttf` files; the new one reports `TrueType Font data` and is under 120 KB.

- [ ] **Step 2: Write the failing tests**

Create `tests/export-theme.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CARD, CARD_DISPLAY_FONT } from "../src/lib/exportTheme";
import { ExportFooter } from "../src/components/ExportFooter";
import { SITE_URL } from "../src/lib/site";

// The light-theme tokens from globals.css, name → value, read from the first `:root {` block.
function lightTokens(): Record<string, string> {
  const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
  const start = css.indexOf(":root {");
  const block = css.slice(start, css.indexOf("}", start));
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

test("the card palette mirrors the site's light tokens", () => {
  const t = lightTokens();
  assert.equal(CARD.bg, t.bg);
  assert.equal(CARD.surface, t.surface);
  assert.equal(CARD.border, t.border);
  assert.equal(CARD.text, t.text);
  assert.equal(CARD.textMuted, t["text-muted"]);
  assert.equal(CARD.textFaint, t["text-faint"]);
  assert.equal(CARD.accent, t["sig-ink"]);
  assert.equal(CARD.accentSoft, t["sig-soft"]);
  assert.equal(CARD.sig, t.sig);
  assert.equal(CARD.mast, t.mast);
  assert.equal(CARD.mastText, t["mast-text"]);
  assert.equal(CARD.mastMuted, t["mast-muted"]);
  assert.equal(CARD.win, t.win);
  assert.equal(CARD.loss, t.loss);
});

test("the display face is Barlow Condensed through the page's font variable", () => {
  assert.match(CARD_DISPLAY_FONT, /^var\(--font-barlow\), "Barlow Condensed"/);
});

test("the footer is the navy band with the lit block, the wordmark and the domain", () => {
  const html = renderToStaticMarkup(createElement(ExportFooter, { context: "Test card" }));
  assert.match(html, /background:#0b1324/);
  assert.equal((html.match(/<rect /g) ?? []).length, 4);
  assert.match(html, /x="21" y="7" width="12" height="12" rx="3" fill="#c6f135"/);
  assert.match(html, /Sports<span style="color:#c6f135">DB<\/span>/);
  assert.ok(html.includes(SITE_URL.replace(/^https?:\/\//, "")));
  assert.ok(html.includes("Test card"));
  assert.ok(!html.includes("#1d4ed8"), "the old blue is gone");
});
```

In `tests/performance-card.test.ts` replace the last test (lines 52-56) with:

```ts
test("footer parity: ends with the same navy band, wordmark and handle every other card on the site uses", () => {
  const html = renderToStaticMarkup(createElement(PerformanceCard, baseProps));
  assert.match(html, /Sports<\/span><span style="color:#c6f135">DB<\/span>/);
  assert.match(html, /background:#0b1324/);
  assert.ok(html.includes("sportsdblive")); // X_HANDLE
  assert.ok(!html.includes("#1d4ed8"), "the old blue is gone");
});
```

In `tests/card-font.test.ts` replace the first test (lines 5-16) with:

```ts
test("the card font bundle has regular and bold Inter plus the display face, well under the ImageResponse 500KB ceiling", () => {
  assert.equal(CARD_FONTS.length, 3);
  const weights = CARD_FONTS.map((f) => f.weight).sort();
  assert.deepEqual(weights, [400, 700, 800]);
  for (const f of CARD_FONTS) {
    assert.equal(f.name, f.weight === 800 ? "Barlow Condensed" : "Inter");
    assert.equal(f.style, "normal");
    assert.ok(f.data.byteLength > 0, "font file must not be empty");
  }
  const total = CARD_FONTS.reduce((sum, f) => sum + f.data.byteLength, 0);
  assert.ok(total < 300_000, `combined font size ${total} bytes is too large for a 500KB ImageResponse budget shared with JSX/CSS`);
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx tsx --test tests/export-theme.test.ts tests/performance-card.test.ts tests/card-font.test.ts`
Expected: FAIL. The palette test fails on `CARD.accent` (`#1d4ed8` is not `#4d7c0f`), `CARD_DISPLAY_FONT` and `CARD.sig` are undefined, the footer test finds no navy background, the player-card footer test finds no wordmark span, and the font test counts 2 fonts.

- [ ] **Step 4: Replace `src/lib/exportTheme.ts`**

```ts
// Fixed light palette for downloadable card images. Deliberately hard-coded rather
// than the CSS custom properties the rest of the site uses: an exported PNG is
// looked at outside the page (shared, embedded, printed) and must look the same
// regardless of the viewer's site theme, so it can't inherit --text/--surface,
// which flip to dark values under prefers-color-scheme. Mirrors the site's own
// light-mode tokens (globals.css :root) so the card still reads as "this site";
// tests/export-theme.test.ts checks the two stay in step.
export const CARD = {
  bg: "#f3f4f8",
  surface: "#ffffff",
  border: "#dde1ea",
  text: "#0b1324",
  textMuted: "#5a6478",
  textFaint: "#8b95a8",
  /** Volt's readable ink on a white surface (--sig-ink). Volt itself only goes on navy. */
  accent: "#4d7c0f",
  accentSoft: "#eef9c9",
  sig: "#c6f135",
  /** The masthead band (--mast) and its text, for the footer every card ends with. */
  mast: "#0b1324",
  mastText: "#eef1f7",
  mastMuted: "#9aa5bd",
  win: "#15803d",
  loss: "#b91c1c",
} as const;

export const CARD_FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

// The headline face for titles, scores and the wordmark. The cards are captured inside
// the page, where next/font defines --font-barlow, so the variable resolves to the
// self-hosted Barlow Condensed. (The server-rendered player card names the family
// directly: see PerformanceCard and cardFont.ts.)
export const CARD_DISPLAY_FONT = 'var(--font-barlow), "Barlow Condensed", "Arial Narrow", sans-serif';
```

- [ ] **Step 5: Replace `src/lib/cardFont.ts`**

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Read once at module scope (next/og docs: "The font doesn't depend on request
// data, so read it once at module scope") — assets/fonts holds two Inter
// weights (400/700) locally subsetted with the `subset-font` package (see
// scripts/subset-card-fonts note in tests/card-font.test.ts and the task-1
// fix report) to cover printable ASCII (U+0020-U+007E) plus the full Latin-1
// Supplement + Latin Extended-A Unicode block (U+00A0-U+017F), and the full
// Barlow Condensed ExtraBold (OFL) that the site's headlines use, for the card's
// title, score and wordmark.
const regular = readFileSync(join(process.cwd(), "assets/fonts/Inter-Regular.ttf"));
const bold = readFileSync(join(process.cwd(), "assets/fonts/Inter-Bold.ttf"));
const display = readFileSync(join(process.cwd(), "assets/fonts/BarlowCondensed-ExtraBold.ttf"));

export const CARD_FONTS: { name: string; data: Buffer; weight: 400 | 700 | 800; style: "normal" }[] = [
  { name: "Inter", data: regular, weight: 400, style: "normal" },
  { name: "Inter", data: bold, weight: 700, style: "normal" },
  { name: "Barlow Condensed", data: display, weight: 800, style: "normal" },
];
```

- [ ] **Step 6: Replace `src/components/ExportFooter.tsx`**

```tsx
import { PixelBall } from "./Logo";
import { SITE_URL, X_HANDLE } from "@/lib/site";
import { CARD, CARD_DISPLAY_FONT } from "@/lib/exportTheme";

/** "SPORTSDB" for the cards: the site's wordmark as inline styles, DB in Volt. */
export function ExportWordmark({ size = 18 }: { size?: number }) {
  return (
    <span style={{ fontFamily: CARD_DISPLAY_FONT, fontWeight: 800, textTransform: "uppercase", fontSize: size, lineHeight: 1, letterSpacing: "0.01em", color: CARD.mastText }}>
      Sports<span style={{ color: CARD.sig }}>DB</span>
    </span>
  );
}

// The bottom bar every downloadable card ends with: the site's navy masthead with the lit
// block, the wordmark and the domain, so an image that circulates off-site still points
// home, plus what the card is and when it was generated. `inset` is the card's padding and
// `radius` its corner radius: the band bleeds to the card's edges and keeps its corners.
export function ExportFooter({ context, inset = 24, radius = 16 }: { context: string; inset?: number; radius?: number }) {
  const domain = SITE_URL.replace(/^https?:\/\//, "");
  const stamp = `${new Date().toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })}, ${new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "UTC", hourCycle: "h23" })} UTC`;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: "8px 16px",
        margin: `20px -${inset}px -${inset}px`,
        padding: `12px ${inset}px`,
        borderRadius: `0 0 ${radius}px ${radius}px`,
        background: CARD.mast,
        color: CARD.mastText,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
        <PixelBall size={18} fill={CARD.mastText} live={CARD.sig} />
        <ExportWordmark size={18} />
        <span style={{ fontSize: 12, color: CARD.mastMuted }}>{domain}</span>
        <span style={{ fontSize: 12, color: CARD.mastMuted }}>·</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: CARD.mastMuted }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill={CARD.mastText} aria-hidden="true">
            <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
          </svg>
          @{X_HANDLE}
        </span>
      </div>
      <div style={{ fontSize: 11, color: CARD.mastMuted, whiteSpace: "nowrap" }}>
        {context} · {stamp}
      </div>
    </div>
  );
}
```

The three cards that place `ExportFooter` themselves (`TeamScheduleExportCard`, `TeamRosterExportCard`, `PlayerExportCard`) use the same 24px padding and 16px radius as `ExportShell`, so the defaults fit all of them.

- [ ] **Step 7: Titles and scores in the display face**

In `src/components/ExportShell.tsx` change the import and `ExportLabel` (lines 4 and 9-11):

```tsx
import { CARD, CARD_DISPLAY_FONT } from "@/lib/exportTheme";
```
```tsx
export function ExportLabel({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: CARD.accent }}>{children}</div>;
}
```

and the title line in `ExportTitle` (line 32):

```tsx
      <div style={{ marginTop: top ? 6 : 0, fontFamily: CARD_DISPLAY_FONT, fontWeight: 800, textTransform: "uppercase", fontSize: 32, lineHeight: 1, color: CARD.text }}>{title}</div>
```

In `src/components/ExportTeamLine.tsx` change the import and the score span (line 36):

```tsx
import { CARD, CARD_DISPLAY_FONT } from "@/lib/exportTheme";
```
```tsx
        <span style={{ fontFamily: CARD_DISPLAY_FONT, fontSize: 22, lineHeight: 1, fontWeight: won ? 800 : 600, color: won ? CARD.text : CARD.textMuted, whiteSpace: "nowrap" }}>
```

In `src/components/StandingsExportCard.tsx` line 13, the first zone takes the site's `--zone-1`:

```tsx
const ZONE_COLOR: Record<string, string> = { "zone-1": "#2563eb", "zone-2": "#d97706", "zone-3": "#dc2626", "zone-4": "#0f766e" };
```

- [ ] **Step 8: Replace `src/components/PerformanceCard.tsx`**

Satori (the `/card` route) accepts only flex layouts, inline styles, no `inline-flex`, no `<table>`, no `<img>`; this file keeps to that subset, which also renders identically in a browser.

```tsx
// src/components/PerformanceCard.tsx
import { CARD, CARD_FONT } from "@/lib/exportTheme";
import { cardAccentColor } from "@/lib/cardColor";
import { PixelBall } from "./Logo";
import { SITE_URL, X_HANDLE } from "@/lib/site";
import { LEAGUE_LABEL } from "@/lib/leagues";
import type { PerformanceStat } from "@/lib/performanceLine";

// The family registered in cardFont.ts; Satori matches fonts by this name.
const DISPLAY = "Barlow Condensed";

// A card-only mirror of ExportFooter (src/components/ExportFooter.tsx), not that component itself:
// ExportFooter's X glyph span uses `display: "inline-flex"` and its wordmark nests a span inside
// text, both of which Satori rejects. Same band, same colours, flex only, handle as plain text.
function PerformanceCardFooter({ context }: { context: string }) {
  const domain = SITE_URL.replace(/^https?:\/\//, "");
  const stamp = `${new Date().toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })}, ${new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "UTC", hourCycle: "h23" })} UTC`;

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 40px", background: CARD.mast, color: CARD.mastText }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <PixelBall size={22} fill={CARD.mastText} live={CARD.sig} />
        <div style={{ display: "flex", fontFamily: DISPLAY, fontWeight: 800, fontSize: 22, lineHeight: 1, textTransform: "uppercase" }}>
          <span style={{ color: CARD.mastText }}>Sports</span><span style={{ color: CARD.sig }}>DB</span>
        </div>
        <span style={{ fontSize: 15, color: CARD.mastMuted }}>{domain}</span>
        <span style={{ fontSize: 15, color: CARD.mastMuted }}>·</span>
        <span style={{ fontSize: 15, color: CARD.mastMuted }}>@{X_HANDLE}</span>
      </div>
      <div style={{ display: "flex", fontSize: 14, color: CARD.mastMuted }}>
        {context} · {stamp}
      </div>
    </div>
  );
}

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
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: CARD.surface, fontFamily: CARD_FONT, position: "relative" }}>
      {/* Oversized jersey number watermark, behind everything else. */}
      {jersey && (
        <div style={{ position: "absolute", top: -40, right: 20, fontFamily: DISPLAY, fontSize: 420, fontWeight: 800, color: `${accent}1a`, lineHeight: 1 }}>{jersey}</div>
      )}

      <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: 40 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 15, color: CARD.accent, fontWeight: 700, textTransform: "uppercase", letterSpacing: 2 }}>
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
          <div style={{ display: "flex", width: 64, height: 64, borderRadius: 32, background: accent, color: CARD.surface, alignItems: "center", justifyContent: "center", fontFamily: DISPLAY, fontSize: 24, fontWeight: 800 }}>
            {teamAbbr ?? ""}
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontFamily: DISPLAY, fontSize: 52, fontWeight: 800, lineHeight: 1, textTransform: "uppercase", color: CARD.text }}>{playerName}</div>
            <div style={{ display: "flex", fontSize: 18, color: CARD.textMuted, marginTop: 6 }}>
              {[position, jersey ? `#${jersey}` : null].filter(Boolean).join(" · ")}
              {opponentAbbr ? ` vs ${opponentAbbr}` : ""}
            </div>
          </div>
        </div>

        {resultLetter && teamScore != null && opponentScore != null && (
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 14, fontFamily: DISPLAY, fontSize: 28, fontWeight: 800, lineHeight: 1 }}>
            <span style={{ color: resultLetter === "W" ? CARD.win : CARD.loss }}>{resultLetter}</span>
            <span style={{ color: CARD.text }}>
              {teamScore}-{opponentScore}
            </span>
          </div>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 28 }}>
          {stats.map((s) => (
            <div key={s.key} style={{ display: "flex", flexDirection: "column", background: CARD.bg, borderRadius: 12, padding: "14px 18px", minWidth: 130 }}>
              <span style={{ fontFamily: DISPLAY, fontSize: 40, fontWeight: 800, lineHeight: 1, color: accent }}>{s.value}</span>
              <span style={{ fontSize: 13, color: CARD.textMuted, marginTop: 6 }}>{s.label}</span>
              {s.delta && <span style={{ fontSize: 12, color: CARD.textFaint, marginTop: 4 }}>{s.delta}</span>}
            </div>
          ))}
        </div>

        <div style={{ display: "flex", flex: 1 }} />
      </div>
      <PerformanceCardFooter context={`${LEAGUE_LABEL[league]} · Player card`} />
    </div>
  );
}
```

- [ ] **Step 9: Run the tests to verify they pass, then the whole suite**

Run: `npx tsx --test tests/export-theme.test.ts tests/performance-card.test.ts tests/card-font.test.ts tests/card-color.test.ts`
Expected: PASS, all tests (the card-colour tests still pass: the fallback is simply the new accent).

Run: `npm test 2>&1 | tail -5`
Expected: `# fail 0`.

- [ ] **Step 10: Check that no old-brand colour is left anywhere in the app**

Run: `grep -rn "1d4ed8\|6ea0ff\|f87171\|fb7185\|0b1220\|16223a" src | grep -v "globals.css" || echo CLEAN`
Expected: `CLEAN`. (`globals.css` keeps `--zone-1: #6ea0ff`, `--zone-3`/`--loss: #f87171` as dark-mode table and result colours: those are not brand colours. The tests assert the absence of `#1d4ed8` and so contain the string; they are not part of the gate.) (Task 1 step 7 removed them from the share images; this task from the cards. Any hit is a miss: fix it with the matching token from `CARD` or the share-image mapping in Task 1.)

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 11: Look at the cards**

Start the dev server (`preview_start {name: "home-builder"}`, the `.claude/launch.json` entry from Task 1) and:

1. Open `http://localhost:3011/nba/standings`. Run in the page with `javascript_tool`: `document.querySelectorAll('div[aria-hidden="true"]').forEach(d => { if (d.style.left === '-99999px') d.style.left = '0'; })` so the off-screen export card is visible, then screenshot. Expect: white card, the title in uppercase condensed type, the eyebrow in green ink, the navy band at the bottom with four blocks (top-right lime), "SPORTSDB" with DB in lime, the domain and the handle.
2. Open a finished game page (`/epl` → any result → the match page) and do the same: the score header's numbers are in the condensed face.
3. Open `http://localhost:3011/nba/games/<id>/players/<slug>/card?format=og` for a player from that game's box score (the "Share image" link on a player's row gives the exact path). Expect the same band and faces rendered by the server.

Take one screenshot of each for the task record.

- [ ] **Step 12: Commit**

```bash
git add -A && git commit -m "Put the downloadable cards and the player card on the new brand

The export palette now mirrors the site's light tokens (Volt ink accent, navy
masthead), titles and scores are set in Barlow Condensed, and every card ends
with the navy band carrying the lit block and the wordmark. The server-rendered
player card gets Barlow Condensed ExtraBold as a vendored OFL font.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: The region route reports the country

**Files:**
- Modify: `src/app/api/region/route.ts`
- Test: `tests/country.test.ts` (append)

**Interfaces:**
- Produces: `GET /api/region` → `{ consentRequired: boolean; country: string | null }`, `Cache-Control: private, no-store`.

- [ ] **Step 1: Write the failing test**

Append to `tests/country.test.ts`:

```ts
test("GET /api/region returns the country next to the consent flag", async () => {
  const res = await GET(new Request("http://localhost/api/region", { headers: { "cf-ipcountry": "IN" } }));
  assert.deepEqual(await res.json(), { consentRequired: false, country: "IN" });
  assert.equal(res.headers.get("cache-control"), "private, no-store");
});

test("GET /api/region reports null with no usable header, and still asks for consent", async () => {
  const res = await GET(new Request("http://localhost/api/region"));
  assert.deepEqual(await res.json(), { consentRequired: true, country: null });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx --test tests/country.test.ts`
Expected: FAIL on `deepEqual`: the body has no `country` key.

- [ ] **Step 3: Return the country**

Replace the body of `GET` in `src/app/api/region/route.ts`:

```ts
export function GET(request: Request) {
  const country = visitorCountry(request.headers);
  const consentRequired = !country || CONSENT_REGIONS.includes(country);
  return Response.json({ consentRequired, country: country ?? null }, { headers: { "Cache-Control": "private, no-store" } });
}
```

Update the file's leading comment to say the route also tells the homepage builder which country the visitor is in, and that nothing is stored.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx --test tests/country.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/region/route.ts tests/country.test.ts && git commit -m "Report the visitor's country from /api/region

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Block types and parameter validation

**Files:**
- Create: `src/lib/blockTypes.ts`, `src/lib/blockParams.ts`
- Test: `tests/block-params.test.ts`

**Interfaces:**
- Produces from `blockTypes.ts`: `BLOCK_TYPES`, `type BlockType`, `interface HomeBlock { id; type; params; label }`, `blockId(type, params)`, the payload types `LiveBlockData`, `TeamNextBlockData`, `FixtureLine`, `StandingsBlockData`, `StandingsLine`, `PlayerFormBlockData`, `F1DriversBlockData`, `BtsBlockData`, `type BlockPayload`.
- Produces from `blockParams.ts`: `isBlockType(v)`, `validateBlockParams(type, raw)`, `BLOCK_CACHE_SECONDS`, `cacheHeader(type)`.

- [ ] **Step 1: Write the failing test**

Create `tests/block-params.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { blockId } from "../src/lib/blockTypes";
import { BLOCK_CACHE_SECONDS, cacheHeader, isBlockType, validateBlockParams } from "../src/lib/blockParams";

test("blockId is the type alone without params, else the type and the param values in key order", () => {
  assert.equal(blockId("live", {}), "live");
  assert.equal(blockId("team-next", { team: "arsenal", league: "epl" }), "team-next:epl:arsenal");
});

test("isBlockType accepts the seven types and nothing else", () => {
  for (const t of ["live", "team-next", "standings", "series-standings", "player-form", "f1-drivers", "bts"]) assert.equal(isBlockType(t), true);
  assert.equal(isBlockType("news"), false);
  assert.equal(isBlockType(""), false);
});

test("parameterless types ignore stray params", () => {
  assert.deepEqual(validateBlockParams("live", { league: "epl" }), { ok: true, params: {} });
  assert.deepEqual(validateBlockParams("bts", {}), { ok: true, params: {} });
});

test("team-next takes a league and a team slug, or cricket and a side id", () => {
  assert.deepEqual(validateBlockParams("team-next", { league: "epl", team: "arsenal" }), { ok: true, params: { league: "epl", team: "arsenal" } });
  assert.deepEqual(validateBlockParams("team-next", { league: "cricket", team: "6" }), { ok: true, params: { league: "cricket", team: "6" } });
  assert.equal(validateBlockParams("team-next", { league: "cricket", team: "india" }).ok, false);
  assert.equal(validateBlockParams("team-next", { league: "f1", team: "ferrari" }).ok, false);
  assert.equal(validateBlockParams("team-next", { league: "epl", team: "Arsenal FC" }).ok, false);
  assert.equal(validateBlockParams("team-next", { league: "epl" }).ok, false);
});

test("standings needs a league that has a table", () => {
  assert.deepEqual(validateBlockParams("standings", { league: "nba" }), { ok: true, params: { league: "nba" } });
  assert.equal(validateBlockParams("standings", { league: "odi" }).ok, false);
  assert.equal(validateBlockParams("standings", { league: "tennis" }).ok, false);
});

test("series-standings takes a cricket series id", () => {
  assert.deepEqual(validateBlockParams("series-standings", { series: "8048-2026" }), { ok: true, params: { series: "8048-2026" } });
  assert.equal(validateBlockParams("series-standings", { series: "ipl" }).ok, false);
});

test("player-form takes a league and a player slug", () => {
  assert.deepEqual(validateBlockParams("player-form", { league: "ipl", player: "virat-kohli" }), { ok: true, params: { league: "ipl", player: "virat-kohli" } });
  assert.equal(validateBlockParams("player-form", { league: "atp", player: "carlos-alcaraz" }).ok, false);
  assert.equal(validateBlockParams("player-form", { league: "nba", player: "" }).ok, false);
});

test("cache lifetimes follow the spec and the header carries four times the lifetime as stale window", () => {
  assert.deepEqual(BLOCK_CACHE_SECONDS, { live: 30, "team-next": 60, standings: 900, "series-standings": 900, "player-form": 900, "f1-drivers": 3600, bts: 3600 });
  assert.equal(cacheHeader("live"), "public, s-maxage=30, stale-while-revalidate=120");
  assert.equal(cacheHeader("bts"), "public, s-maxage=3600, stale-while-revalidate=14400");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx --test tests/block-params.test.ts`
Expected: FAIL, cannot find module `../src/lib/blockTypes`.

- [ ] **Step 3: Create `src/lib/blockTypes.ts`**

```ts
// The homepage blocks: what a visitor can put on their page and what each one carries.
// Shared by the route that serves a block and the components that draw it, so nothing
// here may import the database.
import type { GameRow } from "./queries";
import type { CricketSeriesMatch } from "./cricketSeries";
import type { TennisMatch } from "./tennis";
import type { ArtPalette } from "./beyondTheScoreline";

export const BLOCK_TYPES = ["live", "team-next", "standings", "series-standings", "player-form", "f1-drivers", "bts"] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

export interface HomeBlock {
  /** `blockId(type, params)`: unique within a setup. */
  id: string;
  type: BlockType;
  params: Record<string, string>;
  /** The block's name as shown: "Kohli: last five". */
  label: string;
}

/** The type alone for a block without parameters, else the type and the parameter values in key order. */
export function blockId(type: BlockType, params: Record<string, string>): string {
  const keys = Object.keys(params).sort();
  return keys.length === 0 ? type : `${type}:${keys.map((k) => params[k]).join(":")}`;
}

export interface LiveBlockData {
  games: GameRow[];
  cricket: CricketSeriesMatch[];
  tennis: TennisMatch[];
}

export interface FixtureLine {
  id: string;
  /** ISO instant. */
  date: string;
  opponent: string;
  home: boolean;
  href: string;
  /** "2-1" from the team's side, or a cricket score line; null before the game. */
  score: string | null;
  result: "W" | "L" | "D" | null;
  live: boolean;
  status: string | null;
  league: string;
}

export interface TeamNextBlockData {
  team: { name: string; href: string; color: string | null };
  last: FixtureLine | null;
  next: FixtureLine[];
}

export interface StandingsLine {
  position: number;
  name: string;
  href: string;
  played: number;
  /** Points for football and cricket, "W-L" for the NFL and NBA. */
  figure: string;
  netRunRate: string | null;
  /** One of the `.zone-N` classes, or null outside any zone. */
  zone: string | null;
  color: string | null;
}

export interface StandingsBlockData {
  label: string;
  href: string;
  rows: StandingsLine[];
  /** True for the NFL and NBA, where `figure` is a record and the leader is "ahead at 5-1". */
  record: boolean;
}

export interface PlayerFormBlockData {
  player: { name: string; href: string; team: string | null };
  /** Column name for the bars: "Runs", "Points", "Goals". */
  statLabel: string;
  /** Verb for the hero line: "made", "scored", "had". */
  verb: string;
  games: { id: string; date: string; opponent: string; value: number | null; display: string; href: string }[];
}

export interface F1DriversBlockData {
  season: number;
  rows: { position: number | null; name: string; href: string; constructor: string | null; points: number | null }[];
  nextRace: { name: string; href: string; raceIso: string; circuitTimeZone: string } | null;
}

export interface BtsBlockData {
  articles: { slug: string; title: string; number: string; caption: string; palette: ArtPalette; sport: string; href: string }[];
}

export type BlockPayload = LiveBlockData | TeamNextBlockData | StandingsBlockData | PlayerFormBlockData | F1DriversBlockData | BtsBlockData;

/** What the route returns: `block` is null when the entity no longer exists. */
export interface BlockResponse {
  block: BlockPayload | null;
  fetchedAt: string;
}
```

- [ ] **Step 4: Create `src/lib/blockParams.ts`**

```ts
// Validation of a block's parameters, kept out of the route handler so it is testable
// without a request, and the edge cache lifetime of each block type.
import { BLOCK_TYPES, type BlockType } from "./blockTypes";
import { hasStandings, isLeague } from "./leagues";

export const BLOCK_CACHE_SECONDS: Record<BlockType, number> = {
  live: 30,
  "team-next": 60,
  standings: 900,
  "series-standings": 900,
  "player-form": 900,
  "f1-drivers": 3600,
  bts: 3600,
};

export function isBlockType(value: string): value is BlockType {
  return (BLOCK_TYPES as readonly string[]).includes(value);
}

export type ParamCheck = { ok: true; params: Record<string, string> } | { ok: false; error: string };

const SLUG = /^[a-z0-9][a-z0-9-]{0,80}$/;
const SIDE_ID = /^[0-9]{1,12}$/;
const SERIES_ID = /^[0-9]{1,12}(-[0-9]{1,12})?$/;

const ok = (params: Record<string, string>): ParamCheck => ({ ok: true, params });
const fail = (error: string): ParamCheck => ({ ok: false, error });

export function validateBlockParams(type: BlockType, raw: Record<string, string | null | undefined>): ParamCheck {
  switch (type) {
    case "live":
    case "f1-drivers":
    case "bts":
      return ok({});
    case "team-next": {
      const league = raw.league ?? "";
      const team = raw.team ?? "";
      if (league === "cricket") return SIDE_ID.test(team) ? ok({ league, team }) : fail("team must be a cricket side id");
      if (!isLeague(league)) return fail("league must be a competition with teams, or cricket");
      return SLUG.test(team) ? ok({ league, team }) : fail("team must be a team slug");
    }
    case "standings": {
      const league = raw.league ?? "";
      return isLeague(league) && hasStandings(league) ? ok({ league }) : fail("league must have a table");
    }
    case "series-standings": {
      const series = raw.series ?? "";
      return SERIES_ID.test(series) ? ok({ series }) : fail("series must be a cricket series id");
    }
    case "player-form": {
      const league = raw.league ?? "";
      const player = raw.player ?? "";
      if (!isLeague(league)) return fail("league must be a competition with player pages");
      return SLUG.test(player) ? ok({ league, player }) : fail("player must be a player slug");
    }
  }
}

export function cacheHeader(type: BlockType): string {
  const s = BLOCK_CACHE_SECONDS[type];
  return `public, s-maxage=${s}, stale-while-revalidate=${s * 4}`;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx tsx --test tests/block-params.test.ts`
Expected: PASS, 8 tests. If `hasStandings("odi")` turns out true, read `hasStandings` in `src/lib/leagues.ts` and change the test's rejected league to one it lists as table-less; the rule, not the example, is what matters.

- [ ] **Step 6: Commit**

```bash
git add src/lib/blockTypes.ts src/lib/blockParams.ts tests/block-params.test.ts && git commit -m "Add the homepage block types and parameter validation

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Editions

**Files:**
- Create: `src/lib/editions.ts`
- Test: `tests/editions.test.ts`

**Interfaces:**
- Consumes: `HomeBlock`, `blockId` from Task 3.
- Produces: `type EditionKey`, `interface Edition { key; name; nationalSide; domesticLeague }`, `editionFor(country)`, `interface EditionContext { cricketSides: { id; name }[]; featuredCricketSeries: { id; name } | null }`, `startingBlocks(edition, ctx)`, `editionNote(edition)`, `editionToggleLabel(edition)`, and the shared block constructors `standingsBlock(league)`, `liveBlock()`, `f1Block()`, `btsBlock()`, `cricketSideBlock(side)`, `seriesStandingsBlock(series)`.

- [ ] **Step 1: Write the failing test**

Create `tests/editions.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { editionFor, editionNote, editionToggleLabel, startingBlocks, type EditionContext } from "../src/lib/editions";
import { validateBlockParams } from "../src/lib/blockParams";

const ctx: EditionContext = {
  cricketSides: [
    { id: "6", name: "India" },
    { id: "1", name: "England" },
    { id: "2", name: "Australia" },
  ],
  featuredCricketSeries: { id: "8604-2026", name: "ICC Men's T20 World Cup" },
};

test("countries map to their edition; unknown and null map to World", () => {
  assert.equal(editionFor("IN").name, "India");
  assert.equal(editionFor("in").name, "India");
  assert.equal(editionFor("US").name, "USA");
  assert.equal(editionFor("GB").nationalSide, "England");
  assert.equal(editionFor("DE").domesticLeague, "bundesliga");
  assert.equal(editionFor("BR").key, "world");
  assert.equal(editionFor(null).key, "world");
});

test("India starts with cricket, the national side, the featured series, the Premier League, F1 and the desk", () => {
  const labels = startingBlocks(editionFor("IN"), ctx).map((b) => b.label);
  assert.deepEqual(labels, [
    "Live in your blocks",
    "India: next three",
    "ICC Men's T20 World Cup standings",
    "Premier League standings",
    "F1: driver standings",
    "Beyond the Scoreline",
  ]);
});

test("a national side or featured series missing from the context is left out, never guessed", () => {
  const labels = startingBlocks(editionFor("PK"), { cricketSides: [], featuredCricketSeries: null }).map((b) => b.label);
  assert.deepEqual(labels, ["Live in your blocks", "Premier League standings", "F1: driver standings", "Beyond the Scoreline"]);
});

test("USA starts with the NFL and NBA, Germany with the Bundesliga, World with football", () => {
  assert.deepEqual(startingBlocks(editionFor("US"), ctx).map((b) => b.label), [
    "Live in your blocks",
    "NFL standings",
    "NBA standings",
    "Premier League standings",
    "Champions League standings",
    "Beyond the Scoreline",
  ]);
  assert.equal(startingBlocks(editionFor("DE"), ctx)[1].label, "Bundesliga standings");
  assert.deepEqual(startingBlocks(editionFor(null), ctx).map((b) => b.label), [
    "Live in your blocks",
    "Premier League standings",
    "Champions League standings",
    "F1: driver standings",
    "Beyond the Scoreline",
  ]);
});

test("every starting block of every edition is valid, uniquely identified and within the limit", () => {
  for (const country of ["IN", "PK", "BD", "LK", "US", "CA", "GB", "IE", "AU", "NZ", "ZA", "DE", "ES", "IT", null]) {
    const blocks = startingBlocks(editionFor(country), ctx);
    assert.ok(blocks.length <= 12);
    assert.equal(new Set(blocks.map((b) => b.id)).size, blocks.length);
    for (const b of blocks) assert.equal(validateBlockParams(b.type, b.params).ok, true, `${country}: ${b.id}`);
  }
});

test("the card copy names the edition, and World gets neutral copy", () => {
  assert.equal(editionNote(editionFor("IN")), "India picks, because that is where you are browsing from. Keep them, trim them, or start blank.");
  assert.equal(editionToggleLabel(editionFor("IN")), "Start with India picks");
  assert.equal(editionNote(editionFor(null)), "A starting set of picks. Keep them, trim them, or start blank.");
  assert.equal(editionToggleLabel(editionFor(null)), "Start with suggested picks");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx --test tests/editions.test.ts`
Expected: FAIL, cannot find module `../src/lib/editions`.

- [ ] **Step 3: Create `src/lib/editions.ts`**

```ts
// The starting draft of a visitor's homepage by country. An edition is only a first
// suggestion: the visitor can trim it or start blank, and the page never reads the
// country on the server (see the spec: the homepage HTML is one cached document).
import { blockId, type HomeBlock } from "./blockTypes";
import { LEAGUE_LABEL, type League } from "./leagues";

export type EditionKey = "IN" | "PK" | "BD" | "LK" | "US" | "CA" | "GB" | "IE" | "AU" | "NZ" | "ZA" | "DE" | "ES" | "IT" | "world";

export interface Edition {
  key: EditionKey;
  /** Shown in the builder card: "India picks". */
  name: string;
  /** The men's international cricket side suggested as the first team, by the name the cricket feeds use. */
  nationalSide: string | null;
  domesticLeague: League | null;
}

/** What the server resolves once per render so the client never guesses ids: the international
 * cricket sides with play in the coming weeks and the headline series with a table. */
export interface EditionContext {
  cricketSides: { id: string; name: string }[];
  featuredCricketSeries: { id: string; name: string } | null;
}

const EDITIONS: Record<Exclude<EditionKey, "world">, Omit<Edition, "key">> = {
  IN: { name: "India", nationalSide: "India", domesticLeague: null },
  PK: { name: "Pakistan", nationalSide: "Pakistan", domesticLeague: null },
  BD: { name: "Bangladesh", nationalSide: "Bangladesh", domesticLeague: null },
  LK: { name: "Sri Lanka", nationalSide: "Sri Lanka", domesticLeague: null },
  US: { name: "USA", nationalSide: null, domesticLeague: null },
  CA: { name: "Canada", nationalSide: null, domesticLeague: null },
  GB: { name: "UK", nationalSide: "England", domesticLeague: null },
  IE: { name: "Ireland", nationalSide: "England", domesticLeague: null },
  AU: { name: "Australia", nationalSide: "Australia", domesticLeague: null },
  NZ: { name: "New Zealand", nationalSide: "New Zealand", domesticLeague: null },
  ZA: { name: "South Africa", nationalSide: "South Africa", domesticLeague: null },
  DE: { name: "Germany", nationalSide: null, domesticLeague: "bundesliga" },
  ES: { name: "Spain", nationalSide: null, domesticLeague: "laliga" },
  IT: { name: "Italy", nationalSide: null, domesticLeague: "seriea" },
};

export function editionFor(country: string | null | undefined): Edition {
  const key = (country ?? "").trim().toUpperCase();
  if (key in EDITIONS) return { key: key as Exclude<EditionKey, "world">, ...EDITIONS[key as Exclude<EditionKey, "world">] };
  return { key: "world", name: "World", nationalSide: null, domesticLeague: null };
}

function make(type: HomeBlock["type"], params: Record<string, string>, label: string): HomeBlock {
  return { id: blockId(type, params), type, params, label };
}

export const liveBlock = (): HomeBlock => make("live", {}, "Live in your blocks");
export const f1Block = (): HomeBlock => make("f1-drivers", {}, "F1: driver standings");
export const btsBlock = (): HomeBlock => make("bts", {}, "Beyond the Scoreline");
export const standingsBlock = (league: League): HomeBlock => make("standings", { league }, `${LEAGUE_LABEL[league]} standings`);
export const cricketSideBlock = (side: { id: string; name: string }): HomeBlock => make("team-next", { league: "cricket", team: side.id }, `${side.name}: next three`);
export const seriesStandingsBlock = (series: { id: string; name: string }): HomeBlock => make("series-standings", { series: series.id }, `${series.name} standings`);

type Group = "cricket-first" | "us" | "uk" | "cricket-south" | "european" | "world";

function group(edition: Edition): Group {
  switch (edition.key) {
    case "IN":
    case "PK":
    case "BD":
    case "LK":
      return "cricket-first";
    case "US":
    case "CA":
      return "us";
    case "GB":
    case "IE":
      return "uk";
    case "AU":
    case "NZ":
    case "ZA":
      return "cricket-south";
    case "DE":
    case "ES":
    case "IT":
      return "european";
    default:
      return "world";
  }
}

/** The edition's starting blocks in order. Blocks that need something the context lacks (no national side
 * with play coming, no featured series with a table) are left out rather than guessed. */
export function startingBlocks(edition: Edition, ctx: EditionContext): HomeBlock[] {
  const side = edition.nationalSide ? ctx.cricketSides.find((s) => s.name === edition.nationalSide) : undefined;
  const sideBlock = side ? [cricketSideBlock(side)] : [];
  const seriesBlock = ctx.featuredCricketSeries ? [seriesStandingsBlock(ctx.featuredCricketSeries)] : [];
  switch (group(edition)) {
    case "cricket-first":
      return [liveBlock(), ...sideBlock, ...seriesBlock, standingsBlock("epl"), f1Block(), btsBlock()];
    case "us":
      return [liveBlock(), standingsBlock("nfl"), standingsBlock("nba"), standingsBlock("epl"), standingsBlock("ucl"), btsBlock()];
    case "uk":
      return [liveBlock(), standingsBlock("epl"), standingsBlock("ucl"), ...sideBlock, f1Block(), btsBlock()];
    case "cricket-south":
      return [liveBlock(), ...sideBlock, ...seriesBlock, f1Block(), btsBlock()];
    case "european":
      return [liveBlock(), standingsBlock(edition.domesticLeague as League), standingsBlock("ucl"), f1Block(), btsBlock()];
    case "world":
      return [liveBlock(), standingsBlock("epl"), standingsBlock("ucl"), f1Block(), btsBlock()];
  }
}

export function editionNote(edition: Edition): string {
  return edition.key === "world"
    ? "A starting set of picks. Keep them, trim them, or start blank."
    : `${edition.name} picks, because that is where you are browsing from. Keep them, trim them, or start blank.`;
}

export function editionToggleLabel(edition: Edition): string {
  return edition.key === "world" ? "Start with suggested picks" : `Start with ${edition.name} picks`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx --test tests/editions.test.ts`
Expected: PASS, 6 tests. `LEAGUE_LABEL.epl` must be "Premier League", `ucl` "Champions League", `nfl` "NFL", `nba` "NBA", `bundesliga` "Bundesliga"; if a label differs, the test's expected string follows `LEAGUE_LABEL`, not the other way round.

- [ ] **Step 5: Commit**

```bash
git add src/lib/editions.ts tests/editions.test.ts && git commit -m "Add the country editions and their starting blocks

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: The setup: schema, storage, transfer encoding, list edits

**Files:**
- Create: `src/lib/homeSetup.ts`
- Test: `tests/home-setup.test.ts`

**Interfaces:**
- Consumes: `HomeBlock`, `BlockType` (Task 3), `isBlockType`, `validateBlockParams` (Task 3), `blockId`.
- Produces: `SETUP_KEY`, `SETUP_EVENT`, `MAX_BLOCKS`, `interface HomeSetup { v: 1; edition: string; country: string | null; blocks: HomeBlock[]; createdAt: number; updatedAt: number }`, `interface Declined { v: 1; declined: true }`, `type Stored = HomeSetup | Declined`, `isSetup(s)`, `parseStored(raw)`, `normaliseBlocks(input)`, `readSetup()`, `writeSetup(setup)`, `writeDeclined()`, `clearSetup()`, `applyHomeAttribute(stored)`, `encodeSetup(setup)`, `decodeSetup(encoded)`, `newSetup(edition, country, blocks)`, `addBlock(setup, block)`, `removeBlock(setup, id)`, `moveBlock(setup, id, delta)`, `reorderBlocks(setup, ids)`, `hasBlock(setup, id)`.

- [ ] **Step 1: Write the failing test**

Create `tests/home-setup.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addBlock,
  decodeSetup,
  encodeSetup,
  isSetup,
  MAX_BLOCKS,
  moveBlock,
  newSetup,
  normaliseBlocks,
  parseStored,
  removeBlock,
  reorderBlocks,
  type HomeSetup,
} from "../src/lib/homeSetup";
import { blockId, type HomeBlock } from "../src/lib/blockTypes";

const live: HomeBlock = { id: "live", type: "live", params: {}, label: "Live in your blocks" };
const epl: HomeBlock = { id: blockId("standings", { league: "epl" }), type: "standings", params: { league: "epl" }, label: "Premier League standings" };
const kohli: HomeBlock = { id: blockId("player-form", { league: "ipl", player: "virat-kohli" }), type: "player-form", params: { league: "ipl", player: "virat-kohli" }, label: "Kohli: last five" };

test("newSetup stamps version, dates and copies the blocks", () => {
  const s = newSetup("IN", "IN", [live, epl]);
  assert.equal(s.v, 1);
  assert.equal(s.edition, "IN");
  assert.equal(s.country, "IN");
  assert.deepEqual(s.blocks.map((b) => b.id), ["live", "standings:epl"]);
  assert.ok(s.createdAt > 0 && s.updatedAt >= s.createdAt);
});

test("normaliseBlocks drops invalid, duplicate and over-limit blocks and recomputes ids", () => {
  const out = normaliseBlocks([
    { id: "wrong", type: "standings", params: { league: "epl" }, label: "Premier League standings" },
    { id: "standings:epl", type: "standings", params: { league: "epl" }, label: "Premier League standings" },
    { id: "x", type: "news", params: {}, label: "News" },
    { id: "y", type: "team-next", params: { league: "epl" }, label: "No team" },
    "garbage",
  ]);
  assert.deepEqual(out?.map((b) => b.id), ["standings:epl"]);
  const many = Array.from({ length: 20 }, (_, i) => ({ id: "", type: "player-form", params: { league: "nba", player: `p-${i}` }, label: `P ${i}` }));
  assert.equal(normaliseBlocks(many)?.length, MAX_BLOCKS);
  assert.equal(normaliseBlocks("nope"), null);
});

test("parseStored returns a setup, a declined marker, or null for anything else", () => {
  const s = newSetup("world", null, [live]);
  const back = parseStored(JSON.stringify(s));
  assert.ok(back && isSetup(back));
  assert.equal(back.blocks[0].id, "live");
  assert.deepEqual(parseStored(JSON.stringify({ v: 1, declined: true })), { v: 1, declined: true });
  assert.equal(parseStored(JSON.stringify({ v: 2, blocks: [] })), null);
  assert.equal(parseStored("{not json"), null);
  assert.equal(parseStored(null), null);
  assert.equal(parseStored(JSON.stringify({ ...s, blocks: [] })), null);
});

test("encodeSetup and decodeSetup round-trip without the dates, as a URL-safe string", () => {
  const s = newSetup("IN", "IN", [live, epl, kohli]);
  const encoded = encodeSetup(s);
  assert.match(encoded, /^[A-Za-z0-9_-]+$/);
  const back = decodeSetup(encoded);
  assert.ok(back);
  assert.equal(back.edition, "IN");
  assert.deepEqual(back.blocks.map((b) => b.label), ["Live in your blocks", "Premier League standings", "Kohli: last five"]);
  assert.ok(back.createdAt > 0);
});

test("decodeSetup rejects garbage, wrong versions, unknown types and over-long lists", () => {
  assert.equal(decodeSetup("not base64!"), null);
  assert.equal(decodeSetup(Buffer.from(JSON.stringify({ v: 2, blocks: [live] })).toString("base64url")), null);
  assert.equal(decodeSetup(Buffer.from(JSON.stringify({ v: 1, edition: "IN", country: null, blocks: [{ id: "x", type: "news", params: {}, label: "N" }] })).toString("base64url")), null);
  const many = Array.from({ length: 13 }, (_, i) => ({ id: "", type: "standings", params: { league: "epl" }, label: `${i}` }));
  assert.equal(decodeSetup(Buffer.from(JSON.stringify({ v: 1, edition: "IN", country: null, blocks: many })).toString("base64url")), null);
});

test("a twelve-block setup encodes to well under 1,500 characters", () => {
  const blocks = Array.from({ length: 12 }, (_, i) => ({ id: "", type: "player-form" as const, params: { league: "nba", player: `a-long-player-name-${i}` }, label: `A Long Player Name ${i}: last five` }));
  assert.ok(encodeSetup(newSetup("US", "US", blocks)).length < 1500);
});

test("list edits are pure and respect the limit", () => {
  const s: HomeSetup = newSetup("IN", "IN", [live, epl]);
  const added = addBlock(s, kohli);
  assert.deepEqual(added.blocks.map((b) => b.id), ["live", "standings:epl", "player-form:ipl:virat-kohli"]);
  assert.deepEqual(s.blocks.map((b) => b.id), ["live", "standings:epl"]);
  assert.equal(addBlock(added, kohli), added);
  assert.deepEqual(removeBlock(added, "standings:epl").blocks.map((b) => b.id), ["live", "player-form:ipl:virat-kohli"]);
  assert.deepEqual(moveBlock(added, "player-form:ipl:virat-kohli", -1).blocks.map((b) => b.id), ["live", "player-form:ipl:virat-kohli", "standings:epl"]);
  assert.equal(moveBlock(added, "live", -1), added);
  assert.deepEqual(reorderBlocks(added, ["standings:epl", "live"]).blocks.map((b) => b.id), ["standings:epl", "live", "player-form:ipl:virat-kohli"]);
  const full = newSetup("IN", "IN", Array.from({ length: 12 }, (_, i) => ({ id: "", type: "player-form" as const, params: { league: "nba", player: `p-${i}` }, label: `P ${i}: last five` })));
  assert.equal(addBlock(full, kohli), full);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx --test tests/home-setup.test.ts`
Expected: FAIL, cannot find module `../src/lib/homeSetup`.

- [ ] **Step 3: Create `src/lib/homeSetup.ts`**

```ts
// A visitor's homepage setup: which blocks, in what order. There is no login, so it
// lives in this browser's localStorage, mirroring lib/follow.ts, and travels to another
// device as a base64url string in a link (encodeSetup / decodeSetup).
import { blockId, type HomeBlock } from "./blockTypes";
import { isBlockType, validateBlockParams } from "./blockParams";

export const SETUP_KEY = "sportsdb-home";
/** Fired on this tab whenever the stored setup changes ("storage" only fires in other tabs). */
export const SETUP_EVENT = "sportsdb:home-changed";
export const MAX_BLOCKS = 12;

export interface HomeSetup {
  v: 1;
  /** An edition key ("IN", "world", ...) or "blank" when the visitor started empty. */
  edition: string;
  country: string | null;
  blocks: HomeBlock[];
  createdAt: number;
  updatedAt: number;
}

/** Stored when the visitor chose "I'll decide later": the builder collapses to a bar. */
export interface Declined {
  v: 1;
  declined: true;
}

export type Stored = HomeSetup | Declined;

export function isSetup(s: Stored | null | undefined): s is HomeSetup {
  return !!s && !("declined" in s);
}

/** Validates a list of blocks from anywhere (storage, a link): known type, valid params, ids recomputed,
 * duplicates dropped, capped at MAX_BLOCKS. Null when the input is not a list at all. */
export function normaliseBlocks(input: unknown): HomeBlock[] | null {
  if (!Array.isArray(input)) return null;
  const out: HomeBlock[] = [];
  const seen = new Set<string>();
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const { type, params, label } = item as { type?: unknown; params?: unknown; label?: unknown };
    if (typeof type !== "string" || !isBlockType(type)) continue;
    if (!params || typeof params !== "object") continue;
    const raw = Object.fromEntries(Object.entries(params as Record<string, unknown>).map(([k, v]) => [k, typeof v === "string" ? v : undefined]));
    const check = validateBlockParams(type, raw);
    if (!check.ok) continue;
    const id = blockId(type, check.params);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, type, params: check.params, label: typeof label === "string" && label.trim() ? label.trim().slice(0, 80) : type });
    if (out.length === MAX_BLOCKS) break;
  }
  return out;
}

function asSetup(value: unknown): HomeSetup | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<HomeSetup>;
  if (v.v !== 1) return null;
  const blocks = normaliseBlocks(v.blocks);
  if (!blocks || blocks.length === 0) return null;
  const now = Date.now();
  return {
    v: 1,
    edition: typeof v.edition === "string" ? v.edition : "world",
    country: typeof v.country === "string" ? v.country : null,
    blocks,
    createdAt: typeof v.createdAt === "number" ? v.createdAt : now,
    updatedAt: typeof v.updatedAt === "number" ? v.updatedAt : now,
  };
}

export function parseStored(raw: string | null): Stored | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (value && typeof value === "object" && (value as Declined).v === 1 && (value as Declined).declined === true) return { v: 1, declined: true };
  return asSetup(value);
}

export function newSetup(edition: string, country: string | null, blocks: HomeBlock[]): HomeSetup {
  const now = Date.now();
  return { v: 1, edition, country, blocks: normaliseBlocks(blocks) ?? [], createdAt: now, updatedAt: now };
}

// --- browser storage -----------------------------------------------------------

export function readSetup(): Stored | null {
  if (typeof window === "undefined") return null;
  try {
    return parseStored(window.localStorage.getItem(SETUP_KEY));
  } catch {
    return null;
  }
}

function store(value: Stored): boolean {
  let saved = false;
  try {
    window.localStorage.setItem(SETUP_KEY, JSON.stringify(value));
    saved = true;
  } catch {
    /* private mode or quota: the built state lives in memory for this session */
  }
  applyHomeAttribute(value);
  window.dispatchEvent(new Event(SETUP_EVENT));
  return saved;
}

export function writeSetup(setup: HomeSetup): boolean {
  return store({ ...setup, updatedAt: Date.now() });
}

export function writeDeclined(): boolean {
  return store({ v: 1, declined: true });
}

export function clearSetup() {
  try {
    window.localStorage.removeItem(SETUP_KEY);
  } catch {}
  applyHomeAttribute(null);
  window.dispatchEvent(new Event(SETUP_EVENT));
}

/** Mirrors the pre-paint script in app/layout.tsx: `data-home` on <html> drives which hero is visible. */
export function applyHomeAttribute(stored: Stored | null) {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  if (!stored) delete el.dataset.home;
  else el.dataset.home = isSetup(stored) ? "built" : "collapsed";
}

// --- transfer link ---------------------------------------------------------------

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(encoded: string): string | null {
  if (!/^[A-Za-z0-9_-]+$/.test(encoded)) return null;
  try {
    const padded = encoded.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (encoded.length % 4)) % 4);
    const bin = atob(padded);
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  } catch {
    return null;
  }
}

/** The setup without its dates, as a URL-safe string for `/?setup=`. */
export function encodeSetup(setup: HomeSetup): string {
  const { v, edition, country, blocks } = setup;
  return toBase64Url(JSON.stringify({ v, edition, country, blocks: blocks.map(({ type, params, label }) => ({ type, params, label })) }));
}

/** Null for anything that is not a valid setup of 1 to MAX_BLOCKS blocks. */
export function decodeSetup(encoded: string): HomeSetup | null {
  const text = fromBase64Url(encoded);
  if (text === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (value && typeof value === "object" && Array.isArray((value as { blocks?: unknown }).blocks) && (value as { blocks: unknown[] }).blocks.length > MAX_BLOCKS) return null;
  return asSetup(value);
}

// --- pure list edits ---------------------------------------------------------------

export function hasBlock(setup: HomeSetup, id: string): boolean {
  return setup.blocks.some((b) => b.id === id);
}

/** The same setup object when the block is already there or the list is full. */
export function addBlock(setup: HomeSetup, block: HomeBlock): HomeSetup {
  if (hasBlock(setup, block.id) || setup.blocks.length >= MAX_BLOCKS) return setup;
  return { ...setup, blocks: [...setup.blocks, block] };
}

export function removeBlock(setup: HomeSetup, id: string): HomeSetup {
  return { ...setup, blocks: setup.blocks.filter((b) => b.id !== id) };
}

/** Moves a block one place up (-1) or down (+1); the same object at the ends. */
export function moveBlock(setup: HomeSetup, id: string, delta: -1 | 1): HomeSetup {
  const i = setup.blocks.findIndex((b) => b.id === id);
  const j = i + delta;
  if (i === -1 || j < 0 || j >= setup.blocks.length) return setup;
  const blocks = [...setup.blocks];
  [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
  return { ...setup, blocks };
}

/** Puts the listed ids first in that order; blocks not listed keep their relative order after them. */
export function reorderBlocks(setup: HomeSetup, ids: string[]): HomeSetup {
  const byId = new Map(setup.blocks.map((b) => [b.id, b]));
  const head = ids.map((id) => byId.get(id)).filter((b): b is HomeBlock => !!b);
  const tail = setup.blocks.filter((b) => !ids.includes(b.id));
  return { ...setup, blocks: [...head, ...tail] };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx --test tests/home-setup.test.ts`
Expected: PASS, 7 tests. (`btoa`, `atob`, `TextEncoder` and `TextDecoder` are Node globals.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/homeSetup.ts tests/home-setup.test.ts && git commit -m "Add the homepage setup: storage, validation and the transfer encoding

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: The built hero line

**Files:**
- Create: `src/lib/homeHeroLine.ts`
- Test: `tests/home-hero-line.test.ts`

**Interfaces:**
- Consumes: `HomeBlock` and the payload types from Task 3.
- Produces: `interface LoadedBlock { block: HomeBlock; data: BlockPayload | null }`, `heroLine(loaded, options: { now: Date; formatTime(iso: string): string; formatDay(iso: string): string })` → `{ headline: string; sub: string; liveCount: number }`, and `liveCountOf(loaded)`.

- [ ] **Step 1: Write the failing test**

Create `tests/home-hero-line.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { heroLine, type LoadedBlock } from "../src/lib/homeHeroLine";
import type { HomeBlock, LiveBlockData, PlayerFormBlockData, StandingsBlockData, TeamNextBlockData, F1DriversBlockData } from "../src/lib/blockTypes";

const now = new Date("2026-09-30T14:00:00Z");
const opts = { now, formatTime: (iso: string) => new Date(iso).toISOString().slice(11, 16), formatDay: (iso: string) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(iso).getUTCDay()] };

const block = (type: HomeBlock["type"], label: string): HomeBlock => ({ id: `${type}:${label}`, type, params: {}, label });

const kohli: LoadedBlock = {
  block: block("player-form", "Kohli: last five"),
  data: { player: { name: "Kohli", href: "/ipl/players/virat-kohli", team: "RCB" }, statLabel: "Runs", verb: "made", games: [{ id: "1", date: "2026-09-28", opponent: "Australia", value: 102, display: "102*", href: "/x" }] } satisfies PlayerFormBlockData,
};
const indiaLive: LoadedBlock = {
  block: block("team-next", "India: next three"),
  data: { team: { name: "India", href: "/x", color: null }, last: null, next: [{ id: "m1", date: "2026-09-30T13:30:00Z", opponent: "Australia", home: true, href: "/x", score: "142/3", result: null, live: true, status: "22 balls left", league: "cricket" }] } satisfies TeamNextBlockData,
};
const arsenalToday: LoadedBlock = {
  block: block("team-next", "Arsenal: next three"),
  data: { team: { name: "Arsenal", href: "/x", color: null }, last: null, next: [{ id: "g1", date: "2026-09-30T14:10:00Z", opponent: "Chelsea", home: true, href: "/x", score: null, result: null, live: false, status: null, league: "epl" }] } satisfies TeamNextBlockData,
};
const f1: LoadedBlock = {
  block: block("f1-drivers", "F1: driver standings"),
  data: { season: 2026, rows: [], nextRace: { name: "Singapore Grand Prix", href: "/x", raceIso: "2026-10-04T12:00:00Z", circuitTimeZone: "Asia/Singapore" } } satisfies F1DriversBlockData,
};
const epl: LoadedBlock = {
  block: block("standings", "Premier League standings"),
  data: { label: "Premier League", href: "/x", record: false, rows: [{ position: 1, name: "Arsenal", href: "/x", played: 6, figure: "19", netRunRate: null, zone: "zone-1", color: null }, { position: 2, name: "Liverpool", href: "/x", played: 6, figure: "18", netRunRate: null, zone: "zone-1", color: null }] } satisfies StandingsBlockData,
};
const liveEmpty: LoadedBlock = { block: block("live", "Live in your blocks"), data: { games: [], cricket: [], tennis: [] } satisfies LiveBlockData };

// The fixture sits ten minutes after `now`, so "today" holds in every time zone the suite may run in.
test("the visitor's live team leads, then their player's last score; the sub takes the next two facts", () => {
  const out = heroLine([liveEmpty, indiaLive, kohli, arsenalToday, f1, epl], opts);
  assert.equal(out.headline, "India 142/3 v Australia, 22 balls left. Kohli made 102* last time out.");
  assert.equal(out.sub, "Arsenal v Chelsea at 14:10. Singapore Grand Prix Sun 12:00.");
});

test("a standings leader fills in when nothing is live or due, and an entity is never repeated", () => {
  const out = heroLine([liveEmpty, arsenalToday, epl], opts);
  assert.equal(out.headline, "Arsenal v Chelsea at 14:10.");
  assert.equal(out.sub, "");
});

test("records read as 'ahead at', points as 'by N points'", () => {
  const nfl: LoadedBlock = { block: block("standings", "NFL standings"), data: { ...(epl.data as StandingsBlockData), label: "NFL", record: true, rows: [{ position: 1, name: "Chiefs", href: "/x", played: 4, figure: "4-0", netRunRate: null, zone: null, color: null }] } };
  assert.equal(heroLine([nfl], opts).headline, "Chiefs lead the NFL at 4-0.");
  assert.equal(heroLine([epl], opts).headline, "Arsenal lead the Premier League by 1 point.");
});

test("the live block counts games across sports and the fallback names the counts", () => {
  const live: LoadedBlock = { block: block("live", "Live in your blocks"), data: { games: [{} as never, {} as never], cricket: [{} as never], tennis: [] } };
  const out = heroLine([live, { block: block("bts", "Beyond the Scoreline"), data: null }], opts);
  assert.equal(out.liveCount, 3);
  assert.equal(out.headline, "Your 2 blocks, 3 live.");
  assert.equal(out.sub, "");
});

test("a fixture on another day is not 'today'", () => {
  const tomorrow: LoadedBlock = { ...arsenalToday, data: { ...(arsenalToday.data as TeamNextBlockData), next: [{ ...(arsenalToday.data as TeamNextBlockData).next[0], date: "2026-10-01T14:10:00Z" }] } };
  assert.equal(heroLine([tomorrow], opts).headline, "Your 1 block, 0 live.");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx --test tests/home-hero-line.test.ts`
Expected: FAIL, cannot find module `../src/lib/homeHeroLine`.

- [ ] **Step 3: Create `src/lib/homeHeroLine.ts`**

```ts
// The built homepage's hero copy, written from the visitor's own blocks: at most two facts
// in the headline and two in the line under it, each entity named once. Pure, so the
// priorities are tested; the component supplies the clock and the time formatting.
import type { BlockPayload, F1DriversBlockData, HomeBlock, LiveBlockData, PlayerFormBlockData, StandingsBlockData, TeamNextBlockData } from "./blockTypes";

export interface LoadedBlock {
  block: HomeBlock;
  data: BlockPayload | null;
}

export interface HeroLineOptions {
  now: Date;
  /** "19:00" or "7:00pm" in the visitor's zone. */
  formatTime(iso: string): string;
  /** "Sat" or "Saturday" in the visitor's zone. */
  formatDay(iso: string): string;
}

interface Fact {
  text: string;
  entity: string;
}

const live = (l: LoadedBlock): LiveBlockData | null => (l.block.type === "live" ? (l.data as LiveBlockData | null) : null);
const teamNext = (l: LoadedBlock): TeamNextBlockData | null => (l.block.type === "team-next" ? (l.data as TeamNextBlockData | null) : null);
const playerForm = (l: LoadedBlock): PlayerFormBlockData | null => (l.block.type === "player-form" ? (l.data as PlayerFormBlockData | null) : null);
const f1 = (l: LoadedBlock): F1DriversBlockData | null => (l.block.type === "f1-drivers" ? (l.data as F1DriversBlockData | null) : null);
const standings = (l: LoadedBlock): StandingsBlockData | null => (l.block.type === "standings" || l.block.type === "series-standings" ? (l.data as StandingsBlockData | null) : null);

export function liveCountOf(loaded: LoadedBlock[]): number {
  return loaded.reduce((n, l) => {
    const d = live(l);
    return n + (d ? d.games.length + d.cricket.length + d.tennis.length : 0);
  }, 0);
}

function sameDay(iso: string, now: Date): boolean {
  const d = new Date(iso);
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

/** Facts in priority order: the visitor's team in play, their player's last score, a fixture today,
 * the next race, a table leader. */
function facts(loaded: LoadedBlock[], o: HeroLineOptions): Fact[] {
  const out: Fact[] = [];
  for (const l of loaded) {
    const d = teamNext(l);
    const m = d?.next.find((f) => f.live);
    if (d && m) {
      const score = m.score ? ` ${m.score}` : "";
      const status = m.status ? `, ${m.status}` : "";
      out.push({ text: `${d.team.name}${score} v ${m.opponent}${status}.`, entity: d.team.name });
    }
  }
  for (const l of loaded) {
    const d = playerForm(l);
    const g = d?.games[0];
    if (d && g && g.display) out.push({ text: `${d.player.name} ${d.verb} ${g.display} last time out.`, entity: d.player.name });
  }
  for (const l of loaded) {
    const d = teamNext(l);
    const m = d?.next.find((f) => !f.live && sameDay(f.date, o.now));
    if (d && m) out.push({ text: `${m.home ? `${d.team.name} v ${m.opponent}` : `${m.opponent} v ${d.team.name}`} at ${o.formatTime(m.date)}.`, entity: d.team.name });
  }
  for (const l of loaded) {
    const d = f1(l);
    if (d?.nextRace) out.push({ text: `${d.nextRace.name} ${o.formatDay(d.nextRace.raceIso)} ${o.formatTime(d.nextRace.raceIso)}.`, entity: d.nextRace.name });
  }
  for (const l of loaded) {
    const d = standings(l);
    const [first, second] = d?.rows ?? [];
    if (!d || !first) continue;
    if (d.record) out.push({ text: `${first.name} lead the ${d.label} at ${first.figure}.`, entity: first.name });
    else {
      const gap = second ? Number(first.figure) - Number(second.figure) : NaN;
      const by = Number.isFinite(gap) && gap > 0 ? ` by ${gap} point${gap === 1 ? "" : "s"}` : "";
      out.push({ text: `${first.name} lead the ${d.label}${by}.`, entity: first.name });
    }
  }
  return out;
}

export function heroLine(loaded: LoadedBlock[], o: HeroLineOptions): { headline: string; sub: string; liveCount: number } {
  const liveCount = liveCountOf(loaded);
  const used = new Set<string>();
  const picked: string[] = [];
  for (const f of facts(loaded, o)) {
    if (used.has(f.entity)) continue;
    used.add(f.entity);
    picked.push(f.text);
    if (picked.length === 4) break;
  }
  if (picked.length === 0) {
    const n = loaded.length;
    return { headline: `Your ${n} block${n === 1 ? "" : "s"}, ${liveCount} live.`, sub: "", liveCount };
  }
  return { headline: picked.slice(0, 2).join(" "), sub: picked.slice(2, 4).join(" "), liveCount };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx --test tests/home-hero-line.test.ts`
Expected: PASS, 5 tests. In the second test "Arsenal" appears as a fixture first, so the Premier League leader fact (also Arsenal) is skipped and the sub is empty; that is the no-repeat rule working.

- [ ] **Step 5: Commit**

```bash
git add src/lib/homeHeroLine.ts tests/home-hero-line.test.ts && git commit -m "Generate the built homepage's hero line from the visitor's blocks

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Server loaders, the cricket innings query, the edition context and the block route

**Files:**
- Modify: `src/lib/queries.ts` (append `getCricketRecentInnings`)
- Create: `src/lib/blockLoaders.ts`, `src/lib/editionContext.ts`, `src/app/api/block/[type]/route.ts`
- Test: `tests/block-route.test.ts`

**Interfaces:**
- Consumes: Task 3 types and validation; existing `getTeamBySlug`, `getTeamSeasons`, `getTeamGamesBySeason`, `getStandings`, `getPlayerBySlug`, `getPlayerLog`, `getCricketSeries`, `getCricketSeriesWindow`, `getCricketSeriesMatches`, `getF1Seasons`, `getF1DriverStandings`, `getF1Calendar`, `getHomeData`, `listArticles`, `articleArt`, `zoneRules`, `sportProfile`, `playerSport`, `f1RaceInstant`, `f1CircuitTimeZone`, `isGameCalledOff`.
- Produces: `loadBlock(type: BlockType, params: Record<string, string>): Promise<BlockPayload | null>`; `getEditionContext(): Promise<EditionContext>`; `GET /api/block/[type]` → `BlockResponse`; `getCricketRecentInnings(league, playerEspnId, limit)`.

- [ ] **Step 1: Write the failing route test**

Create `tests/block-route.test.ts`:

```ts
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";

let db: TestDb;
let GET: (request: Request, ctx: { params: Promise<{ type: string }> }) => Promise<Response>;
const q = (sql: string, args: unknown[] = []) => db.pool.query(sql, args);

const call = (type: string, query = "") => GET(new Request(`http://localhost/api/block/${type}${query}`), { params: Promise.resolve({ type }) });

before(async () => {
  db = await startTestDb();
  ({ GET } = await import("../src/app/api/block/[type]/route"));
  await q(
    `insert into teams (league, espn_id, name, slug, abbreviation, color) values
       ('epl','1','Arsenal','arsenal','ARS','ef0107'), ('epl','2','Chelsea','chelsea','CHE','034694'), ('epl','3','Liverpool','liverpool','LIV','c8102e')`
  );
  await q(
    `insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, season_year, completed, status_detail, home_score, away_score) values
       ('epl','g1', now() - interval '3 days', 'Arsenal v Chelsea', '1', '2', 2026, true, 'Full Time', 2, 1),
       ('epl','g2', now() + interval '2 days', 'Liverpool v Arsenal', '3', '1', 2026, false, null, null, null),
       ('epl','g3', now() + interval '9 days', 'Arsenal v Liverpool', '1', '3', 2026, false, null, null, null),
       ('epl','g4', now() + interval '16 days', 'Chelsea v Arsenal', '2', '1', 2026, false, null, null, null),
       ('epl','g5', now() + interval '23 days', 'Arsenal v Chelsea', '1', '2', 2026, false, null, null, null)`
  );
});

after(async () => {
  await (await import("../src/lib/db")).pool.end();
  await db.stop();
});

test("an unknown type is a 400", async () => {
  const res = await call("news");
  assert.equal(res.status, 400);
});

test("bad parameters are a 400 with the reason", async () => {
  const res = await call("team-next", "?league=epl");
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /team must be a team slug/);
});

test("team-next gives the last result and the next three, from the team's side, with the type's cache header", async () => {
  const res = await call("team-next", "?league=epl&team=arsenal");
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "public, s-maxage=60, stale-while-revalidate=240");
  const { block } = await res.json();
  assert.equal(block.team.name, "Arsenal");
  assert.equal(block.team.href, "/epl/teams/arsenal");
  assert.deepEqual({ opponent: block.last.opponent, score: block.last.score, result: block.last.result, home: block.last.home }, { opponent: "Chelsea", score: "2-1", result: "W", home: true });
  assert.deepEqual(block.next.map((f: { opponent: string; home: boolean }) => [f.opponent, f.home]), [["Liverpool", false], ["Liverpool", true], ["Chelsea", false]]);
  assert.equal(block.next[0].href, "/epl/games/g2");
});

test("a team that does not exist is a null block, not an error", async () => {
  const res = await call("team-next", "?league=epl&team=nobody");
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).block, null);
});

test("bts needs no database and returns at most three articles with their art", async () => {
  const res = await call("bts");
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "public, s-maxage=3600, stale-while-revalidate=14400");
  const { block } = await res.json();
  assert.ok(block.articles.length > 0 && block.articles.length <= 3);
  assert.match(block.articles[0].href, /^\/beyond-the-scoreline\//);
  assert.equal(typeof block.articles[0].number, "string");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx --test tests/block-route.test.ts`
Expected: FAIL, cannot find module `../src/app/api/block/[type]/route`.

- [ ] **Step 3: Add the cricket innings query to `src/lib/queries.ts`**

Append after `getPlayerCricketCareer`:

```ts
export interface CricketInningsRow {
  game_espn_id: string;
  date: string;
  opponent_name: string;
  runs: number | null;
  balls_faced: number | null;
  not_out: boolean | null;
  wickets: number | null;
  conceded: number | null;
}

/** A cricketer's most recent innings, newest first: one row per innings with a batting or bowling line. */
export async function getCricketRecentInnings(league: League, playerEspnId: string, limit = 5): Promise<CricketInningsRow[]> {
  const { rows } = await pool.query(
    `select pgs.game_espn_id,
            to_char(g.date at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as date,
            case when g.home_team_espn_id = pgs.team_espn_id then away.name else home.name end as opponent_name,
            (inn->'batting'->>'runs')::int as runs,
            (inn->'batting'->>'ballsFaced')::int as balls_faced,
            (inn->'batting'->>'notOut')::boolean as not_out,
            (inn->'bowling'->>'wickets')::int as wickets,
            (inn->'bowling'->>'conceded')::int as conceded
     from player_game_stats pgs
     join games g on g.league = pgs.league and g.espn_id = pgs.game_espn_id
     join teams home on home.league = g.league and home.espn_id = g.home_team_espn_id
     join teams away on away.league = g.league and away.espn_id = g.away_team_espn_id
     ${CRICKET_INNINGS}
     where pgs.league = $1 and pgs.player_espn_id = $2 and (inn->'batting' is not null or inn->'bowling' is not null)
     order by g.date desc
     limit $3`,
    [league, playerEspnId, limit]
  );
  return rows;
}
```

- [ ] **Step 4: Create `src/lib/blockLoaders.ts`**

```ts
// Server side of the homepage blocks: one loader per type, each reading through the
// existing query layer and shaping a small payload (lib/blockTypes.ts) that the client
// draws. Null means "this entity is gone", which the client shows as an empty block.
import type { BlockPayload, BlockType, BtsBlockData, F1DriversBlockData, FixtureLine, LiveBlockData, PlayerFormBlockData, StandingsBlockData, TeamNextBlockData } from "./blockTypes";
import { getHomeData } from "./homeData";
import {
  getCricketRecentInnings,
  getPlayerBySlug,
  getPlayerLog,
  getStandings,
  getTeamBySlug,
  getTeamGamesBySeason,
  getTeamSeasons,
  type GameRow,
  type StandingRow,
} from "./queries";
import { getCricketSeries, getCricketSeriesMatches, getCricketSeriesWindow, type CricketSeriesMatch } from "./cricketSeries";
import { getF1Calendar, getF1DriverStandings, getF1Seasons } from "./f1";
import { f1RaceInstant } from "./f1Dates";
import { f1CircuitTimeZone } from "./f1Circuits";
import { listArticles } from "./beyondTheScoreline";
import { articleArt } from "./articleArt";
import { hasStandings, isCricketLeague, LEAGUE_LABEL, type League } from "./leagues";
import { zoneRules } from "./standingsZones";
import { usesRecordOrder } from "./standingsOrder";
import { playerSport, sportProfile } from "./playerProfile";
import { isGameCalledOff } from "./gameStatus";
import { teamDisplayName } from "./teamName";

const NEXT = 3;
const TABLE_ROWS = 6;

export async function loadBlock(type: BlockType, params: Record<string, string>): Promise<BlockPayload | null> {
  switch (type) {
    case "live":
      return loadLive();
    case "team-next":
      return params.league === "cricket" ? loadCricketSide(params.team) : loadTeamNext(params.league as League, params.team);
    case "standings":
      return loadStandings(params.league as League, LEAGUE_LABEL[params.league as League], `/${params.league}/standings`);
    case "series-standings":
      return loadSeriesStandings(params.series);
    case "player-form":
      return loadPlayerForm(params.league as League, params.player);
    case "f1-drivers":
      return loadF1Drivers();
    case "bts":
      return loadBts();
  }
}

async function loadLive(): Promise<LiveBlockData> {
  const home = await getHomeData();
  return { games: home.liveGames.slice(0, 6), cricket: home.liveCricket.slice(0, 6), tennis: home.liveTennis.slice(0, 4) };
}

// pg hands back a Date for an uncast timestamp column (see memory: "pg dates are not strings"), so every
// date leaves here as an ISO string whatever the query did.
const iso = (d: string | Date) => new Date(d).toISOString();

function fixtureFromGame(league: League, g: GameRow, teamEspnId: string): FixtureLine {
  const home = g.home_team_espn_id === teamEspnId;
  const mine = home ? g.home_score : g.away_score;
  const theirs = home ? g.away_score : g.home_score;
  const played = g.completed && mine !== null && theirs !== null;
  return {
    id: g.espn_id,
    date: iso(g.date),
    opponent: teamDisplayName(home ? g.away_name : g.home_name),
    home,
    href: `/${league}/games/${g.espn_id}`,
    score: mine !== null && theirs !== null ? `${mine}-${theirs}` : null,
    result: played ? (mine! > theirs! ? "W" : mine! < theirs! ? "L" : "D") : null,
    live: g.status_state === "in",
    status: g.status_state === "in" ? g.status_detail : null,
    league,
  };
}

async function loadTeamNext(league: League, slug: string): Promise<TeamNextBlockData | null> {
  const team = await getTeamBySlug(league, slug);
  if (!team) return null;
  const seasons = await getTeamSeasons(league, team.espn_id);
  const games = seasons.length ? await getTeamGamesBySeason(league, team.espn_id, seasons[0]) : [];
  const last = games.find((g) => g.completed);
  const next = games
    .filter((g) => !g.completed && !isGameCalledOff(g))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, NEXT);
  return {
    team: { name: teamDisplayName(team.name), href: `/${league}/teams/${team.slug}`, color: team.color },
    last: last ? fixtureFromGame(league, last, team.espn_id) : null,
    next: next.map((g) => fixtureFromGame(league, g, team.espn_id)),
  };
}

function fixtureFromCricket(m: CricketSeriesMatch, sideId: string): FixtureLine {
  const home = m.home?.id === sideId;
  const mine = home ? m.home : m.away;
  const theirs = home ? m.away : m.home;
  return {
    id: m.espn_id,
    date: iso(m.date),
    opponent: theirs?.name ?? "TBC",
    home,
    href: m.scorecard_league ? `/${m.scorecard_league}/games/${m.espn_id}` : `/cricket/series/${m.series_espn_id}`,
    score: mine?.score ?? null,
    result: m.status_state === "post" ? (mine?.winner ? "W" : theirs?.winner ? "L" : "D") : null,
    live: m.status_state === "in",
    status: m.status_state === "in" ? m.status_summary : null,
    league: "cricket",
  };
}

async function loadCricketSide(sideId: string): Promise<TeamNextBlockData | null> {
  const series = (await getCricketSeriesWindow(14, 60)).filter((s) => s.teams.some((t) => t.id === sideId)).slice(0, 4);
  if (series.length === 0) return null;
  const side = series.flatMap((s) => s.teams).find((t) => t.id === sideId)!;
  const matches = (await Promise.all(series.map((s) => getCricketSeriesMatches(s.espn_id))))
    .flat()
    .filter((m) => m.home?.id === sideId || m.away?.id === sideId)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const played = matches.filter((m) => m.status_state === "post");
  const coming = matches.filter((m) => m.status_state !== "post").slice(0, NEXT);
  return {
    team: { name: side.name, href: `/cricket/series/${series[0].espn_id}`, color: null },
    last: played.length ? fixtureFromCricket(played[played.length - 1], sideId) : null,
    next: coming.map((m) => fixtureFromCricket(m, sideId)),
  };
}

function tableFrom(league: League, rows: StandingRow[], label: string, href: string): StandingsBlockData {
  const zone = zoneRules(league, rows.length);
  const record = usesRecordOrder(league);
  return {
    label,
    href,
    record,
    rows: rows.slice(0, TABLE_ROWS).map((r, i) => {
      const position = r.rank ?? i + 1;
      return {
        position,
        name: teamDisplayName(r.name),
        href: `/${league}/teams/${r.slug}`,
        played: r.wins + r.losses + (r.draws ?? 0) + (r.no_result ?? 0),
        figure: record ? `${r.wins}-${r.losses}` : String(r.points ?? 0),
        netRunRate: r.net_run_rate,
        zone: zone?.(position)?.cls ?? null,
        color: r.color,
      };
    }),
  };
}

async function loadStandings(league: League, label: string, href: string): Promise<StandingsBlockData | null> {
  const rows = await getStandings(league);
  return rows.length ? tableFrom(league, rows, label, href) : null;
}

async function loadSeriesStandings(seriesId: string): Promise<StandingsBlockData | null> {
  const series = await getCricketSeries(seriesId);
  if (!series?.league || !hasStandings(series.league)) return null;
  return loadStandings(series.league, series.name, `/cricket/series/${seriesId}`);
}

async function loadPlayerForm(league: League, slug: string): Promise<PlayerFormBlockData | null> {
  const player = await getPlayerBySlug(league, slug);
  if (!player) return null;
  const base = { player: { name: player.name, href: `/${league}/players/${player.slug}`, team: player.team_name }, games: [] as PlayerFormBlockData["games"] };
  if (isCricketLeague(league)) {
    const innings = await getCricketRecentInnings(league, player.espn_id, 5);
    const games = innings.map((r) => {
      const batted = r.runs !== null;
      const display = batted ? `${r.runs}${r.not_out ? "*" : ""}` : r.wickets !== null ? `${r.wickets}-${r.conceded ?? 0}` : "";
      return { id: r.game_espn_id, date: iso(r.date), opponent: teamDisplayName(r.opponent_name), value: r.runs, display, href: `/${league}/games/${r.game_espn_id}` };
    });
    const first = innings[0];
    return { ...base, statLabel: "Runs", verb: first && first.runs === null ? "took" : "made", games };
  }
  const sport = playerSport(league);
  if (!sport) return null;
  const log = await getPlayerLog(league, player.espn_id);
  const profile = sportProfile(sport, log);
  const rows = log.filter(profile.played).slice(0, 5);
  const label = profile.form.label;
  return {
    ...base,
    statLabel: label,
    verb: sport === "nba" ? "scored" : "had",
    games: rows.map((r) => {
      const value = profile.form.value(r);
      return {
        id: r.game_espn_id,
        date: iso(r.date),
        opponent: teamDisplayName(r.opponent_name),
        value,
        display: value === null ? "" : sport === "nba" ? String(value) : `${value} ${label.toLowerCase()}`,
        href: `/${league}/games/${r.game_espn_id}`,
      };
    }),
  };
}

async function loadF1Drivers(): Promise<F1DriversBlockData | null> {
  const [season] = await getF1Seasons();
  if (!season) return null;
  const [rows, calendar] = await Promise.all([getF1DriverStandings(season), getF1Calendar(season)]);
  const now = Date.now();
  const next = calendar.find((ev) => !ev.race_completed && f1RaceInstant(ev).getTime() > now) ?? null;
  return {
    season,
    rows: rows.slice(0, 5).map((r) => ({ position: r.position, name: r.name, href: `/f1/drivers/${r.slug}`, constructor: r.constructor_name, points: r.points })),
    nextRace: next
      ? { name: next.name, href: `/f1/events/${next.espn_id}`, raceIso: f1RaceInstant(next).toISOString(), circuitTimeZone: f1CircuitTimeZone(next.circuit_name, next.espn_id) }
      : null,
  };
}

function loadBts(): BtsBlockData {
  return {
    articles: listArticles()
      .slice(0, 3)
      .map((a) => {
        const art = articleArt(a);
        return { slug: a.slug, title: a.title, number: art.number, caption: art.caption, palette: art.palette, sport: art.sport, href: `/beyond-the-scoreline/${a.slug}` };
      }),
  };
}
```

Check two things against the codebase while writing it and fix the code, not the plan, if they differ: that `/f1/drivers/<slug>` is the driver page route (look under `src/app/f1/`), and that `getStandings` rows carry `rank` and `color` as the `StandingRow` interface says.

- [ ] **Step 5: Create `src/lib/editionContext.ts`**

```ts
// What the editions need from the server so the client never guesses an id: the
// international cricket sides with play coming, and the headline series that has a table.
import { unstable_cache } from "next/cache";
import { getCricketSeriesWindow } from "./cricketSeries";
import { hasStandings } from "./leagues";
import type { EditionContext } from "./editions";

export const getEditionContext = unstable_cache(
  async (): Promise<EditionContext> => {
    const window = await getCricketSeriesWindow(14, 60);
    const sides = new Map<string, string>();
    for (const s of window) {
      if (s.kind !== "international") continue;
      for (const t of s.teams) if (!sides.has(t.name)) sides.set(t.name, t.id);
    }
    const featured = window
      .filter((s) => s.featured && s.league !== null && hasStandings(s.league))
      .sort((a, b) => b.live_count - a.live_count || (a.start_date ?? "").localeCompare(b.start_date ?? ""))[0];
    return {
      cricketSides: [...sides].map(([name, id]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
      featuredCricketSeries: featured ? { id: featured.espn_id, name: featured.name } : null,
    };
  },
  ["edition-context"],
  { revalidate: 900 }
);
```

- [ ] **Step 6: Create the route `src/app/api/block/[type]/route.ts`**

```ts
// One homepage block. The URL fully describes it (type and parameters), so the edge
// caches one copy per distinct block for every visitor who has it; the lifetime is the
// block type's (lib/blockParams.ts). Bad input is a 400; an entity that no longer exists
// is `{ block: null }` with the same cache header, which the client shows as an empty block.
import { NextResponse } from "next/server";
import { cacheHeader, isBlockType, validateBlockParams } from "@/lib/blockParams";
import { loadBlock } from "@/lib/blockLoaders";

export const dynamic = "force-dynamic";

// A plain Request (not NextRequest) so the handler is callable from a test without the Next runtime.
export async function GET(req: Request, ctx: { params: Promise<{ type: string }> }) {
  const { type } = await ctx.params;
  if (!isBlockType(type)) return NextResponse.json({ error: "unknown block type" }, { status: 400 });
  const check = validateBlockParams(type, Object.fromEntries(new URL(req.url).searchParams.entries()));
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });
  const block = await loadBlock(type, check.params);
  return NextResponse.json({ block, fetchedAt: new Date().toISOString() }, { headers: { "Cache-Control": cacheHeader(type) } });
}
```

Read `node_modules/next/dist/docs/` on route handlers first; the handler takes a plain `Request` on purpose so the test can call it without the Next runtime.

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx tsx --test tests/block-route.test.ts`
Expected: PASS, 5 tests. If the `team-next` test fails on `score`, print `block.last` and check the home/away mapping in `fixtureFromGame`: the score must read from Arsenal's side ("2-1" for a 2-1 home win).

- [ ] **Step 8: Run the whole suite, types and lint**

Run: `npm test 2>&1 | tail -5 && npx tsc --noEmit && npm run lint`
Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add src/lib/queries.ts src/lib/blockLoaders.ts src/lib/editionContext.ts "src/app/api/block/[type]/route.ts" tests/block-route.test.ts && git commit -m "Serve homepage blocks from one cacheable route

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Follow and search mapping, the add palette and the client data hook

**Files:**
- Create: `src/lib/followBlocks.ts`, `src/lib/blockCatalogue.ts`, `src/components/home/useBlocksData.ts`, `src/components/home/useDragReorder.ts`, `src/components/home/BlockPalette.tsx`
- Test: `tests/follow-blocks.test.ts`

**Interfaces:**
- Produces: `followToBlock(item)`, `searchResultToBlock(result)`, `followsToBlocks(items)`; `paletteGroups(ctx): { name: string; blocks: HomeBlock[] }[]`; `useBlocksData(blocks): Record<string, BlockState>` with `BlockState = { status: "loading" | "ok" | "empty" | "error"; data: BlockPayload | null }`; `useDragReorder(ids, onReorder, onDrop)` → `{ handleProps(id), containerProps }`; `BlockPalette({ ctx, existing, onPick, onClose })`.

- [ ] **Step 1: Write the failing test**

Create `tests/follow-blocks.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { followToBlock, followsToBlocks, searchResultToBlock } from "../src/lib/followBlocks";
import { paletteGroups } from "../src/lib/blockCatalogue";

test("team, player and series follows become blocks; games and tennis tournaments do not", () => {
  assert.deepEqual(followToBlock({ kind: "team", league: "epl", refId: "arsenal", label: "Arsenal" }), {
    id: "team-next:epl:arsenal", type: "team-next", params: { league: "epl", team: "arsenal" }, label: "Arsenal: next three",
  });
  assert.deepEqual(followToBlock({ kind: "player", league: "ipl", refId: "virat-kohli", label: "Virat Kohli" }), {
    id: "player-form:ipl:virat-kohli", type: "player-form", params: { league: "ipl", player: "virat-kohli" }, label: "Virat Kohli: last five",
  });
  assert.equal(followToBlock({ kind: "series", league: "cricket", refId: "8604-2026", label: "T20 World Cup" })?.label, "T20 World Cup standings");
  assert.equal(followToBlock({ kind: "game", league: "epl", refId: "123", label: "Arsenal v Chelsea" }), null);
  assert.equal(followToBlock({ kind: "tournament", league: "tennis", refId: "1", label: "US Open" }), null);
});

test("search results map the same way and tours are skipped", () => {
  assert.equal(searchResultToBlock({ type: "player", league: "atp", name: "Carlos Alcaraz", slug: "carlos-alcaraz", subtitle: null })?.label, undefined);
  assert.equal(searchResultToBlock({ type: "team", league: "nba", name: "Boston Celtics", slug: "boston-celtics", subtitle: "BOS" })?.id, "team-next:nba:boston-celtics");
  assert.equal(searchResultToBlock({ type: "series", league: "cricket", name: "IPL 2026", slug: "8048-2026", subtitle: null })?.id, "series-standings:8048-2026");
});

test("followsToBlocks drops duplicates and keeps the follow order", () => {
  const out = followsToBlocks([
    { kind: "team", league: "epl", refId: "arsenal", label: "Arsenal" },
    { kind: "team", league: "epl", refId: "arsenal", label: "Arsenal" },
    { kind: "game", league: "epl", refId: "1", label: "x" },
    { kind: "player", league: "nba", refId: "luka-doncic", label: "Luka Dončić" },
  ]);
  assert.deepEqual(out.map((b) => b.id), ["team-next:epl:arsenal", "player-form:nba:luka-doncic"]);
});

test("the palette has four groups and uses the context for cricket sides and the featured series", () => {
  const groups = paletteGroups({ cricketSides: [{ id: "6", name: "India" }], featuredCricketSeries: { id: "8604-2026", name: "T20 World Cup" } });
  assert.deepEqual(groups.map((g) => g.name), ["Cricket", "Football", "US sports", "More"]);
  const cricket = groups[0].blocks.map((b) => b.label);
  assert.ok(cricket.includes("T20 World Cup standings"));
  assert.ok(cricket.includes("India: next three"));
  assert.ok(cricket.includes("IPL standings"));
  assert.deepEqual(groups[2].blocks.map((b) => b.label), ["NFL standings", "NBA standings"]);
  assert.deepEqual(groups[3].blocks.map((b) => b.label), ["Live in your blocks", "F1: driver standings", "Beyond the Scoreline"]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx --test tests/follow-blocks.test.ts`
Expected: FAIL, cannot find module `../src/lib/followBlocks`.

- [ ] **Step 3: Create `src/lib/followBlocks.ts`**

```ts
// Turns what the site already knows about a visitor (follows) and what they search for
// into blocks. Follows of games and tennis tournaments have no block type yet.
import { blockId, type HomeBlock } from "./blockTypes";
import type { FollowItem } from "./follow";
import { isLeague } from "./leagues";
import type { SearchResult } from "./queries";

type FollowLike = Pick<FollowItem, "kind" | "league" | "refId" | "label">;

function make(type: HomeBlock["type"], params: Record<string, string>, label: string): HomeBlock {
  return { id: blockId(type, params), type, params, label };
}

export function followToBlock(item: FollowLike): HomeBlock | null {
  switch (item.kind) {
    case "team":
      return isLeague(item.league) ? make("team-next", { league: item.league, team: item.refId }, `${item.label}: next three`) : null;
    case "player":
      return isLeague(item.league) ? make("player-form", { league: item.league, player: item.refId }, `${item.label}: last five`) : null;
    case "series":
      return make("series-standings", { series: item.refId }, `${item.label} standings`);
    default:
      return null;
  }
}

export function searchResultToBlock(r: Pick<SearchResult, "type" | "league" | "name" | "slug">): HomeBlock | null {
  return followToBlock({ kind: r.type, league: r.league, refId: r.slug, label: r.name });
}

/** Follows as blocks in the order given, duplicates dropped. */
export function followsToBlocks(items: FollowLike[]): HomeBlock[] {
  const out: HomeBlock[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const b = followToBlock(item);
    if (b && !seen.has(b.id)) {
      seen.add(b.id);
      out.push(b);
    }
  }
  return out;
}
```

- [ ] **Step 4: Create `src/lib/blockCatalogue.ts`**

```ts
// The "Add more blocks" palette, grouped by sport. Phase one offers only block types
// the route can serve; the chips the mockup showed for scoreboards, top scorers and
// rankings wait for their block types.
import { btsBlock, cricketSideBlock, f1Block, liveBlock, seriesStandingsBlock, standingsBlock, type EditionContext } from "./editions";
import type { HomeBlock } from "./blockTypes";

export interface PaletteGroup {
  name: string;
  blocks: HomeBlock[];
}

export function paletteGroups(ctx: EditionContext): PaletteGroup[] {
  const featured = ctx.featuredCricketSeries ? [seriesStandingsBlock(ctx.featuredCricketSeries)] : [];
  return [
    { name: "Cricket", blocks: [...featured, standingsBlock("ipl"), ...ctx.cricketSides.slice(0, 10).map(cricketSideBlock)] },
    { name: "Football", blocks: [standingsBlock("epl"), standingsBlock("ucl"), standingsBlock("laliga"), standingsBlock("bundesliga"), standingsBlock("seriea")] },
    { name: "US sports", blocks: [standingsBlock("nfl"), standingsBlock("nba")] },
    { name: "More", blocks: [liveBlock(), f1Block(), btsBlock()] },
  ].map((g) => ({ ...g, blocks: dedupe(g.blocks) }));
}

function dedupe(blocks: HomeBlock[]): HomeBlock[] {
  const seen = new Set<string>();
  return blocks.filter((b) => (seen.has(b.id) ? false : (seen.add(b.id), true)));
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx tsx --test tests/follow-blocks.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 6: Create the client data hook `src/components/home/useBlocksData.ts`**

```ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BlockPayload, BlockResponse, HomeBlock } from "@/lib/blockTypes";

export type BlockState = { status: "loading" | "ok" | "empty" | "error"; data: BlockPayload | null };

const RETRY_MS = 5000;
const LIVE_REFRESH_MS = 30000;

export function blockUrl(block: HomeBlock): string {
  const qs = new URLSearchParams(block.params).toString();
  return `/api/block/${block.type}${qs ? `?${qs}` : ""}`;
}

/** Fetches every block of the setup once, retries a failure once after five seconds, keeps the last
 * good payload through later failures, and refreshes live blocks every 30 seconds while the tab is visible. */
export function useBlocksData(blocks: HomeBlock[]): Record<string, BlockState> {
  const [states, setStates] = useState<Record<string, BlockState>>({});
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;

  const load = useCallback(async (block: HomeBlock, retry: boolean) => {
    try {
      const res = await fetch(blockUrl(block));
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as BlockResponse;
      setStates((s) => ({ ...s, [block.id]: { status: body.block ? "ok" : "empty", data: body.block } }));
    } catch {
      setStates((s) => {
        const prev = s[block.id];
        return { ...s, [block.id]: { status: prev?.data ? "ok" : "error", data: prev?.data ?? null } };
      });
      if (retry) window.setTimeout(() => load(block, false), RETRY_MS);
    }
  }, []);

  const ids = blocks.map((b) => b.id).join("|");
  useEffect(() => {
    for (const block of blocksRef.current) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStates((s) => (s[block.id] ? s : { ...s, [block.id]: { status: "loading", data: null } }));
      load(block, true);
    }
  }, [ids, load]);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      for (const block of blocksRef.current) if (block.type === "live") load(block, false);
    };
    const id = window.setInterval(tick, LIVE_REFRESH_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [load]);

  return states;
}
```

- [ ] **Step 7: Create the drag hook `src/components/home/useDragReorder.ts`**

```ts
"use client";

import { useCallback, useRef } from "react";

/** Pointer-event reorder of a list of elements carrying `data-drag-id`. The handle starts the drag;
 * moving over another item moves the dragged one to that item's place; lifting the pointer commits. */
export function useDragReorder(ids: string[], onReorder: (ids: string[]) => void, onDrop: () => void) {
  const dragging = useRef<string | null>(null);
  const order = useRef(ids);
  order.current = ids;

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const from = dragging.current;
      if (!from) return;
      const over = (document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-drag-id]") as HTMLElement | null)?.dataset.dragId;
      if (!over || over === from) return;
      const next = order.current.filter((i) => i !== from);
      next.splice(order.current.indexOf(over), 0, from);
      onReorder(next);
    },
    [onReorder]
  );

  const end = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = null;
    document.body.style.userSelect = "";
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
    onDrop();
  }, [onDrop, onPointerMove]);

  const handleProps = (id: string) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      dragging.current = id;
      document.body.style.userSelect = "none";
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", end);
      window.addEventListener("pointercancel", end);
    },
    style: { touchAction: "none" as const, cursor: "grab" },
  });

  return { handleProps };
}
```

- [ ] **Step 8: Create `src/components/home/BlockPalette.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { paletteGroups } from "@/lib/blockCatalogue";
import type { EditionContext } from "@/lib/editions";
import type { HomeBlock } from "@/lib/blockTypes";
import { searchResultToBlock } from "@/lib/followBlocks";
import type { SearchResult } from "@/lib/queries";

// The "Add more blocks" palette: grouped chips plus a search box for any team, player or
// competition. `existing` chips are shown ticked and do nothing. Used inside the builder
// and, inside a dialog, from the built page's "+ Add another block".
export function BlockPalette({ ctx, existing, onPick, dark = true }: { ctx: EditionContext; existing: Set<string>; onPick: (block: HomeBlock) => void; dark?: boolean }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<HomeBlock[]>([]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults([]);
      return;
    }
    const id = window.setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((d: { results: SearchResult[] }) => setResults(d.results.map(searchResultToBlock).filter((b): b is HomeBlock => b !== null).slice(0, 6)))
        .catch(() => setResults([]));
    }, 250);
    return () => window.clearTimeout(id);
  }, [query]);

  const chip = (b: HomeBlock) => {
    const on = existing.has(b.id);
    return (
      <button
        key={b.id}
        type="button"
        disabled={on}
        onClick={() => onPick(b)}
        aria-pressed={on}
        className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-bold transition ${
          on
            ? "border-transparent bg-[var(--sig)] text-[var(--sig-on)]"
            : dark
              ? "border-[var(--mast-line)] text-[var(--mast-text)] hover:border-[var(--sig)] hover:text-[var(--sig)]"
              : "border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:border-[var(--sig-ink)] hover:text-[var(--sig-ink)]"
        }`}
      >
        {on ? "✓" : "+"} {b.label}
      </button>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <p className={`eyebrow ${dark ? "text-[var(--mast-muted)]" : "text-[var(--text-faint)]"}`}>Add more blocks</p>
      {paletteGroups(ctx).map((g) => (
        <div key={g.name} className="flex gap-3">
          <span className={`w-[74px] shrink-0 pt-2 text-[11px] font-bold uppercase tracking-[0.12em] ${dark ? "text-[var(--mast-muted)]" : "text-[var(--text-faint)]"}`}>{g.name}</span>
          <div className="flex flex-wrap gap-2">{g.blocks.map(chip)}</div>
        </div>
      ))}
      <label className="flex flex-col gap-2">
        <span className="sr-only">Type a team, player or competition</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type a team, player or competition"
          className={`h-11 rounded-xl border px-4 text-[14px] outline-none focus:border-[var(--sig)] ${
            dark ? "border-[var(--mast-line)] bg-[var(--mast-2)] text-[var(--mast-text)] placeholder:text-[var(--mast-muted)]" : "border-[var(--border)] bg-[var(--surface)] text-[var(--text)]"
          }`}
        />
      </label>
      {results.length > 0 && <div className="flex flex-wrap gap-2">{results.map(chip)}</div>}
    </div>
  );
}
```

- [ ] **Step 9: Type-check and lint, then commit**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

```bash
git add src/lib/followBlocks.ts src/lib/blockCatalogue.ts src/components/home tests/follow-blocks.test.ts && git commit -m "Add the block palette, follow mapping and the client block hooks

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Block frame and the seven renderers

**Files:**
- Create: `src/components/home/BlockFrame.tsx`, `src/components/home/blocks/LiveBlock.tsx`, `TeamNextBlock.tsx`, `StandingsBlock.tsx`, `PlayerFormBlock.tsx`, `F1DriversBlock.tsx`, `BtsBlock.tsx`, `src/components/home/blocks/index.tsx`

**Interfaces:**
- Consumes: payload types (Task 3), `BlockState` (Task 8), `GameCard`, `SeriesMatchList`, `TennisMatchLine`, `LocalTime`.
- Produces: `BlockFrame({ block, index, count, state, onRemove, onMove, handleProps, children })`; `renderBlock(block, state): ReactNode` from `blocks/index.tsx`.

- [ ] **Step 1: Create `src/components/home/BlockFrame.tsx`**

```tsx
"use client";

import type { ReactNode } from "react";
import type { HomeBlock } from "@/lib/blockTypes";
import type { BlockState } from "./useBlocksData";

const TAG: Record<HomeBlock["type"], string> = {
  live: "Live",
  "team-next": "Fixtures",
  standings: "Table",
  "series-standings": "Cricket",
  "player-form": "Last 5",
  "f1-drivers": "Formula 1",
  bts: "Desk",
};

// One block's chrome on the built page: drag handle, name in the display face, a tag, the
// move buttons (always visible on phones, on focus elsewhere) and the remove control.
export function BlockFrame({
  block,
  index,
  count,
  state,
  onRemove,
  onMove,
  handleProps,
  children,
}: {
  block: HomeBlock;
  index: number;
  count: number;
  state: BlockState | undefined;
  onRemove: () => void;
  onMove: (delta: -1 | 1) => void;
  handleProps: React.HTMLAttributes<HTMLButtonElement>;
  children: ReactNode;
}) {
  const liveCount = block.type === "live" && state?.data ? (state.data as { games: unknown[]; cricket: unknown[]; tennis: unknown[] }) : null;
  const n = liveCount ? liveCount.games.length + liveCount.cricket.length + liveCount.tennis.length : 0;
  return (
    <section
      id={`block-${block.id}`}
      data-drag-id={block.id}
      className={`card group flex flex-col gap-3 p-4 ${block.type === "live" ? "md:col-span-2" : ""}`}
      aria-label={block.label}
    >
      <header className="flex items-center gap-2">
        <button type="button" {...handleProps} aria-label={`Drag to move ${block.label}`} className="text-[var(--text-faint)] hover:text-[var(--text)]">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" /><circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" /><circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" />
          </svg>
        </button>
        <h3 className="display flex-1 truncate text-[20px] text-[var(--text)]">{block.label}</h3>
        {block.type === "live" && n > 0 ? (
          <span className="pill pill-live"><span className="live-dot" />{n}</span>
        ) : (
          <span className="rounded-full bg-[var(--sig-soft)] px-2 py-0.5 text-[10px] font-bold text-[var(--sig-ink)]">{TAG[block.type]}</span>
        )}
        <span className="flex gap-0.5 opacity-100 md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
          <button type="button" onClick={() => onMove(-1)} disabled={index === 0} aria-label={`Move ${block.label} up`} className="rounded px-1 text-[var(--text-faint)] hover:text-[var(--text)] disabled:opacity-30">↑</button>
          <button type="button" onClick={() => onMove(1)} disabled={index === count - 1} aria-label={`Move ${block.label} down`} className="rounded px-1 text-[var(--text-faint)] hover:text-[var(--text)] disabled:opacity-30">↓</button>
        </span>
        <button type="button" onClick={onRemove} aria-label={`Remove ${block.label}`} className="rounded px-1 text-[var(--text-faint)] hover:text-[var(--live)]">×</button>
      </header>
      {state?.status === "loading" && <div className="h-24 animate-pulse rounded-lg bg-[var(--surface-muted)]" aria-hidden />}
      {state?.status === "error" && <p className="text-sm text-[var(--text-muted)]">Couldn&apos;t load, retrying.</p>}
      {state?.status === "empty" && <p className="text-sm text-[var(--text-muted)]">Nothing to show yet.</p>}
      {state?.status === "ok" && children}
    </section>
  );
}
```

- [ ] **Step 2: Create the renderers**

`src/components/home/blocks/LiveBlock.tsx`:

```tsx
import Link from "next/link";
import { GameCard } from "@/components/GameCard";
import { SeriesMatchList } from "@/components/CricketSeries";
import { TennisMatchLine } from "@/components/TennisScores";
import type { LiveBlockData } from "@/lib/blockTypes";

export function LiveBlock({ data }: { data: LiveBlockData }) {
  if (data.games.length + data.cricket.length + data.tennis.length === 0) {
    return <p className="text-sm text-[var(--text-muted)]">Nothing in play right now. <Link href="#live" className="font-semibold text-[var(--sig-ink)]">Next fixtures below.</Link></p>;
  }
  return (
    <div className="flex flex-col gap-3">
      {data.games.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.games.map((g) => <GameCard key={`${g.league}-${g.espn_id}`} league={g.league} game={g} />)}
        </div>
      )}
      {data.cricket.length > 0 && <SeriesMatchList matches={data.cricket} showSeries />}
      {data.tennis.length > 0 && (
        <div className="card divide-y divide-[var(--border)] overflow-hidden">
          {data.tennis.map((m) => <TennisMatchLine key={m.espn_id} match={m} showTournament />)}
        </div>
      )}
    </div>
  );
}
```

`src/components/home/blocks/TeamNextBlock.tsx`:

```tsx
import Link from "next/link";
import { LocalTime } from "@/components/LocalTime";
import type { FixtureLine, TeamNextBlockData } from "@/lib/blockTypes";

function Line({ f, team }: { f: FixtureLine; team: string }) {
  const sides = f.home ? `${team} v ${f.opponent}` : `${f.opponent} v ${team}`;
  return (
    <Link href={f.href} className="flex items-center justify-between gap-3 py-2 text-sm hover:text-[var(--sig-ink)]">
      <span className="flex items-center gap-2 truncate">
        {f.result && <span className={`result-badge result-${f.result.toLowerCase()}`}>{f.result}</span>}
        {f.live && <span className="live-dot" />}
        <span className="truncate font-semibold">{sides}</span>
      </span>
      <span className="shrink-0 text-[var(--text-muted)]">
        {f.score ?? (f.live ? f.status : <LocalTime iso={f.date} format="datetime" />)}
      </span>
    </Link>
  );
}

export function TeamNextBlock({ data }: { data: TeamNextBlockData }) {
  return (
    <div className="divide-y divide-[var(--border)]">
      {data.last && (
        <div className="pb-1">
          <p className="eyebrow text-[var(--text-faint)]">Last</p>
          <Line f={data.last} team={data.team.name} />
        </div>
      )}
      <div className="pt-1">
        <p className="eyebrow text-[var(--text-faint)]">Next</p>
        {data.next.length === 0 ? <p className="py-2 text-sm text-[var(--text-muted)]">No fixtures listed yet.</p> : data.next.map((f) => <Line key={f.id} f={f} team={data.team.name} />)}
      </div>
      <Link href={data.team.href} className="block pt-2 text-sm font-semibold text-[var(--sig-ink)]">All fixtures →</Link>
    </div>
  );
}
```

`src/components/home/blocks/StandingsBlock.tsx`:

```tsx
import Link from "next/link";
import type { StandingsBlockData } from "@/lib/blockTypes";

export function StandingsBlock({ data }: { data: StandingsBlockData }) {
  return (
    <div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--text-faint)]">
            <th className="w-6 py-1 text-left" aria-label="Position" />
            <th className="py-1 text-left font-bold">Team</th>
            <th className="py-1 text-right font-bold">P</th>
            {data.rows.some((r) => r.netRunRate) && <th className="py-1 text-right font-bold">NRR</th>}
            <th className="py-1 text-right font-bold">{data.record ? "W-L" : "Pts"}</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r) => (
            <tr key={r.href} className="border-t border-[var(--border)]">
              <td className="py-1.5 pr-1 text-[var(--text-muted)]">
                <span className="flex items-center gap-1.5">
                  <span className={`zone-marker ${r.zone ?? ""}`} aria-hidden />
                  {r.position}
                </span>
              </td>
              <td className="py-1.5"><Link href={r.href} className="font-semibold hover:text-[var(--sig-ink)]">{r.name}</Link></td>
              <td className="py-1.5 text-right text-[var(--text-muted)]">{r.played}</td>
              {data.rows.some((x) => x.netRunRate) && <td className="py-1.5 text-right text-[var(--text-muted)]">{r.netRunRate ?? ""}</td>}
              <td className="py-1.5 text-right font-bold">{r.figure}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Link href={data.href} className="mt-2 block text-sm font-semibold text-[var(--sig-ink)]">Full table →</Link>
    </div>
  );
}
```

Check `.zone-marker` in `globals.css` (it exists) renders a small bar when combined with `.zone-N`; if it needs a wrapper class that the standings table uses, copy that wrapper here.

`src/components/home/blocks/PlayerFormBlock.tsx`:

```tsx
import Link from "next/link";
import type { PlayerFormBlockData } from "@/lib/blockTypes";

export function PlayerFormBlock({ data }: { data: PlayerFormBlockData }) {
  const values = data.games.map((g) => g.value ?? 0);
  const max = Math.max(1, ...values);
  const latest = data.games[0];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end gap-4">
        <div>
          <p className="display text-[44px] leading-none text-[var(--sig-ink)]">{latest?.display || "–"}</p>
          <p className="text-xs text-[var(--text-muted)]">{latest ? `v ${latest.opponent}` : "No recent games"}</p>
        </div>
        <div className="flex h-12 flex-1 items-end gap-1.5" aria-label={`${data.statLabel}, last ${data.games.length} games, newest first`}>
          {[...data.games].reverse().map((g, i, arr) => (
            <Link
              key={g.id}
              href={g.href}
              title={`${g.display} v ${g.opponent}`}
              style={{ height: `${Math.max(8, ((g.value ?? 0) / max) * 100)}%` }}
              className={`flex-1 rounded-sm ${i === arr.length - 1 ? "bg-[var(--sig-ink)]" : "bg-[var(--sig)]"}`}
            />
          ))}
        </div>
      </div>
      <Link href={data.player.href} className="text-sm font-semibold text-[var(--sig-ink)]">{data.player.name}&apos;s page →</Link>
    </div>
  );
}
```

`src/components/home/blocks/F1DriversBlock.tsx`:

```tsx
import Link from "next/link";
import { LocalTime } from "@/components/LocalTime";
import type { F1DriversBlockData } from "@/lib/blockTypes";

export function F1DriversBlock({ data }: { data: F1DriversBlockData }) {
  return (
    <div className="flex flex-col gap-2">
      <ol className="divide-y divide-[var(--border)] text-sm">
        {data.rows.map((r) => (
          <li key={r.href} className="flex items-center gap-3 py-1.5">
            <span className="w-4 text-[var(--text-muted)]">{r.position ?? "–"}</span>
            <Link href={r.href} className="flex-1 truncate font-semibold hover:text-[var(--sig-ink)]">{r.name}</Link>
            <span className="truncate text-[var(--text-muted)]">{r.constructor ?? ""}</span>
            <span className="w-10 text-right font-bold">{r.points ?? 0}</span>
          </li>
        ))}
      </ol>
      {data.nextRace && (
        <Link href={data.nextRace.href} className="flex items-center justify-between rounded-lg bg-[var(--sig-soft)] px-3 py-2 text-sm">
          <span className="font-semibold text-[var(--sig-ink)]">{data.nextRace.name}</span>
          <LocalTime iso={data.nextRace.raceIso} format="datetime" serverTimeZone={data.nextRace.circuitTimeZone} className="text-[var(--text-muted)]" />
        </Link>
      )}
    </div>
  );
}
```

`src/components/home/blocks/BtsBlock.tsx`:

```tsx
import Link from "next/link";
import type { BtsBlockData } from "@/lib/blockTypes";

export function BtsBlock({ data }: { data: BtsBlockData }) {
  return (
    <div className="flex flex-col gap-2">
      {data.articles.map((a) => (
        <Link key={a.slug} href={a.href} className="group flex items-center gap-3 rounded-lg border border-[var(--border)] p-2 hover:border-[var(--sig-ink)]">
          <span className={`art art-${a.palette} flex h-14 w-16 shrink-0 items-center justify-center rounded-md`} aria-hidden>
            <span className="display relative text-[22px] leading-none">{a.number}</span>
          </span>
          <span className="min-w-0">
            <span className="eyebrow block text-[var(--sig-ink)]">{a.sport}</span>
            <span className="display block truncate text-[18px] text-[var(--text)] group-hover:text-[var(--sig-ink)]">{a.title}</span>
          </span>
        </Link>
      ))}
      <Link href="/beyond-the-scoreline" className="text-sm font-semibold text-[var(--sig-ink)]">All articles →</Link>
    </div>
  );
}
```

`src/components/home/blocks/index.tsx`:

```tsx
import type { ReactNode } from "react";
import type { BtsBlockData, F1DriversBlockData, HomeBlock, LiveBlockData, PlayerFormBlockData, StandingsBlockData, TeamNextBlockData } from "@/lib/blockTypes";
import type { BlockState } from "../useBlocksData";
import { LiveBlock } from "./LiveBlock";
import { TeamNextBlock } from "./TeamNextBlock";
import { StandingsBlock } from "./StandingsBlock";
import { PlayerFormBlock } from "./PlayerFormBlock";
import { F1DriversBlock } from "./F1DriversBlock";
import { BtsBlock } from "./BtsBlock";

/** The block's body for its payload; the frame handles loading, empty and error states. */
export function renderBlock(block: HomeBlock, state: BlockState | undefined): ReactNode {
  const data = state?.data;
  if (!data) return null;
  switch (block.type) {
    case "live":
      return <LiveBlock data={data as LiveBlockData} />;
    case "team-next":
      return <TeamNextBlock data={data as TeamNextBlockData} />;
    case "standings":
    case "series-standings":
      return <StandingsBlock data={data as StandingsBlockData} />;
    case "player-form":
      return <PlayerFormBlock data={data as PlayerFormBlockData} />;
    case "f1-drivers":
      return <F1DriversBlock data={data as F1DriversBlockData} />;
    case "bts":
      return <BtsBlock data={data as BtsBlockData} />;
  }
}
```

- [ ] **Step 3: Type-check and lint, then commit**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean. `GameCard`, `SeriesMatchList` and `TennisMatchLine` are server-safe components already used by `HomeLive`; if any of them turns out to need a client boundary, add `"use client"` to the renderer file that imports it.

```bash
git add src/components/home && git commit -m "Draw the seven homepage block types

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: The builder, the built state, the collapsed bar and the page

**Files:**
- Create: `src/components/home/HomeBuilder.tsx`, `src/components/home/BuiltHero.tsx`, `src/components/home/HomeBlocks.tsx`, `src/components/home/CollapsedBar.tsx`
- Modify: `src/app/page.tsx` (hero and the sections after it), `src/app/layout.tsx:66-71`, `src/app/globals.css` (append)
- Delete: `src/components/MyFollows.tsx`, `src/app/api/follows/games/route.ts`

**Interfaces:**
- Consumes: everything from Tasks 4, 5, 6, 8, 9; `getEditionContext` (Task 7).
- Produces: `HomeBuilder({ ctx, mode?, initial?, onClose? })`, `HomeBlocks({ ctx })`, `CollapsedBar()`, `BuiltHero({ setup, headline, sub, liveCount, onEdit })`.

- [ ] **Step 1: Create `src/components/home/HomeBuilder.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { editionFor, editionNote, editionToggleLabel, startingBlocks, type Edition, type EditionContext } from "@/lib/editions";
import { followsToBlocks } from "@/lib/followBlocks";
import { getFollows } from "@/lib/follow";
import type { HomeBlock } from "@/lib/blockTypes";
import { MAX_BLOCKS, newSetup, readSetup, writeDeclined, writeSetup, SETUP_EVENT, type HomeSetup } from "@/lib/homeSetup";
import { BlockPalette } from "./BlockPalette";
import { useDragReorder } from "./useDragReorder";

// The hero on a first visit: the product claim, a draft of blocks for the visitor's
// country (plus anything they already follow), the add palette, and one button that
// makes it their homepage. In `edit` mode the same card edits an existing setup.
export function HomeBuilder({ ctx, mode = "first", initial, onClose }: { ctx: EditionContext; mode?: "first" | "edit"; initial?: HomeSetup; onClose?: () => void }) {
  const [mounted, setMounted] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [country, setCountry] = useState<string | null>(initial?.country ?? null);
  const [edition, setEdition] = useState<Edition>(editionFor(initial?.country ?? null));
  const [blank, setBlank] = useState(initial?.edition === "blank");
  const [blocks, setBlocks] = useState<HomeBlock[]>(initial?.blocks ?? []);
  const [saveError, setSaveError] = useState(false);

  // First visit: nothing to show if this browser already has a setup or declined; the pre-paint
  // script hides the hero before this runs, this keeps the DOM consistent afterwards.
  useEffect(() => {
    if (mode !== "first") return;
    const check = () => setHidden(readSetup() !== null);
    check();
    window.addEventListener(SETUP_EVENT, check);
    return () => window.removeEventListener(SETUP_EVENT, check);
  }, [mode]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    if (mode !== "first") return;
    fetch("/api/region")
      .then((r) => r.json())
      .then((d: { country?: string | null }) => {
        const ed = editionFor(d.country ?? null);
        setCountry(d.country ?? null);
        setEdition(ed);
        setBlocks(draft(ed, ctx));
      })
      .catch(() => setBlocks(draft(editionFor(null), ctx)));
  }, [mode, ctx]);

  const chosen = new Set(blocks.map((b) => b.id));
  const add = (b: HomeBlock) => setBlocks((list) => (list.some((x) => x.id === b.id) || list.length >= MAX_BLOCKS ? list : [...list, b]));
  const remove = (id: string) => setBlocks((list) => list.filter((b) => b.id !== id));
  const { handleProps } = useDragReorder(
    blocks.map((b) => b.id),
    (ids) => setBlocks((list) => ids.map((id) => list.find((b) => b.id === id)!).filter(Boolean)),
    () => {}
  );

  const save = () => {
    const setup = mode === "edit" && initial ? { ...initial, blocks } : newSetup(blank ? "blank" : edition.key, country, blocks);
    setSaveError(!writeSetup(setup));
    onClose?.();
  };
  const decline = () => {
    writeDeclined();
  };
  const useEdition = (useBlank: boolean) => {
    setBlank(useBlank);
    setBlocks(useBlank ? [] : draft(edition, ctx));
  };

  if (hidden) return null;

  const card = (
    <div className={`flex flex-col gap-5 rounded-2xl border border-[var(--mast-line)] bg-[color-mix(in_srgb,var(--mast-2)_80%,transparent)] p-5 sm:p-6 ${mode === "edit" ? "band text-[var(--mast-text)]" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="display text-[28px]">{mode === "edit" ? "Edit your blocks" : "We started one for you"}</p>
          {mode === "first" && <p className="text-[13px] text-[var(--mast-muted)]">{mounted ? editionNote(edition) : "Finding your picks…"}</p>}
        </div>
        {mode === "first" && (
          <div className="flex gap-2">
            <button type="button" onClick={() => useEdition(false)} aria-pressed={!blank} className={`h-9 rounded-full border px-3 text-[12px] font-bold ${!blank ? "border-[var(--sig)] text-[var(--sig)]" : "border-[var(--mast-line)] text-[var(--mast-muted)]"}`}>{editionToggleLabel(edition)}</button>
            <button type="button" onClick={() => useEdition(true)} aria-pressed={blank} className={`h-9 rounded-full border px-3 text-[12px] font-bold ${blank ? "border-[var(--sig)] text-[var(--sig)]" : "border-[var(--mast-line)] text-[var(--mast-muted)]"}`}>Start blank</button>
          </div>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        <div className="flex flex-col gap-5 lg:col-span-3">
          <ul className="flex flex-wrap gap-2" aria-label="Your blocks">
            {blocks.map((b) => (
              <li key={b.id}>
                <span className="inline-flex h-9 items-center gap-2 rounded-full bg-[var(--sig)] pl-3.5 pr-2 text-[13px] font-bold text-[var(--sig-on)]">
                  {b.label}
                  <button type="button" onClick={() => remove(b.id)} aria-label={`Remove ${b.label}`} className="flex h-5 w-5 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--sig-on)_12%,transparent)]">×</button>
                </span>
              </li>
            ))}
            {blocks.length === 0 && mounted && <li className="text-[13px] text-[var(--mast-muted)]">No blocks yet. Add some below.</li>}
          </ul>
          <BlockPalette ctx={ctx} existing={chosen} onPick={add} />
        </div>
        <div className="rounded-xl bg-[var(--bg)] p-3 text-[var(--text)] lg:col-span-2">
          <p className="eyebrow mb-2 text-[var(--text-faint)]">Preview · {blocks.length} blocks · drag to reorder</p>
          <ol className="flex flex-col gap-1.5">
            {blocks.map((b) => (
              <li key={b.id} data-drag-id={b.id} className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[12px] font-bold">
                <button type="button" {...handleProps(b.id)} aria-label={`Drag to move ${b.label}`} className="text-[var(--text-faint)]">⋮⋮</button>
                <span className="truncate">{b.label}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={blocks.length === 0} className="h-12 rounded-xl bg-[var(--sig)] px-6 text-[15px] font-extrabold text-[var(--sig-on)] disabled:opacity-50">
          {mode === "edit" ? "Save my blocks" : "Make this my homepage"}
        </button>
        {mode === "first" ? (
          <button type="button" onClick={decline} className="h-12 rounded-xl border border-[var(--mast-line)] px-4 text-[14px] font-bold text-[var(--mast-text)]">I&apos;ll decide later</button>
        ) : (
          <button type="button" onClick={onClose} className="h-12 rounded-xl border border-[var(--mast-line)] px-4 text-[14px] font-bold">Cancel</button>
        )}
        <span className="ml-auto text-[12px] text-[var(--mast-muted)]">{saveError ? "Couldn't save on this device" : "No sign-up. Saved in this browser only."}</span>
      </div>
    </div>
  );

  if (mode === "edit") return card;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="eyebrow">Your homepage, your rules</p>
        <h1 className="display mt-2 max-w-4xl text-[44px] leading-[0.95] sm:text-[64px] lg:text-[84px]">
          Build the sports page <span className="text-[var(--sig)]">you keep looking for.</span>
        </h1>
        <p className="mt-4 max-w-2xl text-[16px] text-[var(--mast-muted)] sm:text-[18px]">
          Choose what sits here: live scores, tables, a player&apos;s form, your team&apos;s next three. It stays this way every time you come back.
        </p>
      </div>
      {card}
    </div>
  );
}

function draft(edition: Edition, ctx: EditionContext): HomeBlock[] {
  const start = startingBlocks(edition, ctx);
  const seen = new Set(start.map((b) => b.id));
  const follows = followsToBlocks(getFollows()).filter((b) => !seen.has(b.id));
  return [...start, ...follows].slice(0, MAX_BLOCKS);
}
```

- [ ] **Step 2: Create `src/components/home/BuiltHero.tsx`**

```tsx
"use client";

import type { HomeSetup } from "@/lib/homeSetup";
import { SendToPhone } from "./SendToPhone";

export function BuiltHero({ setup, headline, sub, liveCount, onEdit }: { setup: HomeSetup; headline: string; sub: string; liveCount: number; onEdit: () => void }) {
  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  return (
    <section className="band band-hero bleed -mt-6 py-8 sm:py-10">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-3">
          <p className="eyebrow">Your homepage · {today} · {setup.blocks.length} blocks</p>
          <h1 className="display max-w-4xl text-[36px] leading-[0.95] sm:text-[52px] lg:text-[64px]">{headline}</h1>
          {sub && <p className="max-w-2xl text-[15px] text-[var(--mast-muted)] sm:text-[16px]">{sub}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {liveCount > 0 && (
            <a href="#block-live" className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--sig)] px-3.5 text-[13px] font-extrabold text-[var(--sig-on)]">
              <span className="live-dot bg-[var(--sig-on)]!" aria-hidden />Jump to live ({liveCount})
            </a>
          )}
          <button type="button" onClick={onEdit} className="inline-flex h-10 items-center rounded-lg border border-[var(--mast-line)] px-3.5 text-[13px] font-bold text-[var(--mast-text)]">Edit blocks</button>
          <SendToPhone setup={setup} />
        </div>
      </div>
    </section>
  );
}
```

`SendToPhone` is written in Task 11; until then create `src/components/home/SendToPhone.tsx` as a stub that renders `null` and takes `{ setup: HomeSetup }`, so this task type-checks:

```tsx
"use client";
import type { HomeSetup } from "@/lib/homeSetup";
export function SendToPhone({ setup }: { setup: HomeSetup }) {
  void setup;
  return null;
}
```

- [ ] **Step 3: Create `src/components/home/HomeBlocks.tsx`**

```tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EditionContext } from "@/lib/editions";
import type { HomeBlock } from "@/lib/blockTypes";
import { heroLine, type LoadedBlock } from "@/lib/homeHeroLine";
import { addBlock, clearSetup, isSetup, moveBlock, readSetup, removeBlock, reorderBlocks, SETUP_EVENT, writeSetup, type HomeSetup } from "@/lib/homeSetup";
import { BlockFrame } from "./BlockFrame";
import { BlockPalette } from "./BlockPalette";
import { BuiltHero } from "./BuiltHero";
import { HomeBuilder } from "./HomeBuilder";
import { renderBlock } from "./blocks";
import { useBlocksData } from "./useBlocksData";
import { useDragReorder } from "./useDragReorder";

// The built homepage: reads the setup saved in this browser, fetches its blocks, writes the
// hero from them and lets the visitor reorder, remove and add. Renders nothing on the server
// and nothing when there is no setup; the pre-paint script in app/layout.tsx shows a
// skeleton in the hero's place until this mounts.
export function HomeBlocks({ ctx }: { ctx: EditionContext }) {
  const [setup, setSetup] = useState<HomeSetup | null>(null);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const setupRef = useRef(setup);
  setupRef.current = setup;

  useEffect(() => {
    const read = () => {
      const s = readSetup();
      setSetup(isSetup(s) ? s : null);
      document.documentElement.dataset.homeReady = "1";
    };
    read();
    window.addEventListener(SETUP_EVENT, read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(SETUP_EVENT, read);
      window.removeEventListener("storage", read);
    };
  }, []);

  const blocks = useMemo(() => setup?.blocks ?? [], [setup]);
  const states = useBlocksData(blocks);
  const loaded: LoadedBlock[] = blocks.map((b) => ({ block: b, data: states[b.id]?.data ?? null }));
  const line = heroLine(loaded, {
    now: new Date(),
    formatTime: (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
    formatDay: (iso) => new Date(iso).toLocaleDateString(undefined, { weekday: "short" }),
  });

  const commit = useCallback((next: HomeSetup) => {
    setSetup(next);
    writeSetup(next);
  }, []);
  const { handleProps } = useDragReorder(
    blocks.map((b) => b.id),
    (ids) => setSetup((s) => (s ? reorderBlocks(s, ids) : s)),
    () => {
      if (setupRef.current) writeSetup(setupRef.current);
    }
  );

  if (!setup) return null;

  const onPick = (b: HomeBlock) => {
    commit(addBlock(setup, b));
    setAdding(false);
  };

  return (
    <>
      {editing ? (
        <section className="band bleed -mt-6 py-8">
          <HomeBuilder ctx={ctx} mode="edit" initial={setup} onClose={() => setEditing(false)} />
        </section>
      ) : (
        <BuiltHero setup={setup} headline={line.headline} sub={line.sub} liveCount={line.liveCount} onEdit={() => setEditing(true)} />
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {blocks.map((b, i) => (
          <BlockFrame
            key={b.id}
            block={b}
            index={i}
            count={blocks.length}
            state={states[b.id]}
            onRemove={() => {
              const next = removeBlock(setup, b.id);
              if (next.blocks.length === 0) clearSetup();
              else commit(next);
            }}
            onMove={(d) => commit(moveBlock(setup, b.id, d))}
            handleProps={handleProps(b.id)}
          >
            {renderBlock(b, states[b.id])}
          </BlockFrame>
        ))}
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex min-h-24 items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[var(--border-strong)] text-[14px] font-bold text-[var(--text-muted)] hover:border-[var(--sig-ink)] hover:text-[var(--sig-ink)]"
        >
          + Add another block
        </button>
      </div>

      {adding && (
        <div role="dialog" aria-modal="true" aria-label="Add another block" className="fixed inset-0 z-40 flex items-end justify-center bg-[color-mix(in_srgb,var(--mast)_60%,transparent)] p-4 sm:items-center" onClick={() => setAdding(false)}>
          <div className="card max-h-[85vh] w-full max-w-2xl overflow-auto p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <p className="display text-[24px]">Add another block</p>
              <button type="button" onClick={() => setAdding(false)} aria-label="Close" className="text-[var(--text-faint)]">×</button>
            </div>
            <BlockPalette ctx={ctx} existing={new Set(blocks.map((b) => b.id))} onPick={onPick} dark={false} />
          </div>
        </div>
      )}
    </>
  );
}
```

Removing the last block clears the setup outright (`clearSetup` also removes `data-home`), so the builder returns with the edition re-suggested, as the spec says. Confirm it in the browser in Task 12.

- [ ] **Step 4: Create `src/components/home/CollapsedBar.tsx`**

```tsx
"use client";

import { clearSetup } from "@/lib/homeSetup";

// Shown instead of the hero after "I'll decide later" (CSS keys on html[data-home="collapsed"]).
export function CollapsedBar() {
  return (
    <div className="home-collapsed-bar band bleed -mt-6 items-center justify-between gap-4 py-3">
      <p className="display text-[20px] sm:text-[24px]">Build the sports page you keep looking for.</p>
      <button type="button" onClick={clearSetup} className="h-9 shrink-0 rounded-lg bg-[var(--sig)] px-3.5 text-[13px] font-extrabold text-[var(--sig-on)]">
        Start now
      </button>
    </div>
  );
}
```

- [ ] **Step 5: Rewrite the hero in `src/app/page.tsx`**

Replace the imports of `MyFollows` and `SpotlightCard` with:

```tsx
import { HomeBuilder } from "@/components/home/HomeBuilder";
import { HomeBlocks } from "@/components/home/HomeBlocks";
import { CollapsedBar } from "@/components/home/CollapsedBar";
import { getEditionContext } from "@/lib/editionContext";
```

Delete `const spotlight = pickSpotlight(home.featured);` and the `QUICK_LINKS` constant and its import of `SOCCER_LEAGUES` if nothing else uses them (the live count pill moves into the block hero). In `HomePage`, load the context next to the home data:

```tsx
  const [home, editionContext] = await Promise.all([getHomeData(), getEditionContext()]);
```

Replace the whole `<section className="band band-hero …">…</section>` and the `<MyFollows />` line with:

```tsx
      <section className="home-builder-hero band band-hero bleed -mt-6 py-9 sm:py-11" suppressHydrationWarning>
        <HomeBuilder ctx={editionContext} />
      </section>
      <CollapsedBar />
      <div className="home-skeleton" aria-hidden />
      <HomeBlocks ctx={editionContext} />
      <h2 className="home-else display text-[28px] text-[var(--text)]">Everything else is still here</h2>
```

Keep `<HomeLive data={home} />` and everything after it as they are.

- [ ] **Step 6: Add the pre-paint script in `src/app/layout.tsx`**

After the `theme-init` script, add:

```tsx
        <Script id="home-init" strategy="beforeInteractive">
          {`try {
            var h = JSON.parse(localStorage.getItem('sportsdb-home') || 'null');
            var fromLink = /[?&]setup=/.test(location.search);
            if (fromLink || (h && h.v === 1 && Array.isArray(h.blocks) && h.blocks.length)) document.documentElement.dataset.home = 'built';
            else if (h && h.v === 1 && h.declined) document.documentElement.dataset.home = 'collapsed';
          } catch (e) {}`}
        </Script>
```

Extend the comment above `suppressHydrationWarning` to mention `data-home` next to `data-theme`.

- [ ] **Step 7: Append the state CSS to `src/app/globals.css`**

```css
/* Build-your-homepage states, keyed on <html data-home> set before first paint (app/layout.tsx) and
   data-home-ready set by HomeBlocks once it has read the setup. */
.home-skeleton,
.home-collapsed-bar,
.home-else {
  display: none;
}
:root[data-home="built"] .home-builder-hero,
:root[data-home="collapsed"] .home-builder-hero {
  display: none;
}
:root[data-home="built"] .home-skeleton {
  display: block;
  height: 26rem;
  margin-top: -1.5rem;
  background: linear-gradient(var(--mast), var(--mast) 11rem, var(--bg) 11rem);
}
:root[data-home="built"][data-home-ready] .home-skeleton {
  display: none;
}
:root[data-home="built"] .home-else {
  display: block;
}
:root[data-home="collapsed"] .home-collapsed-bar {
  display: flex;
}
```

- [ ] **Step 8: Remove the old follows section**

```bash
git rm -q src/components/MyFollows.tsx src/app/api/follows/games/route.ts
```

Update the two comments in `src/lib/follow.ts` that mention `MyFollows` to say the follows now seed the homepage builder (`components/home/HomeBuilder.tsx`).

- [ ] **Step 9: Type-check, lint, test, build**

Run: `npx tsc --noEmit && npm run lint && npm test 2>&1 | tail -3 && npm run build 2>&1 | tail -8`
Expected: all clean; the build lists `/` as ISR and `/api/block/[type]` as dynamic.

- [ ] **Step 10: Check it in the browser**

Start `preview_start {name: "home-builder"}` and open `http://localhost:3011/`. Verify in order, fixing the source where something is off:

1. First visit: the hero reads "Your homepage, your rules" / "Build the sports page you keep looking for." with the card "We started one for you". After the region call the chips appear (World picks on localhost, since there is no country header). `read_console_messages` shows no errors.
2. Add a chip from the palette, remove one, type "arsenal" in the search box and add the result. The preview column lists the blocks; drag one by its handle and the order changes.
3. "Make this my homepage": the hero becomes the built state with the eyebrow "Your homepage · <today> · N blocks", a generated headline, and the grid. Each block loads; `read_network_requests` with pattern `/api/block/` shows one request per block with `cache-control: public, s-maxage=…`.
4. Reload: no builder flash; the skeleton shows briefly, then the built page. `javascript_tool`: `document.documentElement.dataset.home` is `"built"`.
5. Move a block with ↑/↓ and by dragging; reload; the order persists. Remove a block; "+ Add another block" opens the dialog and adds one.
6. "Edit blocks" opens the edit card; "Save my blocks" returns to the built state.
7. In the console run `localStorage.removeItem('sportsdb-home'); location.reload()`, click "I'll decide later": the hero collapses to the bar with "Start now"; reload keeps the bar; "Start now" brings the builder back.
8. `resize_window` to mobile: the builder stacks, the move buttons are always visible, the grid is one column. Reset to desktop.
9. Take a screenshot of the first-visit hero and of the built state for the task record.

- [ ] **Step 11: Commit**

```bash
git add -A && git commit -m "Let visitors build their own homepage out of blocks

The hero becomes the builder on a first visit, pre-filled for the visitor's
country from /api/region and their existing follows. A saved setup replaces
the hero with a generated line and the block grid, assembled in the browser
on top of the cached page. MyFollows and its route go; the blocks do that job.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Send to my phone, the transfer link, and "Add to my homepage"

**Files:**
- Modify: `src/components/home/SendToPhone.tsx` (replace the stub), `src/components/home/HomeBlocks.tsx` (import on load), `src/components/FollowButton.tsx`
- Create: `src/components/AddToHomepageButton.tsx`

**Interfaces:**
- Consumes: `encodeSetup`, `decodeSetup`, `readSetup`, `writeSetup`, `newSetup`, `addBlock`, `hasBlock`, `isSetup`, `SETUP_EVENT` (Task 5); `followToBlock` (Task 8).
- Produces: `SendToPhone({ setup })`; `AddToHomepageButton({ item })`.

- [ ] **Step 1: Replace `src/components/home/SendToPhone.tsx`**

```tsx
"use client";

import { useState } from "react";
import { encodeSetup, type HomeSetup } from "@/lib/homeSetup";

// Carries the setup to another device with no login: the setup travels inside the link
// (lib/homeSetup.ts encodeSetup) and HomeBlocks imports it on arrival. Phones get the
// share sheet; everything else copies the link and says so.
export function SendToPhone({ setup }: { setup: HomeSetup }) {
  const [copied, setCopied] = useState(false);
  const send = async () => {
    const url = `${window.location.origin}/?setup=${encodeSetup(setup)}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "My SportsDB homepage", url });
        return;
      } catch {
        /* the visitor closed the sheet: fall through to copying */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link to open your homepage on another device", url);
    }
  };
  return (
    <button type="button" onClick={send} className="inline-flex h-10 items-center rounded-lg border border-[var(--mast-line)] px-3.5 text-[13px] font-bold text-[var(--mast-text)]" aria-live="polite">
      {copied ? "Link copied" : "Send to my phone"}
    </button>
  );
}
```

- [ ] **Step 2: Import a setup from the link in `HomeBlocks`**

In `src/components/home/HomeBlocks.tsx`, extend the imports:

```tsx
import { addBlock, clearSetup, decodeSetup, isSetup, moveBlock, newSetup, readSetup, removeBlock, reorderBlocks, SETUP_EVENT, writeSetup, type HomeSetup } from "@/lib/homeSetup";
```

and at the top of the mount effect, before `read()` is first called:

```tsx
    const encoded = new URLSearchParams(window.location.search).get("setup");
    if (encoded) {
      const incoming = decodeSetup(encoded);
      const existing = readSetup();
      if (incoming && (!isSetup(existing) || window.confirm("Replace the homepage saved on this device with the one from this link?"))) {
        writeSetup(newSetup(incoming.edition, incoming.country, incoming.blocks));
      }
      window.history.replaceState({}, "", window.location.pathname);
    }
```

(`newSetup` stamps fresh dates; the link carries none.)

- [ ] **Step 3: Create `src/components/AddToHomepageButton.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { FollowItem } from "@/lib/follow";
import { followToBlock } from "@/lib/followBlocks";
import { addBlock, hasBlock, isSetup, newSetup, readSetup, SETUP_EVENT, writeSetup } from "@/lib/homeSetup";

type Item = Omit<FollowItem, "addedAt">;

// "Add to my homepage" beside the follow button on team, player and series pages. Adds the
// matching block to the setup saved in this browser (or starts one), and says so.
export function AddToHomepageButton({ item }: { item: Item }) {
  const block = followToBlock(item);
  const [onPage, setOnPage] = useState(false);
  const [justAdded, setJustAdded] = useState(false);

  useEffect(() => {
    if (!block) return;
    const check = () => {
      const s = readSetup();
      setOnPage(isSetup(s) && hasBlock(s, block.id));
    };
    check();
    window.addEventListener(SETUP_EVENT, check);
    window.addEventListener("storage", check);
    return () => {
      window.removeEventListener(SETUP_EVENT, check);
      window.removeEventListener("storage", check);
    };
  }, [block]);

  if (!block) return null;

  if (onPage && !justAdded) {
    return (
      <Link href="/" className="inline-flex shrink-0 items-center rounded-lg border border-[var(--sig-ink)] bg-[var(--sig-soft)] px-3 py-1.5 text-sm font-semibold text-[var(--sig-ink)]">
        On your homepage
      </Link>
    );
  }

  const add = () => {
    const s = readSetup();
    writeSetup(isSetup(s) ? addBlock(s, block) : newSetup("blank", null, [block]));
    setJustAdded(true);
    window.setTimeout(() => setJustAdded(false), 2000);
  };

  return (
    <button type="button" onClick={add} aria-live="polite" className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm font-semibold text-[var(--text)] transition hover:border-[var(--sig-ink)] hover:text-[var(--sig-ink)]">
      {justAdded ? "Added" : "Add to my homepage"}
    </button>
  );
}
```

Note: `followToBlock(item)` is recomputed every render and is a new object each time, which would re-run the effect on every render. Compute it once: `const block = useMemo(() => followToBlock(item), [item.kind, item.league, item.refId, item.label]);` and import `useMemo`.

- [ ] **Step 4: Render it beside the follow button**

In `src/components/FollowButton.tsx`, import `AddToHomepageButton` and wrap the returned button so both render for the kinds that have a block:

```tsx
  const hasBlock = item.kind === "team" || item.kind === "player" || item.kind === "series";
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button …existing button unchanged… </button>
      {hasBlock && <AddToHomepageButton item={item} />}
    </span>
  );
```

Rename the local `hasBlock` to `hasHomepageBlock` to avoid confusion with the `homeSetup` export.

- [ ] **Step 5: Type-check, lint and test**

Run: `npx tsc --noEmit && npm run lint && npm test 2>&1 | tail -3`
Expected: clean.

- [ ] **Step 6: Check it in the browser**

With the preview running:

1. On a built homepage click "Send to my phone": on the desktop preview the button reads "Link copied" for two seconds. Read the clipboard with `javascript_tool`: `await navigator.clipboard.readText()`; it starts with `http://localhost:3011/?setup=`.
2. Clear storage (`localStorage.removeItem('sportsdb-home')`) and `navigate` to that link: the built page appears without a builder flash and the address bar is `/` again. Repeat with a setup already present: the confirm dialog appears.
3. Open `/epl/teams/arsenal`: beside Follow there is "Add to my homepage"; click it, it reads "Added" for two seconds then "On your homepage" linking to `/`. The homepage now has "Arsenal: next three" last.
4. Screenshot the team page header for the record.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "Carry a homepage to another device by link, and add blocks from entity pages

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: Final checks, dark mode, performance budget and the pull request

**Files:**
- Modify only what the checks below turn up.

- [ ] **Step 1: Full verification**

Run: `npm test 2>&1 | tail -3 && npx tsc --noEmit && npm run lint && npm run build 2>&1 | tail -8`
Expected: all green.

- [ ] **Step 2: Dark theme and phone widths**

With the preview open, `resize_window {colorScheme: "dark"}` and toggle the site's own theme switch. The built hero, block frames, palette dialog and collapsed bar must use token colours only (no hard-coded whites on dark: check `BlockFrame`, `BlockPalette dark={false}`, the dialog). Fix any contrast problems in the source. Then `resize_window {preset: "mobile"}`: the builder card stacks with the preview under the chips, the palette wraps, and no horizontal scroll appears (`javascript_tool`: `document.documentElement.scrollWidth <= window.innerWidth`). Reset to desktop.

- [ ] **Step 3: Cache behaviour**

`read_network_requests` with pattern `/api/block/`: every response carries `cache-control: public, s-maxage=<type>, stale-while-revalidate=<4×>`, no block request repeats within 30 s except `live`, and a hard reload of `/` fetches `/` itself with the page's own ISR headers (unchanged from before this work: check with `curl -sI http://localhost:3011/ | grep -i cache-control`).

- [ ] **Step 4: Crawler view**

`curl -s http://localhost:3011/ | grep -c "Build the sports page"` prints at least 1, and `grep -c "Live now"` at least 1: the cached HTML still carries the builder headline and the full page for crawlers and first-time visitors.

- [ ] **Step 5: Update the memory and push**

Append a line to `/Users/ps/.claude/projects/-Users-ps-Claude-sports-stats-site/memory/build-your-homepage.md` saying the implementation is on `feat/build-your-homepage` and awaits review, with the date.

```bash
git push -u origin feat/build-your-homepage
```

- [ ] **Step 6: Open the pull request in the browser**

The `gh` CLI is not installed. Open `https://github.com/PoojaPS17/sports-stats-site/compare/main...feat/build-your-homepage?expand=1` in the browser pane (confirm the repository path from `git remote -v` first), set the title "Build your homepage: block builder, editions and the lit-block mark", and paste this body:

```markdown
## What

- The homepage hero becomes a builder on a first visit: a draft of blocks for the visitor's country (from `/api/region`, which now returns the country) plus their existing follows, an add palette with search, and one button that makes it their homepage. "I'll decide later" collapses it to a bar.
- A saved setup replaces the hero with a generated two-fact line and a grid of blocks (live, a team's next three, standings, a cricket series table, a player's last five, F1 drivers, Beyond the Scoreline). Blocks drag to reorder, with keyboard buttons; "Send to my phone" carries the setup by link.
- Every block is one GET on `/api/block/<type>?…` with its own edge cache lifetime, so the homepage HTML stays one cached document and the VM sees one query per block per lifetime.
- Brand: the lit-block mark replaces the pixel ball in the header, tab and home-screen icons, the generated 512px logo and the share images; the wordmark is Barlow Condensed with DB in Volt.
- `MyFollows` and `/api/follows/games` are removed; the blocks do that job.

## Spec and plan

`docs/superpowers/specs/2026-10-01-build-your-homepage-design.md`, `docs/superpowers/plans/2026-10-01-build-your-homepage.md`

## Tests

`npm test`: new `logo`, `block-params`, `editions`, `home-setup`, `home-hero-line`, `follow-blocks`, `block-route` (embedded Postgres) tests; `country` extended. Browser checks per the plan's Task 10, 11 and 12 (first visit, built state, no-flash reload, reorder, decline bar, transfer link, phone width, dark theme).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

Do not merge. Report the PR URL and the screenshots.
