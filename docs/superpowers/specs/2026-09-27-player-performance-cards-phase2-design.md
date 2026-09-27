# Player performance cards, phase 2: design

Status: APPROVED scope (2026-09-27). Builds on phase 1 (shipped 2026-09-23, see
[player-performance-cards phase 1 design](2026-09-20-player-performance-cards-design.md)). The
implementation plan is not written yet. Not committed to a feature branch yet.

## Goal

Phase 1 gave every NBA/NFL game's top performers a server-rendered card image and a one-click
share button. It has no page of its own: the image is a file people attach, never a link, so
nothing about a performance is discoverable by search or shareable as a URL that unfurls.

Phase 2 closes that gap: a real, indexable page per performance
(`/[league]/games/[id]/players/[slug]`) whose `opengraph-image` is the phase-1 card, so pasting
the URL unfurls it. It adds "Season high" / "Triple-double" tags to the card and the page, extends
the existing "Share card" control to two more places it doesn't reach yet (Best games, Milestones),
and does none of this for soccer yet (see "Out of scope").

Reference: StatMuse's player pages (checked live, 2026-09-27, e.g. a "Latest Performance" tile) —
their per-game tile is a full labelled stat line (not just 2-3 headline numbers), which is what this
page's accessible stat table should match. StatMuse itself has no permalink page per player-per-game;
our indexable URL is new territory, not a copy of an existing pattern.

## What already exists (read from the code, 2026-09-27)

- **The card**: `PerformanceCard` (`src/components/PerformanceCard.tsx`) renders every stat tile at
  the same size — there is no single "oversized headline stat." `performanceLine(sport, row, profile)`
  (`src/lib/performanceLine.ts`) is the one place that decides which stats appear and their
  season-average deltas; the `card` route (`src/app/[league]/games/[id]/players/[slug]/card/route.ts`)
  is the only thing that calls it today.
- **Stat specs**: `src/lib/playerProfile.ts` defines every stat as a `StatSpec` with a `key`, an
  optional `headline` flag (which stats `performanceLine` surfaces for NFL — NBA instead uses a fixed
  key list in `performanceLine.ts` itself, not the `headline` flag), an optional `rate` property
  (percentage/per-attempt stats: FG%/3P%/FT%/YPC/punt-avg), and `agg` ("sum" for NFL's per-season
  totals, "avg" for NBA's per-season *averages* — this is a display convention for career/season
  lines, not a signal about whether a single game's value is a real counting stat).
- **Season completeness**: `SeasonLine.recorded` vs `SeasonLine.games` — "games - recorded is the
  games with no box score" — is defined generally on `SeasonLine`, not restricted to NBA, even though
  today's page copy only bothers surfacing the gap in NBA's UI text.
- **Leaders**: `MatchLeader.athlete_id` (`src/lib/matchDetail.ts`) is `String(l.athlete.id)`; players'
  `espn_id` is a string column throughout. `MatchLeaders` (the component) only gets data for
  `sport === "american"` games (NBA/NFL) — soccer games have no leaders concept today.
- **Reusable UI**: `PlayerBestGames.tsx` and `PlayerMilestones.tsx` already exist on the player page
  and already link to `/[league]/games/[id]`; neither has a share button yet.
- **Patterns to follow**: `pageMeta(title, description, path, { noindex, ownImage })` in
  `src/lib/metadata.ts` already supports both a noindex flag and an `ownImage` flag (skip the default
  site share image because the page has its own `opengraph-image.tsx`) — already used by
  `games/[id]/page.tsx` and `teams/[slug]/page.tsx`. `h2h/[pair]` and `scores/[date]` already noindex
  conditionally while still returning 200 with real content — the pattern this page follows.

## Design

### 1. No new stat-display logic

The new page's stat table is `performanceLine(sport, row, profile)` rendered as real HTML (a table or
definition list — label, value, delta), the exact same array the card image already uses. The page and
the card can never disagree, and no stat-formatting logic is duplicated.

### 2. Tags

`performanceTags(row, priorRows, sport): string[]`, a pure function (fixture-tested, no database).

**Eligibility rule** — a stat is tag-eligible when it is one of the stats `performanceLine` already
surfaces for this sport, AND it does not have a `rate` property (excludes FG%/3P%/FT%/YPC/punt-avg —
percentages read as achievements poorly), AND it is not one of two named exceptions: NFL's `pass_int`
(interceptions *thrown* — a turnover, not an achievement; distinct from `int`, interceptions *made*, a
defensive stat, which stays eligible) and NBA's `pm` (+/‑ — not a counting achievement, and can be
negative). Concretely:
- NBA-eligible: `pts`, `reb`, `ast`, `stl`, `blk`.
- NFL-eligible: every `headline` spec actually shown for this player's position, minus `pass_int`
  (e.g. a QB: `pass_yds`, `pass_td`; a WR: `rec`, `rec_yds`, `rec_td`; a defender: `def_tot`,
  `def_sacks`, `def_pd`, `int`).

