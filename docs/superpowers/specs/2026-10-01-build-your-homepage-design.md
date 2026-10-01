# Build your homepage: design

Status: APPROVED (2026-10-01). Mockups approved by the site owner at
https://claude.ai/artifact/N7FEHj4UBrwov4hxM1heuA (boards 1 to 4: first visit and built state, desktop
and phone; board 6 option 3: the "lit block" mark). The owner confirmed the Volt-on-navy palette after
seeing five alternatives, chose every caption listed under "Copy" below, chose the long transfer link
over a short code, and chose the collapsed bar for visitors who decline the builder. The
implementation plan is not written yet.

## Goal

The homepage is the same for everyone and shows a little of everything, so a cricket fan in Pune and
an NFL fan in Ohio both scroll past most of it. The site already has a follow system
(`src/lib/follow.ts`, `FollowButton`, `MyFollows`) but it is below the fold, starts empty, and nobody
finds it.

This pass turns the homepage into something no other sports site offers: the visitor builds their own
homepage out of blocks (a live strip, a team's next fixtures, a table, a player's form, the F1
standings, the editorial feed), in the order they want, and the page comes back that way on every
visit. The first visit makes that offer the hero, pre-filled for the visitor's country, so the
difference is obvious within a second of landing. No account is involved; the setup lives in the
browser and can be carried to another device with a link.

Alongside it, the brand mark changes to the "lit block" and the tab icon, home-screen icon and share
images, which still use the pre-redesign blue tile and rose dot, move onto navy and Volt.

## Constraints that shaped the design

- The homepage is ISR with `revalidate = 10` and Cloudflare follows the origin `s-maxage`, so one HTML
  document serves every visitor. Personalisation is assembled in the browser on top of that cached
  shell. The server never reads a cookie to render the homepage.
- No photos anywhere (owner decision). Blocks are type, numbers, team colours and bars.
- New components use the tokens (`--sig`, `--mast`, `--font-display`, the `.display` and `.eyebrow`
  classes) from `src/app/globals.css`; nothing hard-coded.
- The VM is small. Every block fetch must be a URL that the edge can cache and share between visitors
  with the same parameters.

## Copy (verbatim, owner's choice)

| Slot | Text |
|---|---|
| First-visit eyebrow | Your homepage, your rules |
| First-visit headline | Build the sports page **you keep looking for.** (bold part in Volt) |
| First-visit sub copy | Choose what sits here: live scores, tables, a player's form, your team's next three. It stays this way every time you come back. |
| Builder card title | We started one for you |
| Builder card note | `<Edition>` picks, because that is where you are browsing from. Keep them, trim them, or start blank. |
| Edition toggles | Start with `<Edition>` picks / Start blank |
| Add palette heading | Add more blocks |
| Search placeholder | Type a team, player or competition |
| Primary button | Make this my homepage |
| Secondary button | I'll decide later |
| Privacy note | No sign-up. Saved in this browser only. |
| Section below the hero | Everything else is still here |
| Collapsed bar (after "I'll decide later") | Build the sports page you keep looking for. **Start now** |
| Built eyebrow | Your homepage · `<weekday day month>` · `<N>` blocks |
| Built headline | Two generated facts, see "The built hero line" |
| Built buttons | Jump to live (`<N>`) / Edit blocks / Send to my phone |
| Add card | + Add another block |
| Block names | Live in your blocks · `<Team>`: next three · `<Competition>` standings · `<Player>`: last five · F1: driver standings · Beyond the Scoreline |

Block names use plain words and a colon, never a middle dot.

## Decisions

### Architecture: cached shell, client assembly

`src/app/page.tsx` keeps rendering everything it renders today, cached as today. Two things change in
the server markup:

1. The hero band becomes the builder (`HomeBuilder`, a client component rendered inside the server
   hero with its initial props: the available block catalogue and the edition table). It renders the
   "first visit" state on the server, so crawlers and first-time visitors see the offer immediately.
2. A `HomeBlocks` client component is placed between the hero and the existing "Live now" section.
   On the server it renders nothing.

On the client, `HomeBlocks` reads the saved setup. If one exists it renders the built hero and the
block grid, and `HomeBuilder` renders nothing. The sections below (`HomeLive`, league blocks, Beyond
the Scoreline, news) stay in the document under the heading "Everything else is still here", so a
built page is "your blocks, then the site". `MyFollows` is removed; its job moves into the blocks.

