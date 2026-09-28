# Broadcast Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give sports-db.live a broadcast visual identity (Volt on navy, Barlow Condensed headlines) through the shared tokens, and rebuild the homepage, the Beyond the Scoreline index and the article page on it.

**Architecture:** Every colour and face is a CSS custom property in `src/app/globals.css`; components reference tokens, never literals, so pages outside this plan pick up the look without edits. The masthead, scores strip, card language and section headers change once in their shared components. Three pages are rebuilt on those primitives, plus one new shared component (the league snapshot) extracted from the existing off-season recap.

**Tech Stack:** Next.js (App Router, the version in `node_modules`, read its docs first per `AGENTS.md`), React server components, Tailwind v4 via `@import "tailwindcss"` in `globals.css`, `next/font/google`, `node:test` via `npm test`, TypeScript.

**Spec:** `docs/superpowers/specs/2026-09-28-broadcast-redesign-design.md`

## Global Constraints

- Work on branch `design/broadcast-redesign` (already exists, tracks `origin/main`). One PR, no auto-merge.
- Signature colour Volt `#c6f135`, ink `#4d7c0f` (light) / Volt itself (dark). Live red `#ff3b5c` is only for live state. `--win`, `--loss`, `--draw`, `--zone-*` unchanged.
- Masthead navy `--mast: #0b1324`, `--mast-2: #121c33`, `--mast-text: #eef1f7`, `--mast-muted: #9aa5bd`, identical in both themes.
- Headline face Barlow Condensed (600/700/800), uppercase, exposed as `--font-display`. Body stays Geist. Tables keep the body face.
- Light body under the dark masthead is the default; the existing theme toggle and the pre-hydration theme script keep working.
- No photos. No new data cadence: new homepage reads use an existing `unstable_cache` tier.
- No horizontal page scroll at any viewport width, including 1024px.
- Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Run from `app/`: `npm test` (node:test), `npm run lint`, `npx tsc --noEmit`. `npm run build` needs `DATABASE_URL`; if unset, skip the build and rely on `tsc` + lint + tests.
- Before any Next-specific code, read the relevant guide in `node_modules/next/dist/docs/` (per `AGENTS.md`).

---

### Task 1: Tokens and fonts

**Files:**
- Modify: `src/app/globals.css` (the `:root`, dark blocks, `@theme inline`, `.page-title`, `.card`, `.pill-*`, `.tab-active::after`)
- Modify: `src/app/layout.tsx:12-24` (font loading)
- Test: `tests/design-tokens.test.ts`

**Interfaces:**
- Produces: CSS variables `--sig`, `--sig-ink`, `--sig-soft`, `--sig-on`, `--mast`, `--mast-2`, `--mast-text`, `--mast-muted`, `--font-display`; Tailwind utilities `font-display`, `text-sig`, `bg-sig`, `text-sig-ink`, `bg-mast`, `text-mast-text`, `text-mast-muted`; CSS classes `.band`, `.band-hero`, `.eyebrow`, `.display`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/design-tokens.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync(join(__dirname, "../src/app/globals.css"), "utf8");
const layout = readFileSync(join(__dirname, "../src/app/layout.tsx"), "utf8");

