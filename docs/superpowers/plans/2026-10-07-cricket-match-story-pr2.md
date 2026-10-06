# Cricket match story, PR 2: key moments, top performers, partnerships, next match

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Under the hero and the chart, both cricket match pages gain the story blocks the spec lists as sections 3, 4 and 7: a key-moments timeline, top-performer cards, partnership bars and a next-in-series card.

**Architecture:** Two pure modules derive everything (`cricketMatchMoments.ts` for the timeline from the ball-by-ball wickets plus ESPN's `matchnote` entries rewritten into SportsDB sentences; `cricketPerformers.ts` for the leaders per innings from the parsed scorecard). Four server components render them. `cricketMatchPage.tsx` and `[league]/games/[id]/page.tsx` compose them; nothing in metadata, JSON-LD, the h1 or the report paragraph changes.

**Tech Stack:** Next 16 app router, React 19 server components, Tailwind v4 (tokens only, no unlayered CSS, no `!`), node:test with `renderToStaticMarkup`.

**Spec:** docs/superpowers/specs/2026-10-07-cricket-match-story-design.md (sections 3, 4, 7; Data → Summary extras; Components table)

## Global Constraints

- Colours only through tokens (`--sig`, `--sig-soft`, `--sig-on`, `--surface`, `--surface-muted`, `--border`, `--border-strong`, `--text`, `--text-muted`, `--text-faint`, `--loss`); team colours as inline style only.
- No ESPN prose: every sentence is written from parsed fields; a `matchnote` that matches no known shape is dropped.
- Server components render the same HTML on every request (no `Date.now()`, no `window`).
- `tests/css-layers.test.ts`, `cricket-seo-surfaces`, `cricket-match-page-wiring`, `cricket-game-page-wiring` stay green.
- Commits end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

---

### Task 1: Milestones and key moments (`src/lib/cricketMatchMoments.ts`)

**Files:** Create `src/lib/cricketMatchMoments.ts`; modify `src/lib/cricketMatchExtras.ts` (export `wicketLine`); test `tests/cricket-match-moments.test.ts`; fixture `tests/fixtures/espn-cricket-notes-1529229.json` (the 3rd ODI's 73 notes).

**Produces:**
```ts
export type MomentKind = "wicket" | "team" | "batter" | "stand" | "powerplay" | "drinks" | "break";
export interface Milestone { innings: number; over: number; kind: Exclude<MomentKind, "wicket">; text: string }
export interface Moment { innings: number; over: number | null; kind: MomentKind; text: string; teamId: string | null }
export function parseMilestones(notes: unknown, names?: string[]): Milestone[]
export function keyMoments(story: StoryInnings[], milestones: Milestone[], scorecard?: CricketTeamScorecard[]): Moment[]
```
- `parseMilestones`: walks `matchnote` entries in order; "`<Team> innings`" starts innings 1, 2, …; shapes recognised (anything else dropped):
  - `Team: 50 runs in 13.5 overs (83 balls), Extras 1` → team, over 13.5, "India 50 up in 13.5 overs".
  - `RG Sharma: 50 off 58 balls (3 x 4, 2 x 6)` → batter, over unknown → placed at the preceding note's over; text "Rohit Sharma 50 off 58 balls (3 fours, 2 sixes)" with the short name resolved against `names` (surname + initials), else the short name.
  - `3rd Wicket: 50 runs in 67 balls (RG Sharma 29, RD Gaikwad 22, Ex 0)` → stand, "3rd-wicket stand 50 in 67 balls".
  - `Powerplay 1: Overs 0.1 - 10.0 (Mandatory - 28 runs, 2 wickets)` → powerplay, over = end, "Powerplay 1 (0.1 to 10.0): 28 runs, 2 wickets".
  - `Drinks: India - 55/2 in 13.5 overs (RG Sharma 31, RD Gaikwad 22)` → drinks, "Drinks: India 55/2 after 13.5 overs".
  - `Innings Break: India - 351/7 in 50.0 overs (KL Rahul 129, Gurnoor Brar 8)` → break, "Innings break: India 351/7 in 50 overs".
- `keyMoments`: wickets from `story` (`wicketLine(w)` + " · 44/2") with `over`, `teamId`; milestones mapped onto the innings' `teamId`; sorted by innings then over (a wicket before a milestone at the same over). Without a story (first-class), wickets come from the scorecard's batting rows whose dismissal is not "not out"/"retired", one per row in batting order, `over: null`, text "Name c X b Y 12", innings from the row.

- [ ] Write the failing tests (milestone shapes, unknown dropped, names resolved, merge order, scorecard fallback).
- [ ] Run `env -u NODE_ENV npx tsx --test tests/cricket-match-moments.test.ts` → fails (module missing).
- [ ] Implement; export `wicketLine` from extras.
- [ ] Tests pass; commit.

### Task 2: Top performers (`src/lib/cricketPerformers.ts`)

**Produces:**
```ts
export interface Performer { athleteId: string; name: string; teamId: string; innings: number; kind: "bat" | "bowl"; figure: string; detail: string }
export function topPerformers(scorecard: CricketTeamScorecard[], potm: string | null): { large: Performer | null; small: Performer[] }
```
- Per innings period: most runs (then fewer balls) → bat `figure` "34*", `detail` "25 balls · 1 four · 2 sixes · SR 136.0"; most wickets (≥1, then fewer runs) → bowl `figure` "3/24", `detail` "4 overs · econ 6.00" (+ " · 1 maiden" when >0).
- `large`: the Player of the Match's best line (bat when ≥40 or no 2+ bowling, like `potmLine`), else the match top scorer. `small`: the per-innings leaders in innings order, bat before bowl, skipping the large card's athlete, at most four.
- Fixture 1554707: large = Nishita Akter Nishi 2/16; small = Sadia Akter 34*, Mahnoor Zeb 3/24, Komal Khan 29.

- [ ] Failing test → implement → pass → commit.

### Task 3: Components

**Files:** Create `src/components/CricketKeyMoments.tsx`, `CricketTopPerformers.tsx`, `CricketPartnerships.tsx`, `CricketNextMatch.tsx`; test `tests/cricket-story-blocks-render.test.ts`.

- `CricketKeyMoments({ moments, colours })`: `SectionHeader` "Key moments"; one `<ol>` per innings (heading from the first moment's team via `teams` prop `Record<teamId, name>`); row = over label (`tabular-nums`, "5.2" or blank) + dot (`bg-[var(--loss)]` wicket; inline team colour, fallback `var(--sig)`, for team/batter/stand; `bg-[var(--border-strong)]` for powerplay/drinks/break) + text. Null when no moments.
- `CricketTopPerformers({ large, small, league, playerSlugs })`: "Top performers"; large card `bg-[var(--sig)] text-[var(--sig-on)]` with the `.display` figure at 56px, name, detail, team; small cards `.card` in a 2-col grid. `Link` to `/${league}/players/${slug}` when the slug is found (league given), else `div`. Null when nothing.
- `CricketPartnerships({ innings, colours })`: "Partnerships"; one column per innings with the team name; rows "1st · Hope & Pooran" / bar (width `runs / maxStand * 100%`, min 2%, inline colour fallback `var(--sig)`) / runs (`38 (29b)`), "unbroken" appended. Null when no innings have partnerships.
- `CricketNextMatch({ next, series, seriesNote })`: "Next in this series"; grid of two cards: the fixture (both sides with `TeamLogo`, stage, `LocalTime datetime`, link via `matchHref`) and the series card (name, `seriesNote` or "Fixtures, results and the table", link). Null when `next` is null.

- [ ] Failing render tests → implement → pass → commit.

### Task 4: Wire both pages

- `cricketMatchPage.tsx`: `scorecard = details?.scorecard ?? []`; `names` = every batting/bowling row name; `milestones = parseMilestones(summary?.notes, names)`; `moments = keyMoments(story, milestones, scorecard)`; `performers = topPerformers(scorecard, potm)`; `nextMatch` = when `stored`, `getCricketSeriesMatches(stored.series_espn_id)` → first with `date > stored.date` and `status_state === "pre"`. Layout after the story: `<div className="grid gap-6 lg:grid-cols-2">` Key moments | Top performers; then Partnerships; (scorecard, XI, info unchanged); then Next in this series before the footer line. `league="odi"` for performer links with an empty map (as the scorecard does).
- `[league]/games/[id]/page.tsx`: same, with `playerSlugs`, `league`, colours from `storyColours`; next match via `getCricketSeriesMatch(id)` then the series list (only for cricket).
- Extend `tests/cricket-match-page-wiring.test.ts` and `tests/cricket-game-page-wiring.test.ts`.

- [ ] Failing wiring tests → wire → full suite, `npx next typegen && npx tsc --noEmit`, `npx eslint src tests` → local render of 1529229 (league page) and 1529230 (match page) in both themes and phone width → commit.

### Task 5: PR

- [ ] Push `feat/cricket-story-blocks`, open the PR (title "Cricket match pages: key moments, top performers, partnerships, next match"), wait for the check, report; merge only on the owner's word.