**No flash for returning visitors.** A second `beforeInteractive` script next to the existing
`theme-init` in `src/app/layout.tsx` reads the setup key and sets `document.documentElement.dataset.home`
to `built`, `collapsed` or nothing. CSS in `globals.css` hides the builder hero when the attribute is
`built` and shows a fixed-height skeleton in its place until `HomeBlocks` hydrates; when it is
`collapsed`, the hero is replaced by the one-line bar. The attribute is set before first paint, so the
server HTML and the painted page never disagree visibly. The hero wrapper carries
`suppressHydrationWarning` for the same reason `<html>` does today.

### Where the visitor is: the edition

`src/app/api/region/route.ts` returns `{ consentRequired, country }` instead of `{ consentRequired }`,
where `country` is the two-letter code from `visitorCountry()` or `null`. Headers unchanged
(`private, no-store`, `force-dynamic`). `GoogleAnalytics.tsx` keeps reading `consentRequired` only.

`HomeBuilder` calls it once on first visit, stores the country with the setup, and picks the edition
from `src/lib/editions.ts`:

| Countries | Edition name | Starting blocks, in order |
|---|---|---|
| IN, PK, BD, LK | India / Pakistan / Bangladesh / Sri Lanka | Live · national side: next three · current featured cricket series standings · Premier League standings · F1 · Beyond the Scoreline |
| US, CA | USA / Canada | Live · NFL standings · NBA standings · Premier League standings · Champions League standings · Beyond the Scoreline |
| GB, IE | UK / Ireland | Live · Premier League standings · Champions League standings · England: next three · F1 · Beyond the Scoreline |
| AU, NZ, ZA | Australia / New Zealand / South Africa | Live · national side: next three · featured cricket series standings · F1 · Beyond the Scoreline |
| DE, ES, IT | Germany / Spain / Italy | Live · domestic league standings · Champions League standings · F1 · Beyond the Scoreline |
| anything else, or unknown | World | Live · Premier League standings · Champions League standings · F1 · Beyond the Scoreline |

"Current featured cricket series" is whichever series `cricketFeatured.ts` ranks first in the
`getCricketSeriesWindow` window at build time; the edition entry stores the series id resolved on the
server when the page renders, so the client never guesses. "National side" is the men's international
cricket team for that country, by the side id the cricket feeds use. The builder also pulls in the
visitor's existing follows (`getFollows()`) as pre-ticked chips where a follow maps to a block type
(teams → next three, players → last five, series and tournaments → standings), so anyone who already
followed things is not starting over.

The edition name appears in the card note and the toggle. Visitors can switch to "Start blank" at any
time; the edition is only a starting draft.

### The block catalogue (phase one)

| Type | Parameters | Data | Shown | Cache (`s-maxage`) |
|---|---|---|---|---|
| `live` | none | `getHomeData()`: `liveGames`, `liveCricket`, `liveTennis` | Up to six live cards with team-colour left borders; count in the title pill | 30 s |
| `team-next` | `league`, `teamId` | DB leagues: `getTeamGamesBySeason` for the current season, last result plus next three. Cricket sides: matches in `getCricketSeriesWindow(14, 60)` where either side matches | Last result line, then three fixtures with local kick-off times | 60 s |
| `standings` | `league` | `getStandings(league)` with `standingsZones` | Top six rows, zone bars, link to the full table | 900 s |
| `series-standings` | `seriesId` | `getCricketSeries` + its records (`cricketStandings.ts` helpers) | Group table, up to six rows, NRR and points | 900 s |
| `player-form` | `league`, `playerId` | `getPlayerLog` last five rows, headline stat per league from `playerProfile.ts` | Big last-game number, five-bar chart, opponent list | 900 s |
| `f1-drivers` | none | `getF1DriverStandings(currentSeason)` top five, `getF1Calendar` next race | Five rows, next race line with local time | 3600 s |
| `bts` | none | `listArticles()` latest three | Three big-number art tiles (existing `articleArt.ts`) | 3600 s |

One route serves them all: `src/app/api/block/[type]/route.ts`. It validates `type` and the query
parameters through a pure function in `src/lib/blockParams.ts` (so the validation is testable without
a request), calls the loader, and responds with `{ block, fetchedAt }` and
`Cache-Control: public, s-maxage=<per type>, stale-while-revalidate=<4× that>`. Unknown types and bad
parameters are 400s. A valid request whose entity no longer exists (team removed, series ended) is
`{ block: null }` with the same cache headers, and the client renders the block as "Nothing to show
yet" with its remove control, never an error.