**"Season high"** — for each eligible stat, compare this row's value against the max of every prior
row in `priorRows` for the same `season_year`. Shown only when that season's `SeasonLine.recorded ===
SeasonLine.games` (no games with a missing box score) — the same general field for both sports, not
sport-specific logic. A card can earn more than one "Season high" tag in the same game (e.g. a
receiver's best yardage *and* best-TD game at once) — this is truthful, not noise: forcing a single
tag would mean picking one arbitrarily. Tag text names the stat: `"Season high · REC YDS"`, not a bare
"Season high" (bare text stops being meaningful once more than one can appear at once).

**"Triple-double"** (NBA only) — reads `cell()` directly for PTS/REB/AST/STL/BLK on this row (not
through `performanceLine`, which formats for display). True when at least 3 of the 5 are non-null and
≥ 10. A `null` category (only possible on the known old blank-box-score seasons) counts toward
neither "reached 10" nor "definitely didn't" — it just can't help reach the threshold. Never runs on
a row without a real stat line (the route already guarantees this — no row, no card, no page).

### 3. Route and rendering

`src/app/[league]/games/[id]/players/[slug]/page.tsx` (new server component):

- Extract the existing `card/route.ts` body (load game/player/log/profile, compute `performanceLine`,
  build the `PerformanceCard` element) into one shared function both the route and this page's
  `opengraph-image.tsx` call, so there is still exactly one render path, not two — same discipline
  phase 1 established for the card itself.
- Body: the card's `og`-format PNG embedded via `<img src=".../card?format=og">` (reuses the existing
  render, no second HTML/Satori copy of `PerformanceCard`), the accessible stat table
  (`performanceLine` as text), the tags as text, and links to the game page and the player's full page.
- Reuses `ImageActions` with the same `imageUrl` prop as phase 1's existing share buttons, unchanged —
  landing here does not remove the existing share/download options.
- 404s exactly when the `card` route would 404 (unknown league/game/player, or a player with no line in
  that game) — same guarantee, read through the same shared loader.

### 4. Indexability

`generateMetadata` loads this game's `MatchLeader[]` (the same data `MatchLeaders` already renders)
and checks whether any leader's `athlete_id` equals this player's `espn_id` (both plain strings,
verified — no coercion risk). Every pair gets `ownImage: true` (its own card as the OG image applies
whether or not the page is indexed — a noindexed page can still be visited or shared directly, and
should still unfurl correctly when it is); only `noindex` itself toggles on the leader match:
`false` when matched, `true` (still 200, still fully rendered — same pattern as `h2h`/`scores/[date]`)
otherwise. The sitemap generator only lists indexed pairs.

### 5. Universal linking, selective indexing

The page resolves for *any* (game, player) pair with a stat line, not only leaders. Link to it from
everywhere a stat line already appears on the site — box-score rows, Best games, Milestones, the
game page's leader blocks — as a small "View full breakdown" link, regardless of whether that
particular pair is indexed. Only leader pairs are indexed; every other pair is a real, working,
noindexed page. One rule ("link everywhere, index only leaders") instead of two.

### 6. Share button on Best games and Milestones

Add `ImageActions` (same `imageUrl` pattern phase 1 already uses:
`/${league}/games/${row.game_espn_id}/players/${slug}/card?format=og`) to `PlayerBestGames.tsx` and
`PlayerMilestones.tsx` rows. No new route, no new rendering — every game referenced by these rows
already has a stat line for this player by construction (that's why it's in Best games or is a
milestone's pinned game).

### 7. Testing

- Pure, no database: `performanceTags` fixtures — season-high boundary (exactly at the prior max, one
  below, one above), multiple simultaneous tags, the incomplete-season suppression
  (`recorded !== games`), triple-double (exactly 3, exactly 2, a null category, an old blank-box-score
  row), the `pass_int`/`int` name-collision case explicitly.
- Route/page, throwaway Postgres: 200 with real content for a leader pair (indexed) and a non-leader
  pair with a stat line (noindexed, still 200), 404 passthrough matching the `card` route's existing
  404 cases, the shared PNG-loading helper returns identical bytes to the existing `card` route for
  the same pair (no silent drift between the two callers).
- Sitemap: only leader pairs appear.
- Live browser check (post-deploy): a real leader page (indexed, unfurls with the card) and a real
  non-leader page reached via a box-score row's new link (renders fully, noindex meta present).

## Out of scope (this plan)

- **Soccer.** No existing "leaders" concept to anchor an indexable page or a tag computation on
  (`MatchLeaders` only computes for `sport === "american"` games today). Needs its own top-performer
  selection design (goals+assists? clean sheets for keepers?) before it can reuse this page/tag
  machinery — a follow-up phase, not folded in here.
- **A "next opponent" teaser** (StatMuse shows career-vs-next-opponent stats on a player's page) — new
  data and logic not in the original phase-1/phase-2 spec; noted as a possible later idea, not
  scoped here.
- Milestone tags beyond "Season high"/"Triple-double" (e.g. "Career high on record", double-doubles)
  — not approved, not built here.
- A "Top performances" strip and a daily best-performances page remain phase 3, unchanged from the
  phase-1 doc.

## Decisions for the user

Decided in this brainstorm (2026-09-27): soccer split out into its own follow-up phase; the page shows
the card image plus a full accessible stat table (not a trimmed one) plus tags plus links back;
"Season high" checks every eligible stat (not just one), multiple tags can appear together; existing
phase-1 share buttons are unchanged (no navigation added to the share flow itself) — the new page is
an additional, linked destination, not a replacement step; Best games/Milestones share-button
extension stays folded into this plan (small, no new logic).
