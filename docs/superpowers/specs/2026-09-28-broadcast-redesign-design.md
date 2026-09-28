# Broadcast redesign: design

Status: APPROVED (2026-09-28). Mockup approved by the site owner at
https://claude.ai/artifact/GNvQwJkirB4mbbExDR7psi with these picks: signature colour **Volt**,
headline face **Barlow Condensed**, body face **Geist** (unchanged), default theme **dark masthead
over a light body**, scope **foundation + homepage + Beyond the Scoreline**. The implementation plan
is not written yet.

## Goal

The site launched on 2026-09-22 and works, but every page is grey-blue cards on a flat ground, one
typeface at one weight, and a generic Tailwind blue. Nothing says "sport" and nothing says
"SportsDB". The owner's brief: make it exciting and engaging, on the level of the big sports sites,
without changing what the pages do.

This pass gives the site a visual identity (colour, type, masthead, card language) that every page
inherits through the existing tokens and utility classes, and rebuilds the three pages where the
identity has to carry the most: the homepage, the Beyond the Scoreline index, and the article page.

## Benchmarks (checked live, 2026-09-28)

| Site | What they do that we borrow |
|---|---|
| BBC Sport | One signature colour on black, one big lead story, condensed display face, two-tier nav |
| ESPN | Dark masthead, scores strip across the top, "Top Headlines" rail |
| Sofascore | Score chips in the top strip with live pulses, sport pills, team-colour strips, dense rows |
| ESPNcricinfo | Horizontal strip of match cards, clear result colours |
| The Athletic | Dark editorial header, big lead card, generous space around long reads |

Constraint that shaped every choice: the site has no licensed photography, and the owner decided
earlier not to use player photos. Everything "visual" has to come from what we already own: team
colours, crests, big numbers, charts.

## Decisions

### Colour

Light body under a dark masthead is the default; the existing toggle still switches the whole page
to dark. All values live in `globals.css` as tokens; nothing new is hard-coded in components.

Light theme:

| Token | Value | Role |
|---|---|---|
| `--bg` | `#f3f4f8` | page ground (navy-biased, not grey) |
| `--surface` | `#ffffff` | cards, tables |
| `--surface-muted` | `#eceef4` | table heads, bars |
| `--border` | `#dde1ea` | |
| `--text` / `--text-muted` / `--text-faint` | `#0b1324` / `#5a6478` / `#8b95a8` | |
| `--mast` / `--mast-2` | `#0b1324` / `#121c33` | masthead, hero bands, article header, footer, and the scores strip |
| `--mast-text` / `--mast-muted` | `#eef1f7` / `#9aa5bd` | text on the dark bands |
| `--sig` | `#c6f135` | Volt: the one signature colour. Fills, stripes, the active-tab underline, the live cell in the logo |
| `--sig-ink` | `#4d7c0f` | Volt darkened for text and links on light surfaces (AA on white) |
| `--sig-soft` | `#eef9c9` | tinted chips and callouts |
| `--sig-on` | `#0b1324` | text on a Volt fill |
| `--live` | `#ff3b5c` | live state only; never used as an accent |
| `--win` / `--loss` / `--draw`, `--zone-*` | unchanged | semantic, separate from the signature |

Dark theme: `--bg #0a0f1c`, `--surface #111a2c`, `--surface-muted #182238`, `--border #24304a`,
text `#e9edf6 / #9aa6bf / #6b7890`, `--sig-ink` becomes `--sig` itself (Volt is legible on dark),
`--sig-soft #23301a`. The masthead tokens do not change between themes: the dark bands are dark in
both.

`--accent` stays defined and is remapped to `--sig-ink` (light) / `--sig` (dark), and
`--accent-soft` to `--sig-soft`, so the many components that use `var(--accent)` today pick up the
identity with no edits. `--header-*` tokens are remapped to the masthead values for the same reason.

### Type

- **Display**: Barlow Condensed 600/700/800 via `next/font/google`, exposed as `--font-display`.
  Used uppercase for `h1`, `h2`, `h3`, section titles, and for scores and big numbers (hero spotlight
  score, match-card scores, leader values, ranks, pull-stats, article stat graphics). Tables keep
  the body face: condensed digits in a dense table hurt scanning.