Because the URL fully describes the block, the edge serves one copy per distinct block to every
visitor who has it. The client refreshes `live` blocks every 30 s while the tab is visible (the same
interval `LiveRefresh` uses) and the others on page load only.

Adding any team or player uses the existing `/api/search` route; a chosen result becomes a
`team-next` or `player-form` block (cricket series results become `series-standings`).

### Persistence: the setup

`src/lib/homeSetup.ts`, mirroring `follow.ts`:

```ts
type HomeSetup = {
  v: 1;
  edition: string;          // "IN", "US", … or "world"; "blank" when the visitor chose Start blank
  country: string | null;   // what /api/region said, for the edition note
  blocks: HomeBlock[];      // ordered, at most 12
  createdAt: number;
  updatedAt: number;
};
type HomeBlock = {
  id: string;               // `${type}:${param values joined by ":"}`; unique within the setup
  type: BlockType;
  params: Record<string, string>;
  label: string;            // the block name as shown, e.g. "Kohli: last five"
};
```

Storage key `sportsdb-home`; a `sportsdb:home-changed` event on the same tab, like
`FOLLOWS_EVENT`. `declined: true` is stored under the same key with no blocks when the visitor
chooses "I'll decide later", which is what the pre-paint script maps to `collapsed`. Reads are wrapped
in try/catch and the page works with storage unavailable (it then always shows the builder).

Follows and the setup stay separate. `FollowButton` on team, player, series and tournament pages
gains a second action, "Add to my homepage", which appends the matching block and shows "Added" for
two seconds; if the block is already there it reads "On your homepage" and links to `/`.

### The builder (first visit)

As the mockup: title, note, edition toggles, the pre-ticked chips (Volt, with a remove ×), the "Add
more blocks" palette grouped Cricket / Football / US sports / More with outlined "+" chips, the
search box, the two buttons and the privacy note. The preview column on the right (stacked below on
phones) renders the chosen blocks as mini cards in order and is where blocks are dragged to set the
order before saving.

"Make this my homepage" writes the setup, sets the attribute to `built` and switches to the built
state in place, no reload. "I'll decide later" writes `declined` and collapses the hero to the one-line
bar without moving the page. The bar's "Start now" reopens the builder. The builder is also reachable at
any time from "Edit blocks" in the built state, where it opens as the same card over the block grid.

### The built state

As the mockup: eyebrow, generated headline, generated sub line, the three buttons, then the grid.
Three columns on desktop (the live block spans two), two on tablets, one on phones. Each block has a
drag handle, its name in Barlow Condensed, a tag (sport or competition), and a remove control. The
last card is the dashed "+ Add another block", which opens the palette. Removing the last block
returns the visitor to the builder with their edition re-suggested.

**Reorder.** The handle starts a pointer-event drag (`setPointerCapture`, no library); dropping
reorders and saves. Every handle also has "Move up" and "Move down" buttons visible on focus for
keyboard and screen-reader use. On phones, drag works the same way; the up and down buttons are always
visible.

**The built hero line.** `src/lib/homeHeroLine.ts` is a pure function from the fetched block
payloads to `{ headline, sub }`. It picks at most two facts, in this order of preference, and never
repeats an entity between headline and sub:

1. A live match in the visitor's blocks: "India 142/3, 22 balls left."
2. The visitor's player's last score: "Kohli made 102* last time out."
3. A fixture today in a `team-next` block: "Arsenal v Chelsea at 8pm."
4. The next race from the F1 block: "Singapore GP Sunday 5:30pm."
5. The leader of a standings block: "Arsenal lead the Premier League by one point."

The headline takes the first two facts; the sub line takes the next two. With no facts (all blocks
empty) the headline is "Your `<N>` blocks, `<M>` live." and the sub is empty. Times are the visitor's
local time via the existing `LocalTime` logic. The eyebrow date is the visitor's local date.

"Jump to live (N)" scrolls to the live block and is hidden when nothing is live.

### Send to my phone

`encodeSetup(setup)` produces base64url of the JSON with `createdAt`/`updatedAt` dropped;
`decodeSetup()` validates the result against the schema (type known, params present, at most 12
blocks) and rejects anything else. The link is `https://sports-db.live/?setup=<encoded>`. A setup of
12 blocks encodes to under 1,500 characters, far inside every browser and messaging limit.

