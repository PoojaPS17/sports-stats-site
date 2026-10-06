# Cricket match story, PR 3: scorecard innings tabs, collapsed Playing XI and Match info

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The scorecard becomes innings tabs (every panel in the HTML, `?innings=<period>` picks the opening one) with strike-rate and economy bars, extras, total and fall-of-wickets lines; Playing XI and Match info collapse into two `<details>` cards side by side.

**Architecture:** A pure module (`cricketScorecardView.ts`) turns the parsed scorecard plus the match story into tab data (label, colour, extras, total line, fall of wickets, bar widths). `CricketScorecardTabs` is the only client component (the `CricketSplitTabs` pattern, reading `?innings=` through `useSyncExternalStore`); `CricketScorecardPanel` renders one innings on the server. `CricketPlayingXi` and `CricketMatchInfo` gain a `collapsed` prop that wraps their unchanged content in `<details>` with the same `<h2>` inside the `<summary>`. Both match pages compose them; the export card and `scorecardBlocks` are untouched.

**Tech Stack:** Next 16, React 19, Tailwind v4 tokens, node:test with `renderToStaticMarkup`.

**Spec:** docs/superpowers/specs/2026-10-07-cricket-match-story-design.md (sections 5 and 6)

## Global Constraints

- Colours only through tokens; team colours as inline style (bars at low opacity).
- Every innings panel is in the HTML on the server; the client only chooses which is shown. No `window` reads during render.
- The `<h2>` texts "Scorecard", "Playing XI" and "Match info" stay in the HTML (SEO pack), as do the Playing XI lists and the Match info `<dl>`.
- `tests/css-layers.test.ts`, `cricket-seo-surfaces`, both wiring tests stay green; `scorecardBlocks` keeps its signature (the export card uses it).

---

### Task 1: `src/lib/cricketScorecardView.ts`

**Produces:**
```ts
export interface ScorecardTabData { key: string; team: string; label: string; colour: string | null; block: ScorecardBlock; extras: { total: number | null; breakdown: string | null }; totalLine: string | null; fallOfWickets: string | null }
export function scorecardTabs(scorecard: CricketTeamScorecard[], story: StoryInnings[], colours: Record<string, string>): ScorecardTabData[]
export function strikeRateWidth(sr: string): number   // SR / 250 as a percentage, clamped to 100, 0 when not a number
export function economyWidth(econ: string): number     // econ / 20 as a percentage, clamped to 100
export function inningsFromQuery(search: string, keys: string[]): string
```
- One tab per `scorecardBlocks(scorecard)` block; the story innings with `period === Number(block.key)` supplies the colour (by `teamId`), the extras breakdown ("b 0, lb 4, w 3, nb 1" from the balls' `extra` flags: wides and byes count their runs, a no-ball one), the fall of wickets ("1-38 Pooran (4.3), 2-44 Hetmyer (5.2)", surname = last word of the batter) and the run rate.
- `label`: "West Indies · 171 all out (19.1 ov)" when the block has a total, else "West Indies · 1st innings"/"West Indies".
- `extras.total` = innings runs − Σ batting runs (from `scorecard[].innings` for that period), null when unknown or negative.
- `totalLine`: "171 all out · 19.1 overs · run rate 8.92" (run rate from the story, else runs ÷ overs to 2 dp), null without a total.

- [ ] Failing tests on the 1529230 fixture pair (summary 1554707 has no story: colours null, breakdown null, fall of wickets null, extras from the difference; story-only checks use `deriveMatchStory` of the play-by-play fixture with a synthetic scorecard of the same periods).
- [ ] Implement → pass → commit.

### Task 2: `CricketScorecardTabs` (client) and `CricketScorecardPanel` (server)

- Tabs: `role="tablist"` of `nav-pill` buttons with a colour dot (`inline-block h-2.5 w-2.5 rounded-full`, inline colour, `bg-[var(--border-strong)]` without one), `aria-pressed`, strip `overflow-x-auto`; panels `data-innings={key}` `hidden` when not active.
- Panel: `grid gap-3 lg:grid-cols-[3fr_2fr]`; batting card = `ScorecardTable`-like table where the SR cell is `relative` with a bar `absolute inset-y-1 right-0 rounded-sm` (inline `width: N%`, `backgroundColor: colour`, `opacity: 0.18`; `bg-[var(--sig-soft)]` without a colour), then an Extras row ("Extras 8 (b 0, lb 4, w 3, nb 1)") and a Total row (`totalLine`), both in `<tfoot>`; bowling card = table with the econ cell barred (`bg-[var(--loss)]` at 0.18 when econ > 10, else the team colour), then "Fall of wickets" line under it. Player links as the current `CricketScorecards`.
- Test: `tests/cricket-scorecard-tabs.test.ts` (tab keys follow the blocks, labels carry the total, `?innings=2` picks the second, widths clamp, extras/total/fow rows present, hidden attribute on inactive panels).

- [ ] Failing tests → implement → pass → commit.

### Task 3: collapsed Playing XI and Match info

- `collapsed?: boolean` on `CricketPlayingXi` and `CricketMatchInfo`: when true, `<details className="card overflow-hidden">` → `<summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3"><h2 className="text-sm font-bold">Playing XI</h2><span className="text-xs font-bold text-[var(--sig-ink)]">Show</span></summary>` → the existing content (grid/dl) inside. The description line moves under the heading inside the panel.
- Test additions in `tests/cricket-seo-surfaces.test.ts`-style file `tests/cricket-collapsed-cards.test.ts`: `<details`, `<summary`, the `<h2>` text, the full content still present, no `open` attribute.

- [ ] Failing tests → implement → pass → commit.

### Task 4: wire both pages

- Replace `<CricketScorecards …/>` with `<CricketScorecardTabs tabs={scorecardTabs(scorecard, story, colours).map(t => ({ key, label, colour, panel: <CricketScorecardPanel tab={t} league playerSlugs /> }))} />` under the existing "Scorecard" `SectionHeader` (share tools unchanged).
- Wrap `<CricketPlayingXi collapsed …/>` and `<CricketMatchInfo collapsed …/>` in `<div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:items-start">`.
- Extend both wiring tests; full suite, typegen+tsc, eslint; local render of 1529229 and 1529230: tabs switch, `?innings=2` opens the second, details closed, phone width.

- [ ] Commit, push `feat/cricket-scorecard-tabs`, open the PR once PR #70 has merged (this branch builds on it); merge only on the owner's word.
