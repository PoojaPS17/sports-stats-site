# Player performance cards: design

Status: APPROVED scope (2026-09-20). Phase 1 only; build starts after the stage-aware merge. The implementation plan is not written yet. Not committed, not on any feature branch yet. When approved it moves to its own branch off `main`, after the stage-aware branch (`feat/stage-aware-player-stats`) has merged, because the cards read the corrected player numbers.

## Goal

After every NBA and NFL game, each team's top performer gets a shareable card: one player, one game, the line that matters, in a form people post. In phase 1 (the only phase approved) the card is a server-rendered PNG at its own URL, and a share control on the game page saves it, copies it, or opens the phone's share sheet with it. Later phases, not approved and not planned into the first build: a page per performance whose link preview is the card, milestone tags (season high, triple-double), soccer, and a "Top performances" strip.

The reference is StatMuse's "Trending Performance" tile and its answer cards. We copy the idea (a compact one-player scoreboard people screenshot), not their look or their illustrated art.

## What already exists (read from the code, 2026-09-20)

- **Client-side image export.** `src/components/ImageActions.tsx` gives "Share image" and "Download image" on about 30 pages. It renders an off-screen light-theme card (`ExportShell`, `CARD` in `src/lib/exportTheme.ts`, 720 px wide) with `html-to-image`, then hands the PNG to the native share sheet, the clipboard, or a download. Its own comment says a blocked cross-origin asset can fail the export.
- **Player-shaped cards.** `PlayerExportCard` (career strip, with an ESPN headshot), `PlayerBoxScoreExportCard` (whole box score for both teams), `PlayerBestGames`, `PlayerMilestones` (career landmarks pinned to a game, "on record" because our log starts about a decade back).
- **Server-rendered images.** `src/app/[league]/games/[id]/opengraph-image.tsx` and the team one use `ImageResponse` (Next 16, `next/og`) with ESPN team logos and the default font. Player pages have no share image of their own.
- **Data.** `player_game_stats` (jsonb box score per player per game), `PlayerLogRow`, the `StatSpec` and `cell()` readers in `src/lib/playerProfile.ts`, `buildStagedProfile(...).regular` for season averages, `MatchLeaders` (ESPN's per-game leaders) on the game page.

So the gap is not "a way to export an image". It is: a card about one performance, a real URL for it that unfurls with the card, and somewhere on the site that surfaces the best performances after a game.

## Design

### 1. One card component, two renderers

`PerformanceCard` is written with flexbox and inline styles only (no `<table>`, no grid). That subset renders in Satori (`ImageResponse`, server) and in the browser. Phase 1 renders it on the server only, and the share control downloads that PNG, so there is one renderer and nothing to drift; keeping to the flexbox subset also leaves the door open to reuse the component in the page later.

Content, top to bottom:
- Eyebrow: league, date, stage label from the stored `stage` ("Regular season", "Playoffs · Round of 16", "Play-in"). Excluded games (preseason, All-Star, Cup final) get a card only on request, labelled as what they are.
- Player name, team, position and jersey number, opponent, result and score (`W 106-81`). No photographs of any kind: no headshots and no team logos. The visual anchor is a very large jersey number behind the text, the team is a disc in the team's stored colour with its abbreviation, and the biggest stat is oversized in the team colour. Percentages (FG, 3P, FT, completions) draw as filled bars.
- Headline stats, by sport. NBA: PTS, REB, AST, STL, BLK, with FG, 3P, FT made-attempted and +/-. NFL: by position group (passing, rushing, receiving, defence), read with the same specs the player page uses.
- Comparison chips: the same stat against the player's regular-season average ("+8 vs season avg"), from `buildStagedProfile(...).regular`.
- Tags (phase 2): "Season high", "Triple-double".
- Footer: the site's own `ExportFooter`, unchanged in content: the mark, `SportsDB`, the domain, the X handle, and "what the card is · generated date and time" (for example "Team A vs Team B · Player card · Sep 20, 2026, 12:41"). Same footer as every other card on the site, with no change to the component: the cards use the light `CARD` palette it already hard-codes.

Look: light only, like every other card (`CARD` in `src/lib/exportTheme.ts`: white surface, `#f4f6fa` stat tiles, `#0f172a` text, accent from the team colour). The reference mockup shown in review was drawn dark and must be re-drawn on the light palette before build: the jersey number becomes a pale tint of the team colour behind the text, the stat tiles sit on `CARD.bg`, the bars use the team colour on a `CARD.border` track, and chips use `CARD.win` and `CARD.accentSoft`. Contrast must be checked for team colours that are very light (yellow, white): the card falls back to `CARD.accent` when a team colour fails a 3:1 contrast check against the surface.

Ruling: the card names no data source and carries no "verified" badge. The player-totals audit samples and compares totals; it does not check every line on every card, so a badge would claim more than we have checked, and a source line is not needed since no other card on the site carries one.

### 2. Data accuracy rule

Every number on a card is read from the stored `player_game_stats` row through the same `StatSpec` and `cell()` readers the box score and player page use, and averages come from `buildStagedProfile(...).regular`. The card has no stat logic of its own, so it cannot disagree with the page, and it inherits the negative-number fix, the regular-season-only averages and the Totals-row fix. No card is produced for a player with no stat line in that game (linemen, special-teams-only): the route returns 404.

### 3. Routes

- `GET /[league]/games/[id]/players/[slug]/card?format=og|portrait|story` returns `image/png`. `og` is 1200x630 (link previews), `portrait` 1080x1350 (Instagram, X), `story` 1080x1920. Formats outside the whitelist return 400. Unknown league, game, player or a player with no line in that game returns 404, so the route can only render pairs that exist in the database.
- Phase 1 has no new HTML page. The game page's top-performer blocks and each box-score row for NBA/NFL get a share control that fetches the `card` image as a blob and uses the same share-sheet, clipboard, download logic as `ImageActions` (new `imageUrl` prop). This also removes the cross-origin canvas failure mode for these cards, because the browser downloads a PNG the server already rendered.
- Phase 2 adds a real page, `/[league]/games/[id]/players/[slug]`, whose `opengraph-image` is the `og` card, so pasting the URL unfurls the card. Only auto-picked top performers get an indexable page; every other player's card stays reachable with `noindex`, to avoid thin near-duplicate pages.

The Next 16 route conventions are in `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` and `.../04-functions/image-response.md`; the implementation plan must read them first (AGENTS.md). Note the proxy matcher (`src/proxy.ts`) excludes only `opengraph-image`; a `card` route goes through the launch gate like any page, which is correct while the domain is gated.

### 4. Choosing top performers

Phase 1 uses ESPN's own game leaders that the game page already shows (`MatchLeaders`), so the card matches what the page says. No invented score formula. If ESPN's leaders are missing for a game, that game gets no auto-picked card; any player row can still be shared by hand.

### 5. Tags and the data window

Tags are a pure function `performanceTags(row, priorRows, sport)`, tested with fixtures. Window rule: our log begins where box scores were backfilled (about 2015), so a tag is shown only when the comparison window is complete for what it claims. "Season high" is shown only for seasons whose box scores are fully stored. "Career high" is worded "career high on record" (as `PlayerMilestones` already does) or suppressed. A card never claims something the stored history cannot support.

### 6. Rendering, caching, cost

- Fonts: bundle one subsetted TTF (Latin plus Latin-extended, under about 150 KB, inside the 500 KB `ImageResponse` limit). Acceptance test: names with diacritics (Dončić, Jokić, Vučević, Şengün, Antetokounmpo) render correctly. The current OG images use the default font and have never been checked against these.
- The card loads no external image at all, so it needs no image fetch, no timeout and no fallback path. That removes the failure mode where a slow or blocked image URL delays or breaks a render, and the cross-origin canvas failure `ImageActions` warns about. The team colour comes from the stored team row; a team with no stored colour gets a neutral accent.
- Headers: `Cache-Control: public, s-maxage=86400, stale-while-revalidate=604800` for games final for more than 2 hours; `s-maxage=300` for newer games, because ESPN corrects stat lines shortly after a game. Share links built by the site carry `?v=<player_game_stats.updated_at as epoch>`, so a correction gives a new URL and chat apps that cache an unfurl for days pick up the fix.
- Load and Oracle limits: a card is a 60 to 150 KB PNG, cached by Cloudflare in front of the Oracle VM, so origin renders are a small fraction of requests. Egress stays far below the 10 TB/month allowance. nginx gets a `limit_req` on the `card` path; the 404 rule already stops enumeration of pairs that do not exist. No new paid resource, no new service.

### 7. Sharing UX

A single control, "Share card", on: the top-performer blocks on the game page, each NBA/NFL box-score row, and (phase 2) the rows of a player's Best games and Milestones. Mobile opens the native share sheet with the image; desktop copies the image or downloads it. The existing per-section image exports are unchanged.

### 8. Analytics

One GA event per share, download and copy (`share_card`, with league and format). The one number to watch is shares per 1,000 game-page views, then referral visits from social.

## Phases

1. **Phase 1:** `PerformanceCard`, `performanceLine` (pure), the `card` route with the three formats, the font, caching, the share control on the game page. NBA and NFL.
2. **Phase 2:** the performance page with the card as its link preview, tags (season high, triple-double), milestone cards, share from Best games and Milestones, soccer (goals and assists).
3. **Phase 3:** a "Top performances" strip on the league pages and the home page after games finish; a daily best-performances page.

Later, if wanted: cricket and tennis cards.

## Out of scope

Automatic posting to any social account (an outward-facing publish, a separate decision), video or GIF, user accounts, licensed player illustrations.

## Testing

- Pure, no database: `performanceLine` for NBA (including a negative +/-) and NFL by position group, delta chips, `performanceTags` boundaries, format whitelist.
- Route, throwaway Postgres: 200 with the PNG signature for a real pair, 404 for an unknown game, player or a lineman with no line, 400 for a bad format, a diacritic name, image-fetch failure falls back.
- A card for a playoff game says so, and its season-average chip uses the regular-season average.
- Visual check in the browser preview on Luka Dončić, Giannis, a quarterback and a running back at all three sizes, and a check that the footer matches the other cards.
- No network call leaves the server during a render (no image URLs in the element tree).

## Decisions for the user

Decided by the user (2026-09-20), all settled: no photographs at all (no headshots, no logos); the site's standard `ExportFooter` with no ESPN mention; light cards only; **Phase 1 only** (image route, share control, NBA and NFL; nothing from phases 2 and 3 is built or planned into the first cut); **build after the stage-aware branch is merged** and the production backfills are done.