// Everything between the first `:root {` and its closing brace: the light palette every other block overrides.
const rootBlock = css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {")));

test("the light :root block defines the signature, masthead and display-font tokens", () => {
  for (const token of ["--sig:", "--sig-ink:", "--sig-soft:", "--sig-on:", "--mast:", "--mast-2:", "--mast-text:", "--mast-muted:", "--font-display:"]) {
    assert.match(rootBlock, new RegExp(token.replace(/[-]/g, "\\-")), token);
  }
  assert.match(rootBlock, /--sig:\s*#c6f135/i, "Volt is the signature colour");
  assert.match(rootBlock, /--sig-ink:\s*#4d7c0f/i);
  assert.match(rootBlock, /--mast:\s*#0b1324/i);
});

test("--accent is remapped to the signature ink so existing components inherit it", () => {
  assert.match(rootBlock, /--accent:\s*var\(--sig-ink\)/);
  assert.match(rootBlock, /--accent-soft:\s*var\(--sig-soft\)/);
  assert.match(rootBlock, /--header-bg:\s*var\(--mast\)/);
});

test("the dark theme makes Volt itself the ink, in both the media block and the explicit toggle", () => {
  const darkBlocks = css.match(/--sig-ink:\s*var\(--sig\)/g) ?? [];
  assert.ok(darkBlocks.length >= 2, `expected the dark ink remap twice (media + data-theme), found ${darkBlocks.length}`);
});

test("Barlow Condensed is loaded in the root layout and exposed as --font-display", () => {
  assert.match(layout, /Barlow_Condensed\(/);
  assert.match(layout, /variable:\s*"--font-barlow"/);
  assert.match(css, /--font-display:\s*var\(--font-barlow\)/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/design-tokens.test.ts` (from `app/`; if the script's glob ignores the argument, run `npx tsx --test tests/design-tokens.test.ts`)
Expected: FAIL, the `--sig` assertions and the `Barlow_Condensed` match.

- [ ] **Step 3: Load the display font in the layout**

In `src/app/layout.tsx`, change the font imports and declarations:

```tsx
import { Geist, Geist_Mono, Barlow_Condensed } from "next/font/google";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
// The headline face: condensed, heavy, set uppercase. Scores and big numbers use it too.
const barlow = Barlow_Condensed({ variable: "--font-barlow", subsets: ["latin"], weight: ["600", "700", "800"] });
```

and add `barlow.variable` to the `<html className>`:

```tsx
className={`${geistSans.variable} ${geistMono.variable} ${barlow.variable} h-full antialiased`}
```

- [ ] **Step 4: Replace the token blocks in globals.css**

Replace the whole light `:root { ... }` block (from `--bg: #f4f6fa;` through `--header-h: 3.5rem;`) with:

```css
:root {
  --bg: #f3f4f8;
  --surface: #ffffff;
  --surface-muted: #eceef4;
  --surface-hover: #f5f6fa;
  --border: #dde1ea;
  --border-strong: #c3cad8;
  --text: #0b1324;
  --text-muted: #5a6478;
  --text-faint: #8b95a8;

  /* The signature colour (Volt) and its readable ink on light surfaces. */
  --sig: #c6f135;
  --sig-ink: #4d7c0f;
  --sig-soft: #eef9c9;
  --sig-on: #0b1324;

  /* The dark bands: masthead, scores strip, hero, article header, footer. Same in both themes. */
  --mast: #0b1324;
  --mast-2: #121c33;
  --mast-text: #eef1f7;
  --mast-muted: #9aa5bd;

  /* Legacy names, kept so every existing component inherits the identity. */
  --accent: var(--sig-ink);
  --accent-hover: #3f6a0a;
  --accent-soft: var(--sig-soft);
  --accent-foreground: var(--sig-on);
  --accent-2: #d97706;

  --win: #15803d;
  --loss: #b91c1c;
  --draw: #64748b;
  --live: #ff3b5c;

  --zone-1: #2563eb;
  --zone-2: #d97706;
  --zone-3: #dc2626;
  --zone-4: #0f766e;

  --header-bg: var(--mast);
  --header-text: var(--mast-text);
  --header-text-muted: var(--mast-muted);
  --header-border: #1b2640;
  --header-hover-bg: rgba(255, 255, 255, 0.07);

  --pill-live-bg: var(--live);
  --pill-live-text: #ffffff;
  --pill-final-bg: #e8ebf2;
  --pill-final-text: #46516a;
  --pill-upcoming-bg: var(--sig-soft);
  --pill-upcoming-text: var(--sig-ink);
  --pill-feature-bg: #dcfce7;
  --pill-feature-text: #166534;

  --nba-accent: #ea580c;
  --nfl-accent: #1d5c3a;

  --shadow-card: 0 1px 2px rgba(11, 19, 36, 0.05), 0 8px 24px -12px rgba(11, 19, 36, 0.18);
  --shadow-pop: 0 14px 30px -14px rgba(11, 19, 36, 0.35), 0 2px 6px rgba(11, 19, 36, 0.08);

  --font-display: var(--font-barlow);
  --header-h: 3.75rem;
}
```

Replace the body of BOTH dark blocks (`@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { ... } }` and `:root[data-theme="dark"] { ... }`) with this identical body (the masthead tokens are deliberately absent: they do not change):

```css
    --bg: #0a0f1c;
    --surface: #111a2c;
    --surface-muted: #182238;
    --surface-hover: #1b2740;
    --border: #24304a;
    --border-strong: #34425e;
    --text: #e9edf6;
    --text-muted: #9aa6bf;
    --text-faint: #6b7890;

    --sig-ink: var(--sig);
    --sig-soft: #23301a;

    --accent: var(--sig);
    --accent-hover: #d8f766;
    --accent-soft: var(--sig-soft);
    --accent-foreground: var(--sig-on);
    --accent-2: #f59e0b;

    --win: #4ade80;
    --loss: #f87171;
    --draw: #94a3b8;

    --zone-1: #6ea0ff;
    --zone-2: #f59e0b;
    --zone-3: #f87171;
    --zone-4: #2dd4bf;

    --header-border: #1b2640;
    --header-hover-bg: rgba(255, 255, 255, 0.07);

    --pill-final-bg: #1b2740;
    --pill-final-text: #9aa7bd;
    --pill-feature-bg: #0f2f22;
    --pill-feature-text: #4ade80;

    --shadow-card: 0 1px 2px rgba(0, 0, 0, 0.4), 0 10px 30px -12px rgba(0, 0, 0, 0.7);
    --shadow-pop: 0 14px 34px -12px rgba(0, 0, 0, 0.8), 0 2px 6px rgba(0, 0, 0, 0.4);
```

Extend `@theme inline` so Tailwind utilities exist for the new tokens:

```css
@theme inline {
  --color-bg: var(--bg);
  --color-surface: var(--surface);
  --color-surface-muted: var(--surface-muted);
  --color-border: var(--border);
  --color-text: var(--text);
  --color-text-muted: var(--text-muted);
  --color-accent: var(--accent);
  --color-sig: var(--sig);
  --color-sig-ink: var(--sig-ink);
  --color-sig-soft: var(--sig-soft);
  --color-sig-on: var(--sig-on);
  --color-mast: var(--mast);
  --color-mast-2: var(--mast-2);
  --color-mast-text: var(--mast-text);
  --color-mast-muted: var(--mast-muted);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
  --font-display: var(--font-display);
}
```

- [ ] **Step 5: Add the typographic and band helpers, and restyle the shared primitives**

Replace `.page-title` with:

```css
.page-title {
  font-family: var(--font-display);
  font-size: 2.25rem;
  line-height: 0.95;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: uppercase;
  color: var(--text);
  text-wrap: balance;
}

@media (min-width: 640px) {
  .page-title {
    font-size: 2.75rem;
  }
}

/* Headline face for any heading or big number. */
.display {
  font-family: var(--font-display);
  text-transform: uppercase;
  line-height: 1;
  font-weight: 800;
}

/* Small caps label above a title. Colour is set where it's used (Volt on a band, ink on a surface). */
.eyebrow {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

/* A full-bleed dark block: hero, section title bands, article header. Bleeds past the
   container's side padding, so it needs a `.container-x` (or a `.wrap`) inside. */
.band {
  background: var(--mast);
  color: var(--mast-text);
}

.band .eyebrow {
  color: var(--sig);
}

/* The homepage hero: a faint Volt wash top-right. */
.band-hero {
  position: relative;
  overflow: hidden;
}

.band-hero::before {
  content: "";
  position: absolute;
  inset: 0;
  background: radial-gradient(60% 90% at 90% 10%, color-mix(in srgb, var(--sig) 18%, transparent), transparent 70%);
  pointer-events: none;
}

.band-hero > * {
  position: relative;
}
```

Change `.card` hover lift and `.tab-active::after`:

```css
a.card:hover,
.card-link:hover,
.player-grid > a:hover {
  border-color: var(--border-strong);
  box-shadow: var(--shadow-pop);
  transform: translateY(-2px);
}

.tab-active::after {
  background: var(--sig);
}
```

The pill tokens already changed in Step 4; `.pill-live .live-dot` must stay visible on the solid red fill, so add:

```css
.pill-live .live-dot {
  background: #ffffff;
}
```

- [ ] **Step 6: Run the test, lint and type-check**

Run: `npx tsx --test tests/design-tokens.test.ts && npm run lint && npx tsc --noEmit`
Expected: PASS, no lint errors, no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/app/globals.css src/app/layout.tsx tests/design-tokens.test.ts
git commit -m "Define the Volt and masthead tokens and load Barlow Condensed

Every legacy token (--accent, --header-*) is remapped onto the new identity
so components that never change pick it up.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Masthead

**Files:**
- Modify: `src/components/Nav.tsx`
- Modify: `src/components/NavDropdown.tsx` (the menu panel classes only)
- Modify: `src/components/MobileMenu.tsx` (the drawer classes only)
- Modify: `src/components/Logo.tsx` (`LogoMark` colours)
- Modify: `src/app/globals.css` (`.nav-link`, `.nav-link-active`)

**Interfaces:**
- Consumes: tokens from Task 1.
- Produces: nothing new; the header is the same component tree with the dark palette and a fit at 1024px.

- [ ] **Step 1: Restyle LogoMark**

In `src/components/Logo.tsx`, `LogoMark` currently returns `<PixelBall size={size} fill="var(--accent)" live="var(--live)" />`. Change it to:

```tsx
/** The mark in the page's own colours: cells in the surrounding text colour, the live cell in Volt. */
export function LogoMark({ size = 30 }: { size?: number }) {
  return <PixelBall size={size} fill="currentColor" live="var(--sig)" />;
}
```

On the masthead and footer that gives white cells; the share-image callers pass explicit colours to `PixelBall` directly and are unaffected.

- [ ] **Step 2: Confirm the footer logo colour**

`Footer.tsx` wraps `LogoMark` in a `Link`; Task 5 sets that link's text colour to `--mast-text`, so nothing to do here beyond noting it.

- [ ] **Step 3: Rewrite the header markup in Nav.tsx**

Replace the returned JSX of `Nav()` with:

```tsx
return (
  <header className="sticky top-0 z-30 border-b border-[var(--header-border)] bg-[var(--mast)] text-[var(--mast-text)]">
    <div className="container-x flex h-[var(--header-h)] items-center gap-1.5">
      <Link href="/" className="mr-3 flex shrink-0 items-center gap-2.5 text-[var(--mast-text)]" aria-label="SportsDB home">
        <LogoMark size={30} />
        <span className="text-[19px] font-extrabold tracking-tight">SportsDB</span>
      </Link>

      <nav className="hidden items-center gap-0.5 lg:flex" aria-label="Primary">
        {NAV_ITEMS.map((item) => {
          const active = isNavItemActive(pathname, item);
          if (item.href) {
            return (
              <Link key={item.label} href={item.href} className={`nav-link ${active ? "nav-link-active" : ""}`}>
                {item.label}
              </Link>
            );
          }
          return <NavDropdown key={item.label} label={item.label} items={item.children ?? []} picker={item.picker} active={active} />;
        })}
      </nav>

      <div className="ml-auto flex items-center gap-1.5">
        {/* 176px until the nav has room at 1280px: at a 1024px viewport the old 256px box pushed the header past the screen. */}
        <div className="hidden w-44 md:block xl:w-64">
          <SearchBar />
        </div>
        <Link
          href="/search"
          aria-label="Search"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--mast-text)] transition hover:bg-[var(--header-hover-bg)] md:hidden"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
        </Link>
        <ThemeToggle />
        <a
          href="https://x.com/sportsdblive"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Follow SportsDB on X"
          title="Follow us on X"
          className="flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg px-2.5 text-[13px] font-bold transition xl:bg-[var(--sig)] xl:text-[var(--sig-on)] xl:hover:bg-[var(--accent-hover)] xl:hover:text-white text-[var(--mast-text)] hover:bg-[var(--header-hover-bg)]"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
          </svg>
          <span className="hidden xl:inline">Follow</span>
        </a>
        <MobileMenu />
      </div>
    </div>
  </header>
);
```

- [ ] **Step 4: Nav link styles**

In `globals.css`, replace `.nav-link`, `.nav-link:hover`, `.nav-link-active`, `.nav-link-active:hover` with:

```css
.nav-link {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  border-radius: 0.4rem;
  padding: 0.45rem 0.6rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--mast-muted);
  white-space: nowrap;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.nav-link:hover {
  background: var(--header-hover-bg);
  color: var(--mast-text);
}

.nav-link-active,
.nav-link-active:hover {
  color: var(--mast-text);
  box-shadow: inset 0 -3px 0 var(--sig);
  border-radius: 0.4rem 0.4rem 0 0;
}
```

- [ ] **Step 5: Dropdown panel and mobile drawer on the dark palette**

In `NavDropdown.tsx`, the `role="menu"` panel already uses `border-[var(--border)] bg-[var(--surface)]` and its items `text-[var(--text)] hover:text-[var(--accent)]`, so it reads as a light sheet under the dark bar with no change. The only edit: the trigger `button` keeps the `nav-link` class (restyled in Step 4) and its chevron `svg` inherits `currentColor`, so nothing else changes in this file. Verify by opening the Football menu in the browser: white panel, dark text, Volt hover.

In `MobileMenu.tsx`, the button keeps `text-[var(--header-text)]` (now the masthead text). The drawer `div` changes `bg-[var(--bg)]` to `bg-[var(--mast)] text-[var(--mast-text)]`, and inside it every `text-[var(--text)]` becomes `text-[var(--mast-text)]`, every `text-[var(--accent)]` becomes `text-[var(--sig)]`, every `text-[var(--text-faint)]`/`text-[var(--text-muted)]` becomes `text-[var(--mast-muted)]`. The `SearchBar` inside the drawer keeps its own light input styling, which is fine on the navy.

- [ ] **Step 6: Verify in the browser**

Start the dev server with the preview tooling: `.claude/launch.json` already defines `sports-stats-dev` (runs `run-dev.sh`, port 3010). Check `http://localhost:3010/` and `/epl/standings`:
- At 1024px, 1180px, 1280px and 1440px: `document.documentElement.scrollWidth === window.innerWidth`.
- The active section carries the Volt underline; the Follow button is Volt at 1280px+ and an icon below.
- The mobile drawer at 375px opens on navy with legible links.

Run: `npm run lint && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/components/Nav.tsx src/components/NavDropdown.tsx src/components/MobileMenu.tsx src/components/Logo.tsx src/app/globals.css
git commit -m "Paint the masthead navy and make it fit at 1024px

The 256px search box and the icon row pushed the header 266px past a
1024px viewport; the search box now grows only from 1280px and the X
link is a Volt button only where there is room.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Scores strip

**Files:**
- Modify: `src/lib/queries.ts:423-461` (`TickerGame` + `getTickerGames`)
- Modify: `src/lib/ticker.ts`
- Modify: `src/components/Ticker.tsx`
- Modify: `src/app/globals.css` (remove `marquee`, add `.strip-*`)
- Test: `tests/ticker-chip.test.ts`

**Interfaces:**
- Produces: `export interface TickerChip extends TickerItem { league: string; live: boolean; upcoming: boolean; status: string; sides: [TickerSide, TickerSide] }`, `export interface TickerSide { name: string; score: string | null; won: boolean }`, `export function tickerChip(g: TickerGame): TickerChip`. `getTicker()` returns `{ items: TickerChip[]; updatedAt }` (a `TickerChip` is still a `TickerItem`, so `/api/ticker` stays backward compatible).

- [ ] **Step 1: Write the failing test**

```ts
// tests/ticker-chip.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { tickerChip } from "../src/lib/ticker";
import type { TickerGame } from "../src/lib/queries";

const base: TickerGame = {
  league: "nfl",
  espn_id: "1",
  home_name: "Denver Broncos",
  home_slug: "denver-broncos",
  home_abbr: "DEN",
  home_score: 30,
  home_score_display: null,
  home_winner: true,
  away_name: "Los Angeles Rams",
  away_slug: "los-angeles-rams",
  away_abbr: "LAR",
  away_score: 26,
  away_score_display: null,
  away_winner: false,
  completed: true,
  status_summary: null,
  status_state: "post",
  status_detail: "Final",
  date: "2026-09-27T20:25:00.000Z",
};

test("a finished NFL game: visitors first, winner flagged, status Final, label kept for old readers", () => {
  const chip = tickerChip(base);
  assert.equal(chip.league, "NFL");
  assert.equal(chip.live, false);
  assert.equal(chip.upcoming, false);
  assert.equal(chip.status, "Final");
  assert.deepEqual(chip.sides, [
    { name: "LAR", score: "26", won: false },
    { name: "DEN", score: "30", won: true },
  ]);
  assert.equal(chip.href, "/nfl/games/1");
  assert.match(chip.label, /Denver Broncos beat Los Angeles Rams 30-26/);
});

test("a game in play is live and carries the clock as its status", () => {
  const chip = tickerChip({ ...base, completed: false, status_state: "in", status_detail: "Q3 4:12", home_winner: null, away_winner: null });
  assert.equal(chip.live, true);
  assert.equal(chip.status, "Q3 4:12");
  assert.equal(chip.sides[0].won, false);
  assert.equal(chip.sides[1].won, false);
});

test("an upcoming game has no scores and a date for its status", () => {
  const chip = tickerChip({ ...base, completed: false, status_state: "pre", status_detail: null, home_score: null, away_score: null, home_winner: null, away_winner: null });
  assert.equal(chip.upcoming, true);
  assert.equal(chip.sides[0].score, null);
  assert.match(chip.status, /Sep 27/);
});

test("a cricket result shows the margin, not a scoreline, and the side that batted first first", () => {
  const chip = tickerChip({
    ...base,
    league: "odi",
    home_name: "India",
    home_abbr: "IND",
    away_name: "West Indies",
    away_abbr: "WI",
    home_score: null,
    away_score: null,
    home_score_display: "282/6 (50 ov)",
    away_score_display: "274 (49.2 ov)",
    home_winner: true,
    away_winner: false,
    status_summary: "India won by 8 runs",
  });
  assert.equal(chip.status, "won by 8 runs");
  assert.equal(chip.sides.find((s) => s.name === "IND")?.won, true);
  assert.equal(chip.sides.find((s) => s.name === "IND")?.score, "282/6 (50 ov)");
});

test("a side without an abbreviation falls back to its display name", () => {
  const chip = tickerChip({ ...base, home_abbr: null, away_abbr: null });
  assert.equal(chip.sides[1].name, "Denver Broncos");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx --test tests/ticker-chip.test.ts`
Expected: FAIL (`tickerChip` is not exported; `home_abbr` is not on `TickerGame`).

- [ ] **Step 3: Extend the ticker query**

In `src/lib/queries.ts`, add to `TickerGame`:

```ts
  home_abbr: string | null;
  away_abbr: string | null;
  status_detail: string | null;
```

and in `getTickerGames` select them: `g.status_detail,` after `g.status_summary,`, and `ht.abbreviation as home_abbr` / `at.abbreviation as away_abbr` on the two team lines.

- [ ] **Step 4: Implement tickerChip**

In `src/lib/ticker.ts`, keep `tickerLabel` exactly as it is (it produces `label`/`href`) and add below it:

```ts
export interface TickerSide {
  name: string;
  score: string | null;
  won: boolean;
}

export interface TickerChip extends TickerItem {
  league: string;
  live: boolean;
  upcoming: boolean;
  /** "Final", the clock ("Q3 4:12", "67'"), a cricket margin, or the kickoff date. */
  status: string;
  /** In display order: visitors first for the NBA and NFL, home first elsewhere; cricket by batting order. */
  sides: [TickerSide, TickerSide];
}

function side(name: string, abbr: string | null, score: number | null, display: string | null, won: boolean, showScore: boolean): TickerSide {
  return { name: abbr ?? teamDisplayName(name), score: showScore ? (display ?? (score !== null ? String(score) : null)) : null, won };
}

export function tickerChip(g: TickerGame): TickerChip {
  const { href, label } = tickerLabel(g);
  const live = g.status_state === "in";
  const upcoming = !g.completed && !live;
  const cricket = isCricketLeague(g.league);
  const homeWon = g.completed && (g.home_winner ?? (!cricket && (g.home_score ?? 0) > (g.away_score ?? 0)));
  const awayWon = g.completed && (g.away_winner ?? (!cricket && (g.away_score ?? 0) > (g.home_score ?? 0)));
  const home = side(g.home_name, g.home_abbr, g.home_score, g.home_score_display, homeWon, !upcoming);
  const away = side(g.away_name, g.away_abbr, g.away_score, g.away_score_display, awayWon, !upcoming);
  const { awayFirst } = gameSides(g.league, g);
  const sides: [TickerSide, TickerSide] = awayFirst ? [away, home] : [home, away];

  let status: string;
  if (live) status = g.status_detail ?? "Live";
  else if (upcoming) status = formatGameDate(g.date, g.league, { month: "short", day: "numeric" }, g.local_date);
  else if (cricket) status = g.status_summary?.match(/\bwon by (.+?)(?: \(.*\))?$/i)?.[0] ?? g.status_summary ?? "Result";
  else status = g.status_detail && /^final/i.test(g.status_detail) ? g.status_detail : "Final";

  return { href, label, league: LEAGUE_LABEL[g.league], live, upcoming, status, sides };
}

export async function getTicker(): Promise<{ items: TickerChip[]; updatedAt: string | null }> {
  const [games, updatedAt] = await Promise.all([getTickerGames(10), getLastUpdated()]);
  return { items: games.map(tickerChip), updatedAt };
}
```

Delete the old `getTicker`. `gameSides` is already imported; check that it accepts a `TickerGame` (it is called with `g` in `tickerLabel` today, so it does).

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx tsx --test tests/ticker-chip.test.ts && npx tsc --noEmit`
Expected: PASS. If the cricket test's `status` is `"won by 8 runs"` but the regex yields `"won by 8 runs"` with different casing, keep the match's `[0]` (the full "won by ..." phrase) as written.

- [ ] **Step 6: Render chips instead of the marquee**

Replace the returned JSX of `Ticker()` in `src/components/Ticker.tsx` (the state and fetching stay) with:

```tsx
const { items, updatedAt } = data;

return (
  <div className="border-b border-[var(--header-border)] bg-[var(--mast-2)] text-[var(--mast-text)]">
    <div className="container-x flex h-[52px] items-stretch gap-0 px-0 sm:px-0">
      <div className="strip-scroll flex min-w-0 flex-1 items-stretch overflow-x-auto" aria-label="Latest scores">
        {items.map((chip, i) => (
          <Link key={`${chip.href}-${i}`} href={chip.href} className="strip-chip">
            <span className="strip-chip-top">
              <span>{chip.league}</span>
              <span className={chip.live ? "strip-live" : undefined}>
                {chip.live && <span className="live-dot" aria-hidden />}
                {chip.status}
              </span>
            </span>
            {chip.sides.map((s) => (
              <span key={s.name} className={`strip-chip-side ${s.won ? "strip-won" : ""}`}>
                <span className="truncate">{s.name}</span>
                {s.score !== null && <span className="tabular-nums">{s.score}</span>}
              </span>
            ))}
          </Link>
        ))}
        {items.length === 0 && <span className="strip-chip strip-chip-empty" aria-hidden />}
      </div>
      <Link href="/top-games" className="hidden shrink-0 items-center px-4 text-xs font-bold text-[var(--sig)] sm:flex">
        All scores →
      </Link>
      {updatedAt && (
        <span className="hidden shrink-0 items-center pr-4 text-[11px] text-[var(--mast-muted)] lg:flex">
          <LastUpdated iso={updatedAt} />
        </span>
      )}
    </div>
  </div>
);
```

Change the `TickerItem` import to `import type { TickerChip } from "@/lib/ticker";` and the state type to `{ items: TickerChip[]; updatedAt: string | null }`.

- [ ] **Step 7: Strip styles**

In `globals.css`, delete `@keyframes marquee`, `.animate-marquee`, `.animate-marquee:hover` and the `.animate-marquee` line inside `@media (prefers-reduced-motion: reduce)`. Add:

```css
/* ---------------------------------------------------------------------------
   Scores strip under the masthead
--------------------------------------------------------------------------- */
.strip-scroll {
  scrollbar-width: none;
  padding-left: 1rem;
}

.strip-scroll::-webkit-scrollbar {
  display: none;
}

.strip-chip {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  min-width: 9.5rem;
  padding: 0 1rem;
  border-right: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 12px;
  color: var(--mast-text);
}

.strip-chip:hover {
  background: rgba(255, 255, 255, 0.05);
}

.strip-chip-empty {
  border-right: 0;
}

.strip-chip-top {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  color: var(--mast-muted);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.strip-live {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--live);
}

.strip-live .live-dot {
  background: var(--live);
}

.strip-chip-side {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  font-weight: 500;
  color: var(--mast-muted);
}

.strip-won {
  font-weight: 800;
  color: var(--mast-text);
}
```

- [ ] **Step 8: Verify**

Run: `npm test && npm run lint && npx tsc --noEmit`
Expected: all pass. In the browser on `/`: chips render two lines each, the row scrolls sideways within itself and the page does not, live chips pulse.

- [ ] **Step 9: Commit**

```bash
git add src/lib/queries.ts src/lib/ticker.ts src/components/Ticker.tsx src/app/globals.css tests/ticker-chip.test.ts
git commit -m "Replace the ticker marquee with a strip of score chips

/api/ticker now carries structured sides, scores and status per game while
keeping label and href for anything that still reads them.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Match cards and the spotlight

**Files:**
- Create: `src/lib/teamColor.ts`
- Modify: `src/components/GameCard.tsx`
- Modify: `src/components/SpotlightCard.tsx`
- Modify: `src/app/globals.css` (`.match-*`)
- Test: `tests/team-color.test.ts`

**Interfaces:**
- Produces: `export function teamHex(color: string | null | undefined, fallback?: string): string` returning `#rrggbb` (accepts `"003594"`, `"#003594"`, `"#fff"`; anything else returns the fallback, default `"#64748b"`). `export function stripeStyle(c1: string | null | undefined, c2: string | null | undefined): React.CSSProperties` returning `{ "--c1": ..., "--c2": ... }`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/team-color.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { teamHex, stripeStyle } from "../src/lib/teamColor";

test("teamHex accepts ESPN's bare hex and a leading #", () => {
  assert.equal(teamHex("003594"), "#003594");
  assert.equal(teamHex("#FB4F14"), "#fb4f14");
  assert.equal(teamHex("fff"), "#ffffff");
});

test("teamHex falls back on nothing or garbage", () => {
  assert.equal(teamHex(null), "#64748b");
  assert.equal(teamHex("not a colour"), "#64748b");
  assert.equal(teamHex(undefined, "#000000"), "#000000");
});

test("stripeStyle sets both custom properties", () => {
  assert.deepEqual(stripeStyle("003594", null), { "--c1": "#003594", "--c2": "#64748b" });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx --test tests/team-color.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement teamColor.ts**

```ts
// src/lib/teamColor.ts
import type { CSSProperties } from "react";

// ESPN stores a team's colour as bare hex ("003594"); a few rows carry a leading #.
const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function teamHex(color: string | null | undefined, fallback = "#64748b"): string {
  const m = color?.trim().match(HEX);
  if (!m) return fallback;
  const h = m[1].toLowerCase();
  return `#${h.length === 3 ? h.split("").map((c) => c + c).join("") : h}`;
}

/** The two-tone stripe on a match card: home or first side on top, the other below. */
export function stripeStyle(c1: string | null | undefined, c2: string | null | undefined): CSSProperties {
  return { "--c1": teamHex(c1), "--c2": teamHex(c2) } as CSSProperties;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx --test tests/team-color.test.ts`
Expected: PASS.

- [ ] **Step 5: Match card styles**

Add to `globals.css` after the `.card` rules:

```css
/* A match card: a two-tone team-colour stripe down the left edge, scores in the display face. */
.match {
  position: relative;
  overflow: hidden;
  padding-left: 1.25rem;
}

.match::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 6px;
  background: linear-gradient(to bottom, var(--c1, var(--border)) 50%, var(--c2, var(--border)) 50%);
}

.match-live::before {
  width: 6px;
}

.match-live {
  box-shadow: var(--shadow-card), 0 0 0 1px color-mix(in srgb, var(--live) 45%, transparent);
}

.score-display {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 1.5rem;
  line-height: 1;
  letter-spacing: 0;
}
```

- [ ] **Step 6: Restyle GameCard**

In `src/components/GameCard.tsx`:
- Import `stripeStyle` from `@/lib/teamColor`.
- In `TeamRow`, the integer score span becomes: `` className={`score-display shrink-0 tabular-nums ${won ? "text-[var(--text)]" : "text-[var(--text-muted)]"}`} `` (drop `text-base` and the font-weight classes; the display face is always 800, the loser is dimmed by colour).
- The outer `Link` becomes:

```tsx
<Link
  href={`/${league}/games/${game.espn_id}`}
  aria-label={gameAccessibleLabel(league, game)}
  className={`card match block py-3 pr-4 ${live ? "match-live" : ""}`}
  style={stripeStyle(order[0] === "home" ? game.home_color : game.away_color, order[0] === "home" ? game.away_color : game.home_color)}
>
```

Everything else (pills, kickoff, summary line) stays.

- [ ] **Step 7: Restyle SpotlightCard**

In `src/components/SpotlightCard.tsx`:
- Import `teamHex` from `@/lib/teamColor`.
- In `Team`, the name span uses `text-xl` and the score span becomes `` className={`display shrink-0 tabular-nums text-[52px] ${won ? "text-[var(--mast-text)]" : "text-[var(--mast-muted)]"}`} ``; the name's colours become `text-[var(--mast-text)]` (winner/unfinished) and `text-[var(--mast-muted)]` (loser); the score-display line uses `text-[var(--mast-muted)]`.
- The outer `Link`:

```tsx
const c1 = teamHex(order[0] === "home" ? game.home_color : game.away_color, "#1e3a8a");
const c2 = teamHex(order[0] === "home" ? game.away_color : game.home_color, "#7c2d12");
return (
  <Link
    href={`/${league}/games/${game.espn_id}`}
    className="card block rounded-2xl border-white/10 px-5 py-4 text-[var(--mast-text)] shadow-[0_30px_60px_-30px_rgba(0,0,0,0.8)]"
    style={{ background: `linear-gradient(135deg, ${c1} 0%, var(--mast) 55%, ${c2} 140%)` }}
  >
```

- The label span `text-[var(--accent)]` becomes `text-[var(--sig)]`; the footer `p` uses `border-white/10 text-[var(--mast-muted)]` and the "Match centre" span `text-[var(--sig)]`.

- [ ] **Step 8: Verify**

Run: `npm test && npm run lint && npx tsc --noEmit`. In the browser on `/` and `/epl`: cards carry a two-colour stripe (teams with no stored colour show a grey stripe), scores are in Barlow Condensed, the loser is muted, the spotlight is a gradient from the two team colours.

- [ ] **Step 9: Commit**

```bash
git add src/lib/teamColor.ts src/components/GameCard.tsx src/components/SpotlightCard.tsx src/app/globals.css tests/team-color.test.ts
git commit -m "Give match cards a team-colour stripe and display-face scores

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Section headers, pills, tabs, footer

**Files:**
- Modify: `src/components/SectionHeader.tsx`
- Modify: `src/components/PageHeader.tsx`
- Modify: `src/components/Footer.tsx`
- Modify: `src/app/globals.css` (`.sub-nav` background)
- Modify: `src/components/SubNav.tsx` (one class)

**Interfaces:**
- Consumes: `.display`, `.eyebrow`, tokens.
- Produces: unchanged component APIs.

- [ ] **Step 1: SectionHeader**

Replace the `h2` and action link in `src/components/SectionHeader.tsx`:

```tsx
<h2 className="display flex items-center gap-3 text-[26px] text-[var(--text)] sm:text-[30px]">
  <span aria-hidden className="h-[22px] w-1.5 shrink-0 rounded-sm bg-[var(--sig)]" />
  <span>{children}</span>
</h2>
```

```tsx
<Link href={action.href} className="shrink-0 text-[13px] font-bold text-[var(--sig-ink)] hover:underline">
  {action.label} →
</Link>
```

Keep `description` and `tools` as they are.

- [ ] **Step 2: PageHeader**

`.page-title` already changed in Task 1. In `PageHeader.tsx`, the subtitle becomes `mt-1.5 text-sm text-[var(--text-muted)]`. No other change.

- [ ] **Step 3: SubNav**

In `SubNav.tsx`, the wrapper keeps its sticky behaviour; change `bg-[var(--bg)]/95` to `bg-[var(--bg)]/95 border-[var(--border)]` (no visual regression), and the title `Link` gets `display text-[15px]` in place of `text-sm font-bold tracking-tight`.

- [ ] **Step 4: Footer**

In `Footer.tsx`:
- `<footer className="mt-auto border-t border-[var(--header-border)] bg-[var(--mast)] text-[var(--mast-muted)]">`
- The logo `Link` gets `text-[var(--mast-text)]`.
- The description paragraph: `text-[var(--mast-muted)]`.
- In `Column`: the `h3` becomes `text-[var(--sig)]`; the links `text-[var(--mast-muted)] transition hover:text-[var(--mast-text)]`.
- Any bottom row (privacy, terms, cookie settings, the `CookieSettingsButton`) that uses `border-[var(--border)]` becomes `border-white/10`, and its text `text-[var(--mast-muted)]`.

- [ ] **Step 5: Verify**

Run: `npm run lint && npx tsc --noEmit && npm test`. Browser: `/epl/standings`, `/nba`, `/tennis`, `/f1` show display-face titles with the Volt bar, Volt tab underline, navy footer with legible links, in both themes.

- [ ] **Step 6: Commit**

```bash
git add src/components/SectionHeader.tsx src/components/PageHeader.tsx src/components/SubNav.tsx src/components/Footer.tsx src/app/globals.css
git commit -m "Set section and page titles in the display face and paint the footer navy

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: League snapshot (shared mini table + leaders)

**Files:**
- Create: `src/lib/leagueSnapshot.ts`
- Create: `src/components/LeagueSnapshot.tsx`
- Modify: `src/components/OffseasonRecap.tsx:71-141` (replace the table + leaders block with the new component)
- Modify: `src/lib/homeData.ts` (a `readSnapshots` tier, `HomeSection.snapshot`)
- Test: `tests/league-snapshot.test.ts`

**Interfaces:**
- Consumes: `OffseasonRecap` from `src/lib/offseason.ts` (`table: StandingRow[]`, `tableSize`, `leaders: { label; unit; rows: LeaderRow[] }[]`, `season`, `seasonLabel`, `seasonOver`), `formatLeaderValue(value, unit)` from `src/lib/leaders.ts`, `record()` logic from `OffseasonRecap.tsx`.
- Produces: `export interface LeagueSnapshotData { season: number; seasonLabel: string; inSeason: boolean; table: StandingRow[]; tableSize: number; leaders: { label: string; unit: string; rows: LeaderRow[] }[] }`, `export function snapshotFromRecap(recap: OffseasonRecap, opts?: { tableRows?: number; boards?: number; leaderRows?: number }): LeagueSnapshotData`, `export function LeagueSnapshot({ league, data }: { league: League; data: LeagueSnapshotData })` (renders nothing when both lists are empty), and `HomeSection.snapshot: LeagueSnapshotData | null`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/league-snapshot.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { snapshotFromRecap } from "../src/lib/leagueSnapshot";
import type { OffseasonRecap } from "../src/lib/offseason";

const row = (i: number) => ({ team_espn_id: String(i), name: `Team ${i}`, slug: `team-${i}`, logo_url: null, color: null, wins: 5 - i, losses: i, draws: 0, points: 15 - 3 * i }) as OffseasonRecap["table"][number];
const leader = (i: number) => ({ player_espn_id: String(i), name: `Player ${i}`, slug: `player-${i}`, headshot_url: null, team_name: "Team", value: 6 - i, rank: i + 1 }) as OffseasonRecap["leaders"][number]["rows"][number];

const recap = {
  season: 2026,
  seasonLabel: "2026-27",
  seasonOver: false,
  table: [0, 1, 2, 3, 4, 5, 6].map(row),
  tableSize: 20,
  leaders: [
    { label: "Goals", unit: "gls", rows: [0, 1, 2, 3, 4].map(leader) },
    { label: "Assists", unit: "ast", rows: [0, 1].map(leader) },
  ],
} as unknown as OffseasonRecap;

test("the homepage snapshot trims to five table rows, one board of three", () => {
  const s = snapshotFromRecap(recap, { tableRows: 5, boards: 1, leaderRows: 3 });
  assert.equal(s.table.length, 5);
  assert.equal(s.tableSize, 20);
  assert.equal(s.leaders.length, 1);
  assert.equal(s.leaders[0].rows.length, 3);
  assert.equal(s.inSeason, true);
  assert.equal(s.seasonLabel, "2026-27");
});

test("without options nothing is trimmed (the league hub shows the full recap)", () => {
  const s = snapshotFromRecap(recap);
  assert.equal(s.table.length, 7);
  assert.equal(s.leaders.length, 2);
  assert.equal(s.leaders[0].rows.length, 5);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx --test tests/league-snapshot.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Create the pure data helper**

```ts
// src/lib/leagueSnapshot.ts
import type { OffseasonRecap } from "./offseason";

export interface LeagueSnapshotData {
  season: number;
  seasonLabel: string;
  inSeason: boolean;
  table: OffseasonRecap["table"];
  tableSize: number;
  leaders: OffseasonRecap["leaders"];
}

/** The table and leaders of a recap, optionally trimmed for a compact block (the homepage). */
export function snapshotFromRecap(recap: OffseasonRecap, opts: { tableRows?: number; boards?: number; leaderRows?: number } = {}): LeagueSnapshotData {
  const leaders = (opts.boards !== undefined ? recap.leaders.slice(0, opts.boards) : recap.leaders).map((b) => ({
    ...b,
    rows: opts.leaderRows !== undefined ? b.rows.slice(0, opts.leaderRows) : b.rows,
  }));
  return {
    season: recap.season,
    seasonLabel: recap.seasonLabel,
    inSeason: !recap.seasonOver,
    table: opts.tableRows !== undefined ? recap.table.slice(0, opts.tableRows) : recap.table,
    tableSize: recap.tableSize,
    leaders,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx --test tests/league-snapshot.test.ts`
Expected: PASS.

- [ ] **Step 5: Create the LeagueSnapshot component**

```tsx
// src/components/LeagueSnapshot.tsx
import Link from "next/link";
import { isSoccerLeague, isCricketLeague, type League } from "@/lib/leagues";
import { formatLeaderValue } from "@/lib/leaders";
import { formatWinLossTie } from "@/lib/teamSummary";
import { cricketRecord } from "@/lib/cricketStandings";
import type { LeagueSnapshotData } from "@/lib/leagueSnapshot";
import { SectionHeader } from "./SectionHeader";
import { TeamLogo } from "./TeamLogo";

function record(league: League, r: LeagueSnapshotData["table"][number]): string {
  if (isSoccerLeague(league)) return `${r.wins}-${r.draws ?? 0}-${r.losses}`;
  if (isCricketLeague(league)) return cricketRecord(r);
  return formatWinLossTie(r.wins, r.losses, r.draws);
}

// The top of a season's table beside its leading players, with links on to the full pages.
// The league hub shows the whole recap; the homepage passes a trimmed snapshot.
export function LeagueSnapshot({ league, data }: { league: League; data: LeagueSnapshotData }) {
  if (data.table.length === 0 && data.leaders.length === 0) return null;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {data.table.length > 0 && (
        <section>
          <SectionHeader action={{ label: `All ${data.tableSize} teams`, href: `/${league}/standings/${data.season}` }}>
            {data.inSeason ? "Table" : "Final table"}, {data.seasonLabel}
          </SectionHeader>
          <ol className="card overflow-hidden">
            {data.table.map((r, i) => (
              <li key={r.team_espn_id} className="table-row first:border-t-0">
                <Link href={`/${league}/teams/${r.slug}`} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span className={`display w-5 text-right text-lg ${i === 0 ? "text-[var(--sig-ink)]" : "text-[var(--text-faint)]"}`}>{i + 1}</span>
                    <TeamLogo name={r.name} logoUrl={r.logo_url} color={r.color} size={24} />
                    <span className="truncate font-semibold">{r.name}</span>
                  </span>
                  <span className="flex shrink-0 items-baseline gap-3 tabular-nums">
                    <span className="text-xs text-[var(--text-muted)]">{record(league, r)}</span>
                    {r.points !== null && (
                      <span className="display text-xl">
                        {r.points} <span className="font-sans text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">pts</span>
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}

      {data.leaders.length > 0 && (
        <section>
          <SectionHeader action={{ label: "All leaders", href: `/${league}/leaders` }}>Season leaders, {data.seasonLabel}</SectionHeader>
          <div className="card divide-y divide-[var(--border)]">
            {data.leaders.map((board) => {
              const top = board.rows[0]?.value || 1;
              return (
                <div key={board.label} className="px-4 py-3">
                  <h3 className="eyebrow text-[var(--text-muted)]">{board.label}</h3>
                  <ol className="mt-2 flex flex-col gap-2.5">
                    {board.rows.map((row, rank) => {
                      const n = row.rank ?? rank + 1;
                      return (
                        <li key={row.player_espn_id}>
                          <Link href={`/${league}/players/${row.slug}`} className="flex items-center gap-3 text-sm">
                            <span className={`display w-5 text-right text-xl ${n === 1 ? "text-[var(--sig-ink)]" : "text-[var(--text-faint)]"}`}>{n}</span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-baseline gap-1.5 truncate">
                                <span className="font-semibold">{row.name}</span>
                                {row.team_name && <span className="text-xs text-[var(--text-muted)]">{row.team_name}</span>}
                              </span>
                              <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-[var(--surface-muted)]">
                                <span className="block h-full rounded-full bg-[var(--sig)]" style={{ width: `${Math.max(6, Math.round((row.value / top) * 100))}%` }} />
                              </span>
                            </span>
                            <span className="display shrink-0 text-2xl tabular-nums">
                              {formatLeaderValue(row.value, board.unit)}
                              <span className="ml-1 font-sans text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">{board.unit}</span>
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Use it in OffseasonRecap**

In `src/components/OffseasonRecap.tsx`, delete the local `record` function and its three imports (`formatLeaderValue`, `formatWinLossTie`, `cricketRecord`) plus the `TeamLogo` import if now unused, and replace the entire `{(recap.table.length > 0 || recap.leaders.length > 0) && ( <div className="grid gap-6 lg:grid-cols-2"> ... </div> )}` block with:

```tsx
<LeagueSnapshot league={league} data={snapshotFromRecap(recap)} />
```

with `import { LeagueSnapshot } from "./LeagueSnapshot";` and `import { snapshotFromRecap } from "@/lib/leagueSnapshot";`.

- [ ] **Step 7: Add the homepage snapshot tier**

In `src/lib/homeData.ts`:
- Import `getOffseasonRecap` from `./offseason` and `snapshotFromRecap, type LeagueSnapshotData` from `./leagueSnapshot`.
- Add after `readFixtures`:

```ts
// The top of each league's table and its first leaders board, for the homepage league
// blocks. Same tier as the fixtures: a table moves only when a game ends.
const readSnapshots = unstable_cache(
  async () =>
    Object.fromEntries(
      await Promise.all(
        SECTION_LEAGUES.map(async (league) => {
          const recap = await getOffseasonRecap(league).catch(() => null);
          return [league, recap ? snapshotFromRecap(recap, { tableRows: 5, boards: 1, leaderRows: 3 }) : null] as const;
        })
      )
    ) as Partial<Record<League, LeagueSnapshotData | null>>,
  ["home-snapshots"],
  { revalidate: TIER.FIXTURES }
);
```

- Add `snapshot: LeagueSnapshotData | null;` to `HomeSection` with the doc comment `/** Top five of the table and the leading players, or null when the league has no season data. */`.
- In `getHomeData`, add `readSnapshots()` to the `Promise.all` (as `snapshots`) and set `snapshot: snapshots[s.league] ?? null` when pushing each section.

- [ ] **Step 8: Verify**

Run: `npm test && npm run lint && npx tsc --noEmit`. Browser: `/epl` between matchdays still shows the table and leaders (now via `LeagueSnapshot`).

- [ ] **Step 9: Commit**

```bash
git add src/lib/leagueSnapshot.ts src/components/LeagueSnapshot.tsx src/components/OffseasonRecap.tsx src/lib/homeData.ts tests/league-snapshot.test.ts
git commit -m "Extract the league snapshot and read it for the homepage

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Homepage

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/components/HomeLive.tsx` (an `id="live"` on the section, no other change)
- Modify: `src/app/layout.tsx` (`<main>` padding)

**Interfaces:**
- Consumes: `HomeSection.snapshot` (Task 6), `LeagueSnapshot`, `.band`, `.band-hero`, `.eyebrow`, `.display`, `StoryCard` from Task 8 is NOT used here yet (Task 9 swaps the teaser); this task keeps `ArticleTeaserCard`.

- [ ] **Step 1: Let the hero bleed full width**

The root layout's `<main>` keeps `container-x flex-1 pb-12 pt-6` untouched. The hero (and, later, the Beyond the Scoreline bands) escape the container with a helper, the same trick `SubNav` already plays with `-mx-4 sm:-mx-6`, plus a `-mt-6` so the band sits flush under the scores strip. Add to `globals.css` under "Layout helpers":

```css
/* Full-bleed inside the centred container: stretches to the viewport edges while its
   content stays aligned with the container. Used by the dark bands. */
.bleed {
  margin-inline: calc(50% - 50vw);
  padding-inline: calc(50vw - 50%);
}
```

and, so a classic (non-overlay) scrollbar can never turn the 50vw into a few pixels of sideways scroll, add to the `body` rule: `overflow-x: clip;` (`clip`, not `hidden`: `hidden` would make `body` a scroll container and break the sticky header). `.band-hero` sets `overflow: hidden` for its wash; the `.bleed` helper itself sets no overflow.

- [ ] **Step 2: Rewrite the homepage top**

In `src/app/page.tsx`, replace the hero `<section className="grid gap-6 lg:grid-cols-5 lg:items-center">…</section>` with:

```tsx
<section className="band band-hero bleed -mt-6 py-9 sm:py-11">
  <div className="grid gap-8 lg:grid-cols-5 lg:items-center">
    <div className="flex flex-col gap-5 lg:col-span-3">
      <div>
        <p className="eyebrow">Football · Cricket · NFL · NBA · Tennis · F1</p>
        <h1 className="display mt-2 max-w-3xl text-[44px] leading-[0.95] sm:text-[64px] lg:text-[80px]">
          Live scores. <span className="text-[var(--sig)]">The full record</span> behind them.
        </h1>
        <p className="mt-4 max-w-xl text-[16px] text-[var(--mast-muted)]">
          Open any match for the scorecard or box score, any player for their game log, any team for every season back to
          2015. Cricket goes back further: the IPL from its first season in 2008, World Cups to 1975.
        </p>
      </div>
      <ul className="flex flex-wrap gap-2" aria-label="Browse by competition">
        {liveTotal > 0 && (
          <li>
            <a href="#live" className="inline-flex items-center gap-2 rounded-full bg-[var(--sig)] px-3.5 py-1.5 text-sm font-bold text-[var(--sig-on)]">
              <span className="live-dot bg-[var(--sig-on)]" aria-hidden />
              {liveTotal} live now
            </a>
          </li>
        )}
        {QUICK_LINKS.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              className="inline-flex items-center rounded-full border border-white/15 px-3.5 py-1.5 text-sm font-semibold text-[var(--mast-text)] transition hover:border-[var(--sig)] hover:text-[var(--sig)]"
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
    {spotlight && (
      <div className="lg:col-span-2">
        <SpotlightCard game={spotlight} />
      </div>
    )}
  </div>
</section>
```

and compute `const liveTotal = home.liveGames.length + home.liveCricket.length + home.liveTennis.length;` after `getHomeData()`.

In `HomeLive.tsx`, give the Live now `<section>` the attribute `id="live"` and `className="scroll-mt-[calc(var(--header-h)+3.5rem)]"`.

- [ ] **Step 3: League blocks with the snapshot**

Replace `LeagueBlock` in `page.tsx` with:

```tsx
function LeagueBlock({ section }: { section: HomeSection }) {
  const { league, games, liveCount, snapshot } = section;
  return (
    <section className="sm:col-span-2">
      <SectionHeader
        action={{ label: "All fixtures", href: `/${league}` }}
        description={liveCount > 0 ? `${liveCount} in play, listed under Live now above` : "Latest results and next fixtures"}
      >
        {LEAGUE_LABEL[league]}
      </SectionHeader>
      {games.length === 0 ? (
        <p className="card px-4 py-4 text-sm text-[var(--text-muted)]">Everything this week is listed above.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {games.slice(0, 3).map((g) => (
            <GameCard key={g.espn_id} league={league} game={g} />
          ))}
        </div>
      )}
      {snapshot && (
        <div className="mt-5">
          <LeagueSnapshot league={league} data={snapshot} />
        </div>
      )}
      <div className="mt-3 flex gap-4 text-sm font-semibold">
        <Link href={`/${league}/standings`} className="text-[var(--accent)] hover:underline">Standings</Link>
        <Link href={`/${league}/leaders`} className="text-[var(--accent)] hover:underline">Leaders</Link>
        <Link href={`/${league}/teams`} className="text-[var(--accent)] hover:underline">Teams</Link>
      </div>
    </section>
  );
}
```

Import `LeagueSnapshot` from `@/components/LeagueSnapshot`. The blocks now each span both columns of the `sm:grid-cols-2` grid (the cricket block already does), so the left column reads as a stack of full-width league blocks.

- [ ] **Step 4: Right column callout**

Under the Beyond the Scoreline `<aside>` in `page.tsx`, after the teaser list, add:

```tsx
<div className="mt-4 rounded-xl border border-[color-mix(in_srgb,var(--sig)_40%,transparent)] bg-[var(--sig-soft)] p-4">
  <p className="display text-[22px] text-[var(--text)]">Follow the desk</p>
  <p className="mt-1 text-[13px] text-[var(--text-muted)]">Every result and every record, posted the same day.</p>
  <a href="https://x.com/sportsdblive" target="_blank" rel="noopener noreferrer" className="mt-3 inline-block rounded-lg bg-[var(--mast)] px-3.5 py-2 text-[13px] font-bold text-[var(--mast-text)]">
    @sportsdblive on X
  </a>
</div>
```

- [ ] **Step 5: Verify**

Run: `npm run lint && npx tsc --noEmit && npm test`. Browser `/` at 375px, 1024px, 1440px, light and dark: the hero bleeds edge to edge with no horizontal scroll, the "N live now" pill scrolls to Live now, league blocks show three cards then the table and leaders, the callout renders.

- [ ] **Step 6: Commit**

```bash
git add src/app/page.tsx src/components/HomeLive.tsx src/app/globals.css
git commit -m "Lead the homepage with a navy hero and add table and leaders to each league block

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Article art and the story card

**Files:**
- Modify: `src/lib/beyondTheScoreline.ts` (the `art` field)
- Create: `src/lib/articleArt.ts`
- Create: `src/components/StoryCard.tsx`
- Delete: `src/components/ArticleTeaserCard.tsx` (after Task 9 swaps its last use; in this task, keep it and only add)
- Modify: the four files in `src/content/beyondTheScoreline/` (add `art`)
- Modify: `src/app/globals.css` (`.art-*` palettes)
- Test: `tests/article-art.test.ts`, `tests/beyond-the-scoreline-registry.test.ts`

**Interfaces:**
- Produces: `export type ArtPalette = "football" | "cricket" | "f1" | "asian-games" | "nfl" | "nba" | "tennis" | "neutral"`, `export interface ArticleArt { number: string; caption?: string; palette: ArtPalette }`, `BeyondTheScorelineArticle.art?: ArticleArt`, `export const ART_PALETTES: readonly ArtPalette[]`, `export function articleArt(article: Pick<BeyondTheScorelineArticle, "art" | "tags">): { number: string | null; caption: string | null; palette: ArtPalette; sport: string }`, `export function StoryCard({ article, variant }: { article: BeyondTheScorelineArticle; variant: "lead" | "grid" | "row" })`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/article-art.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { articleArt, paletteForTags, ART_PALETTES } from "../src/lib/articleArt";

test("a declared art block is used as is", () => {
  const a = articleArt({ art: { number: "9", caption: "men's golds since 1990", palette: "asian-games" }, tags: ["kabaddi"] });
  assert.deepEqual(a, { number: "9", caption: "men's golds since 1990", palette: "asian-games", sport: "Asian Games" });
});

test("without art, the palette and sport come from the first recognised tag", () => {
  assert.equal(paletteForTags(["premier-league", "man-city"]), "football");
  assert.equal(paletteForTags(["formula-1"]), "f1");
  assert.equal(paletteForTags(["f1"]), "f1");
  assert.equal(paletteForTags(["ipl", "cricket"]), "cricket");
  assert.equal(paletteForTags(["something-else"]), "neutral");
  const a = articleArt({ tags: ["nba"] });
  assert.equal(a.number, null);
  assert.equal(a.palette, "nba");
  assert.equal(a.sport, "NBA");
});

test("every palette has a CSS class in globals.css", async () => {
  const { readFileSync } = await import("node:fs");
  const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
  for (const p of ART_PALETTES) assert.match(css, new RegExp(`\\.art-${p}\\b`), p);
});
```

Append to `tests/beyond-the-scoreline-registry.test.ts`:

```ts
import { ART_PALETTES } from "../src/lib/articleArt";

test("an article that declares art gives a non-empty number and a known palette", () => {
  for (const a of listArticles()) {
    if (!a.art) continue;
    assert.ok(a.art.number.trim().length > 0, `${a.slug}: art.number is empty`);
    assert.ok((ART_PALETTES as readonly string[]).includes(a.art.palette), `${a.slug}: unknown palette ${a.art.palette}`);
  }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx tsx --test tests/article-art.test.ts tests/beyond-the-scoreline-registry.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Add the type and the helper**

In `src/lib/beyondTheScoreline.ts`, add above `BeyondTheScorelineArticle`:

```ts
export type ArtPalette = "football" | "cricket" | "f1" | "asian-games" | "nfl" | "nba" | "tennis" | "neutral";

/** The generated "picture" of an article: its key number on a sport-coloured panel. */
export interface ArticleArt {
  number: string;
  caption?: string;
  palette: ArtPalette;
}
```

and to the interface: `  /** Optional: the auto-draft routine writes none; the card then shows the sport name. */\n  art?: ArticleArt;`.

Create `src/lib/articleArt.ts`:

```ts
import type { ArtPalette, BeyondTheScorelineArticle } from "./beyondTheScoreline";

export const ART_PALETTES: readonly ArtPalette[] = ["football", "cricket", "f1", "asian-games", "nfl", "nba", "tennis", "neutral"];

const SPORT_LABEL: Record<ArtPalette, string> = {
  football: "Football",
  cricket: "Cricket",
  f1: "Formula 1",
  "asian-games": "Asian Games",
  nfl: "NFL",
  nba: "NBA",
  tennis: "Tennis",
  neutral: "Beyond the Scoreline",
};

// First match wins; tags are the article's own, lower-case, hyphenated.
const TAG_PALETTE: [RegExp, ArtPalette][] = [
  [/^(asian-games|kabaddi|hockey|shooting|athletics|medal)/, "asian-games"],
  [/^(f1|formula-1|formula1|grand-prix)/, "f1"],
  [/^(cricket|ipl|bbl|wpl|odi|t20|test-cricket|world-cup-cricket)/, "cricket"],
  [/^(nfl|super-bowl)/, "nfl"],
  [/^(nba|basketball)/, "nba"],
  [/^(tennis|atp|wta|grand-slam)/, "tennis"],
  [/^(football|soccer|premier-league|la-liga|laliga|bundesliga|serie-a|seriea|champions-league|ucl|epl|man-city|arsenal|liverpool|barcelona|real-madrid)/, "football"],
];

export function paletteForTags(tags: string[]): ArtPalette {
  for (const tag of tags) {
    const hit = TAG_PALETTE.find(([re]) => re.test(tag.toLowerCase()));
    if (hit) return hit[1];
  }
  return "neutral";
}

export function articleArt(article: Pick<BeyondTheScorelineArticle, "art" | "tags">): { number: string | null; caption: string | null; palette: ArtPalette; sport: string } {
  const palette = article.art?.palette ?? paletteForTags(article.tags);
  return { number: article.art?.number ?? null, caption: article.art?.caption ?? null, palette, sport: SPORT_LABEL[palette] };
}
```

- [ ] **Step 4: Palette classes**

Add to `globals.css`:

```css
/* ---------------------------------------------------------------------------
   Article art: the sport-coloured panel behind an article's key number.
--------------------------------------------------------------------------- */
.art {
  position: relative;
  overflow: hidden;
  color: #ffffff;
}

.art::after {
  content: "";
  position: absolute;
  right: -40px;
  top: -40px;
  width: 220px;
  height: 220px;
  border-radius: 50%;
  border: 28px solid rgba(255, 255, 255, 0.12);
  pointer-events: none;
}

.art-football { background: linear-gradient(120deg, #6cabdd, #1c2c5b 90%); }
.art-cricket { background: linear-gradient(120deg, #1d9a6c, #0b3d2e 90%); }
.art-f1 { background: linear-gradient(120deg, #101010, #2a2a2a 60%, #e10600 160%); }
.art-asian-games { background: linear-gradient(120deg, #ff9933 0%, #ff6a00 60%, #138808 140%); }
.art-nfl { background: linear-gradient(120deg, #013369, #d50a0a 140%); }
.art-nba { background: linear-gradient(120deg, #c9082a, #17408b 110%); }
.art-tennis { background: linear-gradient(120deg, #c8f135, #1f6f3a 100%); color: #0b1324; }
.art-neutral { background: linear-gradient(120deg, #121c33, #0b1324 90%); }
```

- [ ] **Step 5: StoryCard**

```tsx
// src/components/StoryCard.tsx
import Link from "next/link";
import type { BeyondTheScorelineArticle } from "@/lib/beyondTheScoreline";
import { articleArt } from "@/lib/articleArt";

function formatPublished(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

// One article as a card: its generated art on top (or on the left, as a row), then sport, title,
// dek and the meta line. "lead" is the index's top story, "grid" the index cards and homepage
// stack, "row" a slim art-left card for narrow columns.
export function StoryCard({ article, variant }: { article: BeyondTheScorelineArticle; variant: "lead" | "grid" | "row" }) {
  const art = articleArt(article);
  const row = variant === "row";
  const lead = variant === "lead";
  return (
    <Link href={`/beyond-the-scoreline/${article.slug}`} className={`card group flex overflow-hidden ${row ? "flex-row" : "flex-col"}`}>
      <span
        className={`art art-${art.palette} flex shrink-0 items-end p-4 ${row ? "w-28 self-stretch" : lead ? "aspect-[16/9]" : "aspect-[16/8]"}`}
        aria-hidden
      >
        <span>
          <span className={`display block ${row ? "text-[40px]" : lead ? "text-[112px]" : "text-[72px]"} leading-[0.85]`}>{art.number ?? art.sport}</span>
          {!row && art.caption && <span className="mt-2 block max-w-[30ch] text-xs font-semibold opacity-85">{art.caption}</span>}
        </span>
      </span>
      <span className={`flex min-w-0 flex-col gap-1.5 ${row ? "p-3" : "p-4"}`}>
        <span className="eyebrow text-[var(--sig-ink)]">{art.sport}</span>
        <span className={`display text-[var(--text)] group-hover:text-[var(--sig-ink)] ${row ? "text-[20px]" : lead ? "text-[34px]" : "text-[24px]"}`}>{article.title}</span>
        {!row && <span className="text-sm text-[var(--text-muted)]">{article.dek}</span>}
        <span className="mt-0.5 text-xs font-semibold text-[var(--text-faint)]">
          {formatPublished(article.publishedAt)} · {article.readingMinutes} min read
        </span>
      </span>
    </Link>
  );
}
```

- [ ] **Step 6: Give the four articles an art block**

Add an `art` property to each content file, after `tags`:
- `kabaddi-golden-sweep-asian-games.tsx`: `art: { number: "9", caption: "men's kabaddi golds since the sport joined in 1990", palette: "asian-games" },`
- `russell-baku-win-cuts-title-gap.tsx`: `art: { number: "66", caption: "points between Antonelli and Russell after Baku, down from 81", palette: "f1" },`
- `man-city-guilty-verdict-115-charges.tsx`: `art: { number: "114/115", caption: "charges proven against Manchester City", palette: "football" },`
- `second-gold-asian-record.tsx`: `art: { number: "10", caption: "of India's medals at these Games have come from shooting", palette: "asian-games" },` (verify the count against the article's own text and adjust the number and caption to what the article states).

Any other article file present in `src/content/beyondTheScoreline/` at execution time (the daily routine adds one a day) may be left without `art`.

- [ ] **Step 7: Run the tests**

Run: `npm test && npm run lint && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/beyondTheScoreline.ts src/lib/articleArt.ts src/components/StoryCard.tsx src/content/beyondTheScoreline src/app/globals.css tests/article-art.test.ts tests/beyond-the-scoreline-registry.test.ts
git commit -m "Add generated art to Beyond the Scoreline articles and a story card

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Beyond the Scoreline index

**Files:**
- Modify: `src/app/beyond-the-scoreline/page.tsx`
- Create: `src/lib/articleTopics.ts`
- Create: `src/components/ArticleTopicFilter.tsx` (client)
- Modify: `src/components/Breadcrumbs.tsx` (optional `tone="band"` prop)
- Modify: `src/app/page.tsx` (swap `ArticleTeaserCard` for `StoryCard variant="row"`)
- Delete: `src/components/ArticleTeaserCard.tsx`
- Test: `tests/beyond-the-scoreline-pages.test.ts` (existing index test must still pass), `tests/article-topics.test.ts`

**Interfaces:**
- Consumes: `StoryCard`, `articleArt`, `.band`, `.bleed`.
- Produces: `export interface Topic { key: ArtPalette; label: string; count: number }` and `export function topicsFor(articles: { tags: string[]; art?: { palette: ArtPalette } }[]): { key: ArtPalette; label: string; count: number }[]` in `src/lib/articleTopics.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/article-topics.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { topicsFor } from "../src/lib/articleTopics";

test("topics are the distinct palettes of the articles, most frequent first, with labels", () => {
  const topics = topicsFor([
    { tags: ["asian-games"] },
    { tags: ["f1"] },
    { tags: ["premier-league"], art: { palette: "football", number: "1" } },
    { tags: ["kabaddi"] },
  ]);
  assert.deepEqual(topics, [
    { key: "asian-games", label: "Asian Games", count: 2 },
    { key: "f1", label: "Formula 1", count: 1 },
    { key: "football", label: "Football", count: 1 },
  ]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx --test tests/article-topics.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement articleTopics.ts**

```ts
// src/lib/articleTopics.ts
import type { ArtPalette } from "./beyondTheScoreline";
import { articleArt } from "./articleArt";

export interface Topic {
  key: ArtPalette;
  label: string;
  count: number;
}

/** The filter pills on the index: one per sport that has an article, most written-about first, ties by first appearance. */
export function topicsFor(articles: { tags: string[]; art?: { palette: ArtPalette } }[]): Topic[] {
  const seen = new Map<ArtPalette, Topic>();
  for (const a of articles) {
    const { palette, sport } = articleArt({ tags: a.tags, art: a.art ? { number: "", palette: a.art.palette } : undefined });
    const t = seen.get(palette);
    if (t) t.count += 1;
    else seen.set(palette, { key: palette, label: sport, count: 1 });
  }
  const order = [...seen.keys()];
  return [...seen.values()].sort((x, y) => y.count - x.count || order.indexOf(x.key) - order.indexOf(y.key));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx --test tests/article-topics.test.ts`
Expected: PASS.

- [ ] **Step 5: The client filter**

```tsx
// src/components/ArticleTopicFilter.tsx
"use client";

import { useState } from "react";
import type { ArtPalette } from "@/lib/beyondTheScoreline";
import type { Topic } from "@/lib/articleTopics";

// The topic pills on the index band. Filtering hides cards in place (every card is in the
// server HTML, so search engines and the pages test see all of them); the chosen topic is
// pushed onto <body data-topic> and the cards' CSS does the hiding.
export function ArticleTopicFilter({ topics }: { topics: Topic[] }) {
  const [active, setActive] = useState<ArtPalette | "all">("all");
  function choose(key: ArtPalette | "all") {
    setActive(key);
    document.documentElement.dataset.topic = key;
  }
  const pill = (on: boolean) =>
    `rounded-full border px-3 py-1.5 text-xs font-bold transition ${on ? "border-[var(--sig)] bg-[var(--sig)] text-[var(--sig-on)]" : "border-white/15 text-[var(--mast-text)] hover:border-[var(--sig)] hover:text-[var(--sig)]"}`;
  return (
    <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="Filter by sport">
      <button type="button" className={pill(active === "all")} aria-pressed={active === "all"} onClick={() => choose("all")}>
        All
      </button>
      {topics.map((t) => (
        <button key={t.key} type="button" className={pill(active === t.key)} aria-pressed={active === t.key} onClick={() => choose(t.key)}>
          {t.label} <span className="opacity-70">{t.count}</span>
        </button>
      ))}
    </div>
  );
}
```

Add to `globals.css` (CSS cannot compare two attribute values, hence one rule per palette):

```css
/* Index cards carry data-topic-card; the topic chosen on <html> hides every other card. */
:root[data-topic="football"] [data-topic-card]:not([data-topic-card="football"]),
:root[data-topic="cricket"] [data-topic-card]:not([data-topic-card="cricket"]),
:root[data-topic="f1"] [data-topic-card]:not([data-topic-card="f1"]),
:root[data-topic="asian-games"] [data-topic-card]:not([data-topic-card="asian-games"]),
:root[data-topic="nfl"] [data-topic-card]:not([data-topic-card="nfl"]),
:root[data-topic="nba"] [data-topic-card]:not([data-topic-card="nba"]),
:root[data-topic="tennis"] [data-topic-card]:not([data-topic-card="tennis"]),
:root[data-topic="neutral"] [data-topic-card]:not([data-topic-card="neutral"]) {
  display: none;
}
```

- [ ] **Step 6: Rewrite the index page**

```tsx
// src/app/beyond-the-scoreline/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { pageMeta } from "@/lib/metadata";
import { listArticles } from "@/lib/beyondTheScoreline";
import { articleArt } from "@/lib/articleArt";
import { topicsFor } from "@/lib/articleTopics";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { StoryCard } from "@/components/StoryCard";
import { ArticleTopicFilter } from "@/components/ArticleTopicFilter";
import { SectionHeader } from "@/components/SectionHeader";

export const metadata: Metadata = pageMeta(
  "Beyond the Scoreline",
  "Original long-form sports writing from the SportsDB desk: history, data and the stories behind the scoreline.",
  "/beyond-the-scoreline"
);

export default function BeyondTheScorelineIndexPage() {
  const articles = listArticles();
  const [lead, ...rest] = articles;
  const topics = topicsFor(articles);
  return (
    <div className="flex flex-col gap-8">
      <section className="band bleed -mt-6 py-9 sm:py-11">
        <Breadcrumbs items={[{ label: "Beyond the Scoreline" }]} tone="band" />
        <p className="eyebrow mt-5">Original writing · SportsDB desk</p>
        <h1 className="display mt-2 text-[48px] sm:text-[72px] lg:text-[92px]">Beyond the Scoreline</h1>
        <p className="mt-3 max-w-[58ch] text-[16px] text-[var(--mast-muted)]">
          History, data and the stories the final score doesn&rsquo;t tell. Every piece is built on the same records that power the rest of the site.
        </p>
        {topics.length > 1 && <ArticleTopicFilter topics={topics} />}
      </section>

      {articles.length === 0 ? (
        <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">Nothing published yet. Check back soon.</p>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-5">
            <div className="lg:col-span-3" data-topic-card={articleArt(lead).palette}>
              <StoryCard article={lead} variant="lead" />
            </div>
            <aside className="lg:col-span-2">
              <h2 className="display text-[22px]">Most recent</h2>
              <ol className="mt-2 divide-y divide-[var(--border)]">
                {articles.slice(0, 5).map((a, i) => (
                  <li key={a.slug} className="py-3">
                    <Link href={`/beyond-the-scoreline/${a.slug}`} className="flex items-baseline gap-3">
                      <span className="display w-7 shrink-0 text-[26px] text-[var(--sig-ink)]">{i + 1}</span>
                      <span className="min-w-0">
                        <span className="block font-bold leading-snug hover:text-[var(--sig-ink)]">{a.title}</span>
                        <span className="text-xs text-[var(--text-faint)]">
                          {articleArt(a).sport} · {a.readingMinutes} min
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
              <div className="mt-4 rounded-xl border border-[color-mix(in_srgb,var(--sig)_40%,transparent)] bg-[var(--sig-soft)] p-4">
                <p className="display text-[22px] text-[var(--text)]">New every day</p>
                <p className="mt-1 text-[13px] text-[var(--text-muted)]">The desk publishes one piece a day, built from the day&rsquo;s results.</p>
                <a href="https://x.com/sportsdblive" target="_blank" rel="noopener noreferrer" className="mt-3 inline-block rounded-lg bg-[var(--mast)] px-3.5 py-2 text-[13px] font-bold text-[var(--mast-text)]">
                  Follow @sportsdblive
                </a>
              </div>
            </aside>
          </div>

          {rest.length > 0 && (
            <section>
              <SectionHeader>Latest</SectionHeader>
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {rest.map((a) => (
                  <li key={a.slug} data-topic-card={articleArt(a).palette}>
                    <StoryCard article={a} variant="grid" />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
```

`Breadcrumbs` gets an optional `tone?: "band"` prop: when set, the nav uses `text-[var(--mast-muted)]` and links hover `text-[var(--sig)]`, the last crumb `text-[var(--mast-text)]`. Add that prop in `src/components/Breadcrumbs.tsx` (default behaviour unchanged; `tests/breadcrumbs.test.ts` must still pass).

The share button on each card is dropped from the index (the article page keeps its own); the existing index test only checks each article's link and title.

- [ ] **Step 7: Swap the homepage teaser**

In `src/app/page.tsx`, replace `ArticleTeaserCard` with `StoryCard` (`variant="row"`) and delete `src/components/ArticleTeaserCard.tsx`. `grep -rn ArticleTeaserCard src` must return nothing.

- [ ] **Step 8: Verify**

Run: `npm test && npm run lint && npx tsc --noEmit`. Browser `/beyond-the-scoreline` at 375px and 1280px, light and dark: the band bleeds, the lead card's art is 16:9 with the big number, topic pills hide and show cards, the rail lists the five most recent.

- [ ] **Step 9: Commit**

```bash
git add src/app/beyond-the-scoreline/page.tsx src/components/ArticleTopicFilter.tsx src/lib/articleTopics.ts src/components/Breadcrumbs.tsx src/app/page.tsx src/app/globals.css tests/article-topics.test.ts
git rm src/components/ArticleTeaserCard.tsx
git commit -m "Rebuild the Beyond the Scoreline index around a lead story and topic filters

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Article page

**Files:**
- Modify: `src/components/BeyondTheScorelineArticleLayout.tsx`
- Modify: `src/components/ShareButton.tsx` (optional `tone="band"` prop)
- Create: `src/components/PullStat.tsx`
- Modify: `src/components/KabaddiGoldTimelineChart.tsx` (caption wording + gold colour token)
- Modify: `src/app/globals.css` (`.prose-bts`)
- Test: `tests/beyond-the-scoreline-pages.test.ts` (existing; must keep passing), `tests/pull-stat.test.ts`

**Interfaces:**
- Produces: `export function PullStat({ value, unit, caption }: { value: string; unit?: string; caption: string })` for article bodies.

- [ ] **Step 1: Write the failing test**

```ts
// tests/pull-stat.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PullStat } from "../src/components/PullStat";

test("a pull stat renders its value, unit and caption", () => {
  const html = renderToStaticMarkup(createElement(PullStat, { value: "9", unit: "of 10", caption: "Men's golds since 1990" }));
  assert.match(html, />9</);
  assert.match(html, /of 10/);
  assert.match(html, /Men(&#x27;|')s golds since 1990/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx --test tests/pull-stat.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: PullStat**

```tsx
// src/components/PullStat.tsx
// A number pulled out of an article body: display-face value, small unit, one-line caption, Volt rule.
export function PullStat({ value, unit, caption }: { value: string; unit?: string; caption: string }) {
  return (
    <aside className="my-6 border-l-4 border-[var(--sig)] py-1.5 pl-5">
      <p className="display text-[56px] leading-[0.9] text-[var(--text)] sm:text-[64px]">
        {value}
        {unit && <span className="ml-2 text-[22px] font-bold text-[var(--text-muted)]">{unit}</span>}
      </p>
      <p className="mt-1.5 text-[13px] font-semibold text-[var(--text-muted)]">{caption}</p>
    </aside>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx --test tests/pull-stat.test.ts`
Expected: PASS.

- [ ] **Step 5: Article layout**

Replace the body of `BeyondTheScorelineArticleLayout` with:

```tsx
export function BeyondTheScorelineArticleLayout({ article }: { article: BeyondTheScorelineArticle }) {
  const art = articleArt(article);
  return (
    <div className="flex flex-col">
      <header className="band bleed -mt-6 py-9 sm:py-11">
        <div className="mx-auto max-w-4xl">
          <Breadcrumbs items={[{ label: "Beyond the Scoreline", href: "/beyond-the-scoreline" }, { label: article.title }]} tone="band" />
          <p className="eyebrow mt-5">Beyond the Scoreline · {art.sport}</p>
          <h1 className="display mt-2 max-w-[18ch] text-[40px] sm:text-[56px] lg:text-[72px]">{article.title}</h1>
          <p className="mt-4 max-w-[58ch] text-[19px] leading-[1.45] text-[var(--mast-muted)]">{article.dek}</p>
          <div className="mt-6 flex flex-wrap items-center gap-3 text-[13px] text-[var(--mast-muted)]">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--sig)] text-[11px] font-extrabold text-[var(--sig-on)]" aria-hidden>
              BS
            </span>
            <span>
              <span className="font-bold text-[var(--mast-text)]">{DESK_BYLINE}</span> · {formatPublished(article.publishedAt)} · {article.readingMinutes} min read
            </span>
            <span className="ml-auto">
              <ShareButton path={`/beyond-the-scoreline/${article.slug}`} title={article.title} text={article.dek} tone="band" />
            </span>
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-4xl gap-10 pt-8 lg:grid-cols-[minmax(0,1fr)_200px]">
        <article className="prose-bts max-w-[64ch] text-[17px] leading-[1.65] text-[var(--text)] [&_a]:text-[var(--sig-ink)] [&_a]:underline [&_strong]:font-semibold">
          {article.body()}
          {article.dataAttribution && <p className="mt-8 text-xs text-[var(--text-faint)]">{article.dataAttribution}</p>}
        </article>

        <aside className="text-[13px] lg:sticky lg:top-[calc(var(--header-h)+1rem)] lg:self-start">
          <h2 className="eyebrow text-[var(--text-faint)]">Related on SportsDB</h2>
          <ul className="mt-2 divide-y divide-[var(--border)]">
            {article.relatedLinks.map((link) => (
              <li key={link.href} className="py-2.5">
                <Link href={link.href} className="block font-bold text-[var(--sig-ink)] hover:underline">
                  {link.label}
                </Link>
                {link.description && <p className="text-xs text-[var(--text-faint)]">{link.description}</p>}
              </li>
            ))}
          </ul>
          <h2 className="eyebrow mt-6 text-[var(--text-faint)]">More from the desk</h2>
          <ul className="mt-2 divide-y divide-[var(--border)]">
            {listArticles()
              .filter((a) => a.slug !== article.slug)
              .slice(0, 3)
              .map((a) => (
                <li key={a.slug} className="py-2.5">
                  <Link href={`/beyond-the-scoreline/${a.slug}`} className="block font-bold hover:text-[var(--sig-ink)]">
                    {a.title}
                  </Link>
                  <p className="text-xs text-[var(--text-faint)]">
                    {articleArt(a).sport} · {a.readingMinutes} min
                  </p>
                </li>
              ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}
```

Add imports: `articleArt` from `@/lib/articleArt`, `listArticles` from `@/lib/beyondTheScoreline`. `ShareButton` gets an optional `tone?: "band"` prop that switches its classes to `border-white/20 text-[var(--mast-text)] hover:bg-white/10`; default unchanged.

Add to `globals.css`:

```css
/* Long-form article body. */
.prose-bts > p {
  margin: 0 0 1.25rem;
}

.prose-bts > p:first-of-type::first-letter {
  font-family: var(--font-display);
  font-size: 4.25rem;
  font-weight: 800;
  line-height: 0.8;
  float: left;
  margin: 0.35rem 0.6rem 0 0;
  color: var(--sig-ink);
}
```

The old `flex flex-col gap-4` on the body wrapper is replaced by these paragraph margins, so any non-`p` children (charts, `PullStat`) keep their own margins.

- [ ] **Step 6: Chart colour wording**

In `KabaddiGoldTimelineChart.tsx`, the gold dot already uses `bg-[var(--accent)]` (now Volt ink / Volt); change the caption text "Gold in blue, runner-up in grey." to "Gold in the highlight colour, runner-up in grey." Check the other chart components used by articles (`grep -l "var(--accent)" src/components/*Chart*.tsx`) for captions that name "blue" and reword them the same way.

- [ ] **Step 7: Verify**

Run: `npm test && npm run lint && npx tsc --noEmit`. The pages test still finds title, dek, related links, attribution and exactly one BlogPosting block. Browser: one article at 375px and 1280px, both themes: the band, the drop cap, the sticky rail on desktop and hidden-in-flow rail on mobile (it simply stacks below the prose), no horizontal scroll.

- [ ] **Step 8: Commit**

```bash
git add src/components/BeyondTheScorelineArticleLayout.tsx src/components/PullStat.tsx src/components/ShareButton.tsx src/components/KabaddiGoldTimelineChart.tsx src/app/globals.css tests/pull-stat.test.ts
git commit -m "Open each article with a navy header and a two-column long-form body

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Full verification and the PR

**Files:**
- None new. Fixes discovered here go into the file they belong to.

- [ ] **Step 1: Automated checks**

Run: `npm test && npm run lint && npx tsc --noEmit` and, when `DATABASE_URL` is set, `npm run build`.
Expected: all green.

- [ ] **Step 2: Browser pass**

With the dev server open through the preview tooling (`sports-stats-dev`, port 3010), for each of `/`, `/beyond-the-scoreline`, one article, `/epl`, `/epl/standings`, `/nba`, `/tennis`, `/f1`, `/asian-games`, `/search?q=haaland`, `/nope` (404):
- At 375px, 1024px, 1280px, 1440px: `document.documentElement.scrollWidth <= window.innerWidth`.
- Light (default) and dark (toggle): masthead, strip, cards, footer legible; no white-on-white or navy-on-navy text.
- Console has no errors.
Record any failure, fix it in the owning component, re-run Step 1, and repeat this step for the affected page.

- [ ] **Step 3: Contrast spot check**

In the browser console on `/`: `getComputedStyle(document.querySelector('.eyebrow')).color` on a band is Volt; on `/beyond-the-scoreline` a story card's eyebrow is `--sig-ink` (`rgb(77, 124, 15)`). Both pass AA on their grounds (4.5:1 minimum; Volt on navy is above 12:1, ink on white 5.0:1).

- [ ] **Step 4: Push and open the PR**

```bash
git push -u origin design/broadcast-redesign
gh pr create --title "Broadcast redesign: Volt on navy, Barlow Condensed, new homepage and Beyond the Scoreline" --body "$(cat <<'EOF'
## Summary
- New visual identity through the shared tokens: Volt signature colour on a navy masthead, Barlow Condensed headlines, light body by default, full dark mode kept.
- Scores strip of chips replaces the ticker marquee (`/api/ticker` gains structured fields, keeps `label`/`href`).
- Match cards carry team-colour stripes and display-face scores; the spotlight is a team-colour gradient.
- Homepage leads with a navy hero and each league block adds the top of the table and its leaders (shared `LeagueSnapshot`, also used by the league hub between matchdays).
- Beyond the Scoreline gets a lead story, generated art per article, topic filters, and a long-form article layout.
- Fixes the header overflow at 1024 to 1290px viewports.

Spec: `docs/superpowers/specs/2026-09-28-broadcast-redesign-design.md`. Plan: `docs/superpowers/plans/2026-09-28-broadcast-redesign.md`.

## Test plan
- [ ] `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`
- [ ] Browser pass listed in the plan's Task 11 (widths 375/1024/1280/1440, both themes, no horizontal scroll)
- [ ] After deploy, purge the Cloudflare cache per the production notes

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Do not enable auto-merge. Report the PR URL.