- **Body**: Geist, unchanged. Geist Mono stays for anything that already uses it.
- Scale: hero `clamp(44px, 6.4vw, 84px)`; page/section band `clamp(48px, 7vw, 92px)`; article
  `clamp(40px, 5.6vw, 72px)`; section `h2` 30px; league `h3` 24px; card `h3` 20 to 26px.
  Eyebrows are 11px, 700, `.14em` tracking, uppercase, in `--sig` on dark and `--sig-ink` on light.

### Layout language (the "foundation": applies to every page)

1. **Masthead** (`Nav.tsx`): background `--mast`, 60px tall, logo with the live cell in Volt, primary
   links in `--mast-muted` turning `--mast-text` on hover, the active section marked by a 3px Volt
   underline. Search box and icon buttons take translucent white fills. The X link becomes a small
   Volt "Follow on X" button on desktop and stays an icon on mobile. The dropdown and the mobile drawer
   keep their behaviour and take the dark palette.
2. **Scores strip** (`Ticker.tsx` becomes a strip of chips): replaces the text marquee. Each chip is
   league label + status on the top line and the two sides with scores on the bottom line, winner in
   bold, live chips with a pulsing dot in `--live`. The row scrolls horizontally (no marquee
   animation, no auto-scroll) and ends with an "All scores" link. `/api/ticker` grows structured
   fields for this (league label, both abbreviations or short names, both score displays, winner
   flag, live flag, status label) while keeping `label` and `href` so nothing else breaks.
3. **Bands**: a `.band` helper paints a full-bleed `--mast` block with `--mast-text`; used by the
   homepage hero, the Beyond the Scoreline index header, the article header and the footer. The
   hero band adds a faint radial wash of Volt at the top right.
4. **Cards**: `.card` keeps its role but gets the navy-biased border and a softer, deeper shadow.
   Card links lift 2px on hover. A new `.match` card variant carries a 6px vertical stripe at the left
   edge split between the two teams' colours (from `home_color` / `away_color`, falling back to
   `--border`), scores in the display face, loser dimmed.
5. **Section headers**: `SectionHeader` gets a 6px Volt bar before the title and the display face;
   the action link reads in `--sig-ink`.
6. **Pills**: unchanged in shape; `pill-live` becomes a solid `--live` fill with white text,
   `pill-upcoming` takes `--sig-soft` / `--sig-ink`.
