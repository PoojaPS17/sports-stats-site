# Cricket match page: from scorecard dump to match story

**Date:** 2026-10-07
**Status:** design approved in mockup (round one layout, site palette); spec for review
**Mockups:** https://claude.ai/artifact/UdWRtHPdH5yopYY58LDFZY (top-row palettes rejected; the
"Round one · original colours" board is the approved layout, to be built on the site's own light
and dark tokens rather than the mockup's hard-coded colours)

## Goal

`/cricket/matches/<id>` (and its day-cached twin `/cricket/matches/final/<id>`) today is a grey
result card, two scorecard tables, the Playing XI and a facts list. ESPN's feed carries far more
for the same match: every ball with the running score, fall of wickets, partnerships, milestones,
run rates, innings leaders and the teams' colours. The page should read as the story of the match,
with one interactive chart people actually click, while keeping everything the SEO work of the past
week relies on (title, description, h1, report paragraph, JSON-LD, share card, edge caching).

## Non-goals

- League game pages (`/ipl/games/<id>` and the other archived leagues) keep their own layout. A
  later pass can lift the story components there.
- No wagon wheel or pitch map: the feed has no shot direction.
- No ESPN prose. The over inspector and the timeline show symbols and sentences SportsDB writes
  from the fields (names, runs, balls, dismissal type), never ESPN's commentary text.
- No new scraper job or table. Ball-by-ball is read at render time through Next's data cache (see
  Data). If that proves too slow for ODIs it can move to the 15-minute tick later.

## Page layout (top to bottom)

Everything below sits in the existing `flex flex-col gap-6` page shell with the existing
breadcrumbs, `LiveRefresh`, JSON-LD, metadata and footer line unchanged.

1. **Hero.** A `band-deep` card (the deep navy strip/footer palette in light mode, the dark
   theme's own band in dark mode), rounded like `.card`. Status pill + the existing h1 line
   (name · stage · series) and the local time stay in the top row. Each side is a row: ESPN's
   team colour as a 6px bar at the row's edge, `TeamLogo`, name, score in `.display` at 56px
   (44px under `sm`), the overs/target line under the name in `--mast-muted`. The loser's row is
   muted as today. Below a hairline (`--mast-line`): the result sentence in `--sig` (which
   `band-deep` maps to the band link colour) at 20px bold, and a Player of the Match chip
   (initials disc + name + "102* (43)" from the leaders when the batter is found, else the name
   alone). A last row of outlined pills from the summary `notes`: toss, series note, match number,
   night match. The existing report paragraph moves under the hero as plain text (it is the text
   search indexes; it keeps its exact wording). While live, the pill is the existing `pill-live`
   and the chip row shows run rate and required rate from the last ball.
2. **Match story** (limited-overs matches with ball-by-ball only). `SectionHeader` "Match story"
   with a segmented control: Run worm | Runs per over. One SVG, full width, `viewBox 0 0 1000 340`,
   axes in `--text-faint`, grid in `--border`, each side's line/bars in its team colour, wickets as
   `--surface`-filled circles stroked in the team colour; the final totals labelled at the line
   ends. Under it the **over inspector**: one column per innings (stacking on phones), "Over N ·
   Team · 24 runs, 1 wicket", the balls as 34px discs (W in `--loss`, 6 in `--text` with `--sig`
   text, 4 in `--sig`, dot in `--surface-muted`, singles in `--sig-soft`), then a one-line note
   SportsDB writes: a wicket's "Hope c Patel b Naman Dhir 52", a milestone from the notes, or the
   score after the over. Clicking an over (invisible hit zones over the chart) selects it; the
   default is the highest-scoring over of the match (latest on a tie).
3. **Key moments** and **Top performers**, side by side on `lg`, stacked below. Key moments is a
   vertical timeline in match order: every wicket (from the ball-by-ball, or from the scorecard's
   dismissal lines when there is no ball-by-ball), and the milestones ESPN lists as `matchnote`
   (team 50/100/150, batter 50/100, powerplay, innings break) rewritten into SportsDB's own
   sentences from the parsed fields. Wicket dots in `--loss`, milestones in the batting side's
   colour, phases in `--border-strong`. Top performers: the innings leaders from the summary
   (`leaders[].linescores[].leaders`): one large card in `--sig` for the Player of the Match (or
   the top run-scorer when ESPN names none) with the runs at 56px, then a 2-column grid of up to
   four small cards (most runs and most wickets per innings, skipping the one already large). Each
   card links to the player page when the roster lookup finds a slug, otherwise it is a `div`.
   Headshots are out of this spec (initials disc only) until remote images from ESPN are allowed
   in `next.config`.
4. **Partnerships** (when ball-by-ball exists): two columns, one per innings; each stand is a row
   "1st · Hope & Pooran · bar · 38", bars scaled to the match's largest stand, the batting side's
   colour, "unbroken" appended when the innings ended with the pair in.