On a page load with `?setup=`, `HomeBlocks` decodes it, saves it (replacing any existing setup after a
confirm dialog if one exists), and calls `history.replaceState` to drop the parameter so the clean
URL is what gets bookmarked. The cached HTML is unaffected because the parameter is only read on the
client; the ISR page ignores search params.

The button uses `navigator.share` with the link where available (phones), otherwise copies it and
shows "Link copied" inline for two seconds. Nothing is stored on the server.

### Brand: the lit block

`src/components/Logo.tsx` replaces the 5×5 `PixelBall` with the lit block: four rounded squares on a
2×2 grid in a 40-unit box (squares at 7,7 / 21,7 / 7,21 / 21,21, side 12, radius 3), the top-right
square in the live colour, the rest in `fill`. The exported component keeps the name `PixelBall` and
its props (`size`, `fill`, `live`, `background`, `backgroundRadius`, `inset`) so the seven existing
importers (icon, apple icon, four share images, `ExportFooter`, `PerformanceCard`) change only their
colours; `LogoMark` is unchanged in signature.

- Header: the mark at 30px, then the wordmark in Barlow Condensed 800 uppercase at 26px:
  "Sports" in `--mast-text`, "DB" in `--sig`. On the light footer the same with `--text` and `--sig-ink`.
- `icon.tsx` and `apple-icon.tsx`: mark in white and Volt on a `--mast` (`#0b1324`) tile.
  `src/app/favicon.ico` is deleted so the generated icon is the only one.
- The four `opengraph-image.tsx` files: mark in white and Volt; the root one drops its blue/red
  colours.
- `public/logo-512.png` is regenerated from the same geometry on the navy tile.

### Error handling

- A block fetch that fails (network, 5xx) shows the block's title, "Couldn't load, retrying", and
  retries once after 5 s; after that it keeps the last good payload if any. The hero line is computed
  from whatever loaded.
- Storage write failures (quota, private mode) show "Couldn't save on this device" under the button
  and keep the built state for the session in memory.
- Malformed stored setups (wrong version, unknown type) are discarded and the builder is shown.
- The region call failing means edition "World".

### Testing

Node tests under `tests/`, run by the existing `npm test`:

- `editions.test.ts`: every country row maps to its edition; unknown and null map to World; the
  starting blocks are valid against the catalogue.
- `home-setup.test.ts`: encode and decode round-trip; decode rejects over-length, unknown types,
  missing params, wrong version; `declined` round-trips; migration keeps `v: 1`.
- `home-hero-line.test.ts`: the five fact sources in priority order, two facts per line, no entity
  repeated, the no-facts fallback, local-time formatting.
- `block-params.test.ts`: each block type's parameter validation and the per-type cache lifetime.

The built state, reorder, "Send to my phone" and the no-flash behaviour are verified in the browser
preview during implementation against a checklist in the plan; there is no component test runner in
the repo and this does not add one.

### Out of scope

Accounts, server-stored profiles, notifications, email, a short-code service, blocks beyond the seven
above (the palette mockup also shows constructors, top scorers, Test rankings, NFL and NBA
scoreboards, Asian Games medals and news; those chips are not offered in phase one), and any change to pages other than the homepage, `FollowButton`
and the brand assets.

## Files

New: `src/lib/editions.ts`, `src/lib/homeSetup.ts`, `src/lib/homeHeroLine.ts`, `src/lib/blockParams.ts`,
`src/lib/blockLoaders.ts`, `src/app/api/block/[type]/route.ts`, `src/components/home/HomeBuilder.tsx`,
`src/components/home/HomeBlocks.tsx`, `src/components/home/BlockFrame.tsx`,
`src/components/home/blocks/*.tsx` (one per type), the four tests.

Changed: `src/app/page.tsx`, `src/app/layout.tsx`, `src/app/globals.css`, `src/app/api/region/route.ts`,
`src/components/Logo.tsx`, `src/components/Nav.tsx`, `src/components/FollowButton.tsx`,
`src/app/icon.tsx`, `src/app/apple-icon.tsx`, the four `opengraph-image.tsx`, `public/logo-512.png`.

Removed: `src/components/MyFollows.tsx`, `src/app/api/follows/games/route.ts` (only `MyFollows` used it),
`src/app/favicon.ico`.