7. **Sub-nav tabs** (`SubNav`, `.tab`): active underline becomes Volt; otherwise unchanged.
8. **Leaders**: rows get a display-face rank, a display-face value with a small unit label, and a
   Volt proportion bar under the name (value / leader's value).
9. **Footer**: painted on `--mast` with `--mast-muted` links, same columns.
10. **Header overflow fix**: at viewports between roughly 1024px and 1290px the desktop nav, the
    256px search box and the icon buttons do not fit, and the page scrolls sideways (measured on the
    live site: container 1290px wide at a 1024px viewport). The redesigned masthead must fit at
    1024px: the search box shrinks to 180px below 1280px, and the "Follow on X" button collapses to
    an icon below 1180px.

### Homepage

Order, top to bottom:

1. **Hero band**: eyebrow, the headline "Live scores. The full record behind them." with "full
   record" in Volt, the existing paragraph, then the sport pills. The first pill is "N live now" in a
   Volt fill when anything is in play (links to the Live now section); the rest are the current
   quick links. Right column: the spotlight card, painted with a diagonal gradient from the two
   teams' colours through `--mast`, crests at 44px, names at 20px, scores at 52px in the display
   face, and a footer line with the status and "Match centre".
2. **Live now**: unchanged data, cards in the new `.match` style in a responsive grid.
3. **My follows** and the **ad slot**: unchanged.
4. **League blocks** (two-thirds column): each block has a display-face title with a small
   `--sig-soft` badge for the next matchday/week, a three-up row of `.match` cards, and (for leagues
   with standings) a two-up of the mini table (top five, zone stripes, form strip) and the goals or
   points leaders with bars. Between-seasons block unchanged in content, restyled.
5. **Right column**: Beyond the Scoreline as a stack of story cards (see below) with a
   "Follow the desk" callout in `--sig-soft` linking to X; then Latest news.

### Beyond the Scoreline

**Story card** (`ArticleTeaserCard` grows into this; the index and the homepage share it): a card
whose top is an "art" panel and whose body has an eyebrow (the sport), the title in the display
face, the dek (index only), and a meta line (date, reading time). The art panel is a gradient in the
sport's palette with the article's **key number** in the display face at poster size and a one-line
caption. Each article declares `art: { number: string; caption: string; palette: "football" |
"cricket" | "f1" | "asian-games" | "nfl" | "nba" | "tennis" }` in its content file; palettes are
defined once in CSS. `art` is optional: the daily auto-draft routine writes articles without it, and
those must still publish. An article without `art` gets the palette of its first recognised tag
(else the neutral navy) and the sport name in the display face where the number would be. The four
existing articles get an `art` block each. The registry test validates `art` only when present. A
follow-up outside this spec teaches the auto-draft routine to write `art`.

**Index page**: a `--mast` band with eyebrow, the section title at band size, the existing
description, and topic filter pills built from the union of article tags (client-side filter, no
routing). Below: a lead row (the newest article as a large story card with a 16:9 art panel, beside a
"Most read this week" rail listing the other articles with display-face ranks and a "New every day"
callout), then a "Latest" grid of story cards, three per row on desktop. The share button stays on
each card.

**Article page**: the breadcrumb, eyebrow, title, dek and byline move into a `--mast` band that
spans the page; the byline gets a small Volt avatar disc with "BS". Below the band, a two-column body:
prose at 17px / 1.65 in a 64ch measure with a display-face drop cap on the first paragraph, and a
sticky right rail (hidden under 900px) holding "Related on SportsDB" and "More from the desk". A
`.pull-stat` component (display-face number, unit, caption, Volt left rule) is available to article
bodies; existing charts (`KabaddiGoldTimelineChart` etc.) get their gold/blue swapped for Volt/grey via
tokens so they sit in the new palette. The data-attribution line stays at the foot.

### What other pages get for free

League scores, standings, teams, players, leaders, tennis, F1, Asian Games, search, error and
not-found pages all keep their markup and pick up: the masthead, the scores strip, the token
colours, Barlow Condensed on `.page-title` and `SectionHeader`, the Volt tab underline, the new
card shadow and hover, the new pills, the footer. Standings tables are unchanged apart from tokens.
`GameCard` is restyled in place (stripe, display-face scores), which also carries into the league
scores pages and match centres.

### Share images

Out of scope. The OG images keep their current navy gradient; swapping their accent to Volt is a
one-line follow-up once the redesign has shipped.

## Out of scope

- Bespoke redesigns of league, team, player, match, tennis, F1 and Asian Games pages.
- Photos of any kind. Article art is generated from numbers and colours only.
- Any change to data, caching, revalidation intervals, or the ticker's fetch cadence.
- Share images, favicons and the app icon (the logo mark itself is unchanged).
- New sections, new routes, or a newsletter (the "Follow the desk" callout links to X only).

## Testing

- `npm test` keeps passing; the Beyond the Scoreline registry test gains a check that, where an
  article declares `art`, `art.number` is a non-empty string and `art.palette` is a known palette.
- A new `tests/ticker-chip.test.ts` covers the structured ticker fields: winner flag, live flag,
  status label, and that cricket results carry a margin string rather than a scoreline.
- Manual pass in the browser on the built site at 1024px, 1280px, 1440px and phone width, light
  and dark, for: homepage, `/beyond-the-scoreline`, one article, `/epl`, `/epl/standings`,
  `/nba`, `/tennis`, `/f1`, `/search?q=haaland`. No horizontal scroll at any width.
- Lighthouse accessibility on the homepage and an article: contrast passes for `--sig-ink` on
  white and `--mast-muted` on `--mast`.

## Rollout

Branch `design/broadcast-redesign`, one PR, no auto-merge. Deploy follows the production steps
already recorded for sports-db.live. The old ticker marquee is deleted, not kept behind a flag.