5. **Scorecard** as innings tabs. Same `ImageActions` share/download tools. Tabs are pills with
   the team's colour dot and "West Indies · 171 all out (19.1 ov)"; every panel is in the HTML
   (the `CricketSplitTabs` pattern, with `?innings=<period>` picking the opening tab) so crawlers
   and the share card see all innings. A panel is batting (3fr) and bowling (2fr) side by side
   from `lg`, stacked below, each table in its own card. Batting rows gain a bar behind the strike
   rate (width = SR / 250, clamped) in the side's soft colour; bowling rows a bar behind economy
   (width = econ / 20, clamped) in `--loss` soft when economy is above 10. Under batting: Extras
   (byes, leg byes, wides, no-balls from the innings record when known, else the total from the
   scorecard difference) and Total ("171 all out · 19.1 overs · run rate 8.92"). Under bowling:
   the fall of wickets line "1-38 Pooran (4.3), 2-44 Hetmyer (5.2), …". First-class matches get
   four tabs (the `scorecardBlocks` order), super overs their own.
6. **Playing XI** and **Match info** become two `<details>` cards side by side, closed by default,
   with "Show" on the summary row; their content is unchanged and still in the HTML.
7. **Next in this series**: two cards, the next fixture in the same series after this match's date
   (from `getCricketSeriesMatches`, first with date later than this one and state `pre`), with its
   stage, local time and the series state note, and the series page link. Omitted when there is no
   later fixture.

Phone width: the hero's two rows stack naturally; the chart keeps its aspect; the inspector and
the tabs' two tables stack; the tab strip scrolls horizontally; `details` cards go single column.

## Data

### Ball-by-ball (`src/lib/cricketBalls.ts`, pure parsing + one fetcher)

ESPN serves `site/v2/sports/cricket/<league>/playbyplay?event=<id>&page=<n>` (25 balls a page,
`commentary.count` and `pageCount`; the IPL path `8048` resolves any event, like the summary).
Each item carries `period`, `over.number`, `over.actual`, `scoreValue`, `playType.description`
(run, no run, four, six, bye, leg bye, out), `homeScore`/`awayScore` after the ball,
`batsman`/`otherBatsman` with the striker's running `totalRuns`/`faced`, `bowler`, `dismissal`
(`dismissal`, `type`, `bowler`, `batsman`) and `innings` (`runs`, `wickets`, `runRate`,
`requiredRunRate`, `target`, `byes`, `legByes`, `wides`, `noBalls`, `ballLimit`).

- `fetchCricketBallByBall(eventId, seriesId, { settled })` reads page 1 with the live window
  (10 s) or the finished window (a day) by `settled`; pages 2 to `pageCount - 1` always with the
  finished window (a filled page never changes, the feed is append-only); the last page with the
  same window as page 1. It stops at 40 pages (an ODI is about 24) and returns `null` on any
  failure or an error body, so the page renders without the story rather than waiting. It is only
  called when the summary's competition says `limitedOvers`.
- `deriveMatchStory(items, sides)` returns, per innings in order: the batting side, overs
  (`number`, `runs`, `wickets`, `balls: [{ symbol, runs, wicket, extra }]`), the worm (running
  `runs`/`wickets` at each over end, plus the final partial over), wickets (`over`, `runs`, `wicket
  number`, `batter`, `how`, `bowler`, `fielder` when the summary's dismissal line has one),
  partnerships (runs between falls, the two batters from the dismissal ball's `batsman`/
  `otherBatsman`, `unbroken` for the last pair) and the closing `runRate`/`requiredRunRate`.
  Symbols: `W` on a dismissal, `4`/`6` on those play types, `0` on no run, the run count
  otherwise, with `extra` set to `wd`/`nb`/`b`/`lb` when `over.wide`/`over.noBall` stepped or the
  play type is a bye. A no-ball four is `4` with `extra nb`.
- `matchStoryModel(story)` is the chart's pure geometry (points, bars, hit zones, default over)
  so the client component only maps it to SVG.

### Summary extras (`src/lib/cricketMatchExtras.ts`, pure)

From the summary SportsDB already fetches: `teamColours` (competitor `team.color`, falling back to
`--sig` for one side and `--text-muted` for the other when ESPN has none or both are alike),
`matchNotes` (toss, seriesnote, matchnumber, matchdays parsed into the hero pills), `milestones`
(`matchnote` entries parsed into `{ innings, kind: team50|team100|…|batter50|batter100|powerplay|
drinks|break, text }` for the timeline; unknown shapes are dropped, never shown raw),
`inningsLeaders` (runs and wickets per period with athlete id, name and value), `extrasByInnings`
(from the last ball of each innings when ball-by-ball exists, else the scorecard difference).

### Nothing new in the database

The next-fixture card reads the existing series matches. No migration.

## Components

| Component | Kind | Props |
|---|---|---|
| `CricketMatchHero` | server | sides, status, result, potm, pills, colours, live rates |
| `CricketMatchStory` | client | story model, side names + colours, `defaultOver` |
| `CricketKeyMoments` | server | moments (wickets + milestones, ordered) |
| `CricketTopPerformers` | server | leaders, potm, playerSlugs |
| `CricketPartnerships` | server | partnerships per innings, colours |
| `CricketScorecardTabs` | client shell, server panels | tabs `{ key, label, dot colour, panel }` |
| `CricketScorecardPanel` | server | one block of `scorecardBlocks` + extras/total/fow |
| `CricketNextMatch` | server | next fixture, series link |

`CricketMatchStory` and `CricketScorecardTabs` are the only client components; both render the
same HTML on server and client (no `window` reads during render; the tabs read `?innings=` through
`useSyncExternalStore` as `CricketSplitTabs` does). `cricketMatchPage.tsx` composes them and keeps
its metadata, JSON-LD, redirect and final-route behaviour.

## Colours

Only tokens: `--band-deep*` (hero), `--sig`/`--sig-soft`/`--sig-on` (accent), `--surface`,
`--surface-muted`, `--border`, `--border-strong`, `--text`, `--text-muted`, `--text-faint`,
`--loss` (wickets). Team colours are the one exception: ESPN's `team.color` as inline style on
the hero bars, the chart lines, the tab dots and the partnership bars. The pale-blue borders the
owner found dull are already `--border` in the current light theme, so this redesign does not
change the theme; it changes how much of the page is hero, chart and colour versus bordered table.

## Caching and performance

- Finished match: the final route stays cached a day; every ball page is fetched with the day
  window, so a cold render does up to 24 fetches once and the warm render none.
- Live match: page 1 and the last page every 10 s, the middle pages from cache; `LiveRefresh`
  unchanged. The render's own window stays the shortest fetch, 10 s, as today.
- Upcoming match: `pageCount` is 0, the story, partnerships and inspector are omitted; the hero,
  Playing XI, info and next-fixture cards render.
- First-class match: no ball fetch; the story section is omitted; the timeline uses dismissal
  lines and notes.

## Testing (TDD, node:test, no network)

- `tests/cricket-balls.test.ts`: `deriveMatchStory` on a trimmed fixture of this match's 205 balls
  (`tests/fixtures/cricket-pbp-1529230.json`, only the fields above): 20 and 15 overs, the per-over
  runs `[5,16,7,…]` and wickets, the ten and two wickets with batter/how/bowler, partnerships
  `[38,6,0,63,7,7,3,11,36,0]` and `[29,6,137 unbroken]`, symbols for a wicket ball, a six, a dot,
  a no-ball; an empty list gives no innings.
- `tests/cricket-balls-fetch.test.ts`: the pager with an injected fetch: windows per page (10 s
  live edges, a day middle, a day everywhere when settled), stops at the page cap, `null` on an
  error body or a failed page, zero pages for an upcoming match.
- `tests/cricket-match-extras.test.ts`: notes parsing (toss, series note, number; a milestone of
  each kind; an unknown note dropped), team colours fallback, leaders per period, extras.
- `tests/cricket-match-story-model.test.ts`: worm points start at the origin and end at the final
  totals, bar heights clamp, wicket markers sit on the line, default over is the 24-run 14th.
- `tests/cricket-scorecard-tabs.test.ts`: tab keys follow `scorecardBlocks`, labels carry the
  total, extras/total/fow strings, SR and economy bar widths clamp to 100.
- `tests/cricket-match-page-render.test.ts`: `renderToStaticMarkup` of the composed sections for a
  finished match, a live match, an upcoming match and a first-class match (no story), asserting the
  section headings present/absent and that the h1, report paragraph and share tools are unchanged.
- The existing suites (`cricket-match-cache`, `cricket-match-final-route`, `cricket-seo-surfaces`,
  `css-layers`, `static-params`) must stay green: no new unlayered CSS, no `!` modifiers.

## Delivery

Three pull requests, each deployable on its own:

1. **Hero + match story**: `cricketBalls.ts`, `cricketMatchExtras.ts`, `CricketMatchHero`,
   `CricketMatchStory`, fixture and tests. The scorecard below is untouched.
2. **Story blocks**: `CricketKeyMoments`, `CricketTopPerformers`, `CricketPartnerships`,
   `CricketNextMatch`.
3. **Scorecard tabs** and the collapsed Playing XI / Match info.

Each PR: `env -u NODE_ENV npx tsx --test tests/*.test.ts`, `npx next typegen && npx tsc --noEmit`,
`npx eslint src tests`, then a local render against the seeded Postgres and a live ESPN summary
in both themes and at phone width before the PR is opened.
