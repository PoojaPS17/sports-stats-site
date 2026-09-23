# Asian Games medal tally + live cricket: design

Status: APPROVED (2026-09-23). Branch `feat/asian-games-medal-tally` off `main` at `1c0ed5d`. Implementation plan not written yet.

## Goal

The user wants "all the Asian Games" on the site: historic editions get a medal tally page each, the current (2026 Aichi-Nagoya, 19 Sep – 4 Oct) edition gets a medal tally that updates while the Games are on, plus genuinely live match coverage wherever the site can honestly provide it.

That last part is a hard constraint, not a nice-to-have: **"live" only ever means real-time data from a source we actually have.** The Asian Games run 41-43 sports; ESPN's hidden API (the site's only source of real-time scores) has zero endpoints for the Asian Games in any sport — verified live against today's date (2026-09-23): ESPN's basketball scoreboards (NBA/WNBA/men's college) returned no Asian Games events, and ESPN's full soccer scoreboard (78 matches today) contained none either. The one exception is cricket, which the site already carries live because Asian Games cricket fixtures flow through the existing ESPN cricket series pipeline like any other series.

The Games' own official results backend (`back.results.asiangames2026.org`) does have real-time data for every sport, discovered during a spike, but it 403s any request without spoofed browser headers and restricts CORS to its own origin — a deliberate "private to our app" signal. Building a scraper around that means permanently spoofing headers to defeat their access controls, which is a bot-detection bypass; out of scope, full stop, not a phase-2 item.

SerpApi's Google Sports Results product (a legitimate paid alternative the user pointed at) was also checked: its documented coverage is major leagues only (soccer, NFL, NBA, NHL, MLB, cricket, tennis, motorsport), nothing suggesting Asian Games or niche-sport coverage. Same gap, different vendor.

So the shape of this feature is exactly what's honestly buildable: a medal tally (historic + current, all 41-43 sports represented in the numbers even though we can't show their individual matches) sourced from Wikipedia, and live match coverage that stays scoped to cricket, which the site already has.

## What already exists (read from the code, 2026-09-23)

- **F1's standalone route tree** (`src/app/f1/{page.tsx, standings/page.tsx, events/[id]/page.tsx, ...}`) is the pattern for a competition that isn't a `[league]` team-vs-team page. `f1/standings/page.tsx` takes `searchParams: Promise<{ season?: string }>` and a client `<F1SeasonSelect>` to switch editions via `?season=`, re-querying per edition — no dynamic route segment per season.
- **`f1_standings(season_year, standings_type, entity_espn_id, position, points, wins, updated_at)`**, primary key `(season_year, standings_type, entity_espn_id)` — the precedent for "recurring event, many editions": the edition is a plain int column, not a separate editions table.
- **`src/lib/standingsOrder.ts`** — pure, DB-free `sortStandings()` picking the right ordering per sport family, used by pages, share-image cards and history pages alike. The pattern a medal-tally sort function should copy: sort logic lives on its own, separate from the query layer, independently testable.
- **The `MULTI_SPORT_GAMES` regex already exists** ([homeData.ts:94](../../../src/lib/homeData.ts)), matching `/\b(asian games|commonwealth games|olympic)/i` against a cricket series name so multi-sport-games cricket ranks as headline news on the homepage regardless of team status. This confirms Asian Games cricket is already flowing through the normal cricket scrape/series/games pipeline today — nothing new is needed to keep showing it live; this feature only adds a dedicated Asian Games page that surfaces those same matches plus the medal tally.
- **Scraper convention**: one script per data type in `scripts/`, run via `tsx`, registered as an npm script, looping with catch-and-continue per item so one failure doesn't kill the run, `pool.end()` at the close (`scripts/fetch-standings.ts` is the reference shape). Upserts go through `INSERT ... ON CONFLICT ... DO UPDATE`, with `updated_at = now()`.
- **Schema convention**: a single append-only `db/schema.sql`, `create table if not exists` plus incremental `alter table ... add column if not exists`, applied by `scripts/migrate.ts` (re-runs the whole file; every statement must be idempotent).
- **Production scheduling**: systemd timers on the VM (`deploy/vm/scrape.sh <tick|hourly|daily|...>`, guarded by `flock`), not GitHub Actions (those are now `workflow_dispatch`-only fallback). A new scrape step is wired into `scrape.sh` and gets its own timer cadence or joins an existing one.
- **`src/lib/nav.ts`** — the single source of truth for header/drawer/footer nav, pure constants, `NavItem` either a direct link or a dropdown with children; F1 and Cricket are the closest existing entries in shape.

## Design

### 1. Data source: Wikipedia, not the Games' own backend

Confirmed via spike: standalone `"{year} Asian Games medal table"` articles exist for every edition from **1954 through 2026** (19 pages). The sole exception is **1951**, whose medal table lives inline in the `"1951 Asian Games"` article's "Medal table" section — the scraper title-falls-back to that article and locates the table by heading text, not a fixed section number, when the standalone title 404s. This fallback path also covers the brief window right after a future Games starts, before editors split out its standalone page.

Fetch method: MediaWiki's core REST API, `GET /w/rest.php/v1/page/{title}/html` (rendered HTML, templates already expanded — flag icons, tied-rank rowspans included as real `rowspan` attributes), not the deprecated RESTBase path and not raw wikitext (medal tables are built from templates; reimplementing template expansion to parse wikitext directly is exactly the fragile path to avoid). Parse the specific `<table class="wikitable">` following the "Medal table" heading (matched by heading text, not table index — an editor adding a notes table above it would shift a fixed index) with Cheerio, walking `rowspan`/`colspan` explicitly ourselves: this is the one part every generic "wiki table to JSON" npm package gets wrong (checked `tabletojson`, `wtf_wikipedia` — neither handles the merged-rank-cell case medal tables rely on for ties), so it's about 50 lines of hand-rolled row-walking, not a new dependency.

Wikidata was checked and ruled out: the "All-time Asian Games medal table" Wikidata item (`Q4728393`) has no populated per-country medal statements, just a bare hub item. Not usable.

**Required `User-Agent`**: Wikimedia's API Etiquette policy hard-403s requests without a descriptive User-Agent. Format: `sportsdblive-medalscraper/1.0 (https://sports-db.live; <contact>) node-fetch/3`. No bot registration or API key needed for this read-only, low-volume (1-2 pages, every 15-60 min during an open Games, once ever for closed editions) use — miles under the ~200 req/min a compliant User-Agent gets.

**Attribution (CC BY-SA 4.0 requirement)**: the medal tally page carries a footer: "Medal data from Wikipedia's ['{edition} Asian Games medal table'](wikipedia URL), used under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)."

### 2. Schema

```sql
create table if not exists medal_tally (
  edition_year integer not null,
  nation_slug text not null,
  nation_name text not null,
  gold integer not null default 0,
  silver integer not null default 0,
  bronze integer not null default 0,
  rank integer,
  source_url text,
  updated_at timestamptz not null default now(),
  primary key (edition_year, nation_slug)
);
```

`nation_slug` (not an IOC/NOC code) is the key: Wikipedia's medal tables don't reliably carry an NOC column in every edition, but the linked nation name is always present, so the scraper slugifies that. `rank` is stored as Wikipedia shows it (already tie-aware via their rowspan) rather than only recomputed client-side, so the page can match the source of truth exactly; `medalTallyOrder.ts` (below) is what recomputes it for sorting/display and is unit-tested against tie cases independently.

No separate "editions" table. Edition metadata (host city, start/end dates, which edition is "current") lives in a small pure lib file, `src/lib/asianGamesEditions.ts` — the same treatment F1 gives its circuits and race-name constants, because a new edition is a deliberate, rare (every ~4 years) code change requiring curated info (host city name, dates), not scraped data.

### 3. Scraper

- `scripts/lib/asianGamesMedals.ts`: `fetchMedalTable(editionYear): Promise<MedalRow[]>` — REST API fetch with title fallback, Cheerio parse, rowspan-aware row walk. `upsertMedalTally(editionYear, rows): Promise<number>` — the `ON CONFLICT (edition_year, nation_slug) DO UPDATE` upsert, following `upsertStandingsResponse()`'s shape.
- `scripts/fetch-asian-games-medals.ts`: fetches only the **current** edition (from `asianGamesEditions.ts`), following `fetch-standings.ts`'s loop/catch-continue/`pool.end()` shape. Wired into `deploy/vm/scrape.sh`'s tick or hourly job while an edition is open; no-ops (or isn't scheduled at all) once the Games close, since closed-edition data doesn't change.
- `scripts/backfill-asian-games-medals.ts`: one-time script, loops every edition in `asianGamesEditions.ts`, run manually once (`npm run backfill:asian-games-medals`) to seed 1951-2022. Not scheduled.

### 4. Ordering

`src/lib/medalTallyOrder.ts`: pure `sortMedalTally(rows)`, IOC convention (gold desc, then silver desc, then bronze desc, then nation name), mirroring `standingsOrder.ts`'s separation from the query layer — unit tests cover the tie cases (equal gold/silver/bronze, and Wikipedia's own stored `rank` disagreeing with a naive recompute, which should not happen but the test guards it).

### 5. Routes

- `src/app/asian-games/page.tsx` — hub: current edition status (dates, host city, days remaining/elapsed from `asianGamesEditions.ts`), a link into the medal tally, and the Asian Games cricket matches already selected by the existing `MULTI_SPORT_GAMES`-aware cricket pipeline (a filtered view, not a new query — reuse `getUpcomingCricketMatches`/`getLiveCricketMatches` output filtered by the same series-name regex already in `homeData.ts`, so this page can never show a match the regex wouldn't already call an Asian Games fixture).
- `src/app/asian-games/medal-tally/page.tsx` — `searchParams: Promise<{ edition?: string }>`, defaults to the latest edition in `asianGamesEditions.ts`. Table sorted with `sortMedalTally()`, an edition switcher (client component, same shape as `F1SeasonSelect`), the Wikipedia attribution footer described above.
- `export const revalidate = 300;` on both (current-edition data moves at most every 15-60 min per the scraper cadence; closed editions never change, so 300s costs nothing).

### 6. Nav

New top-level entry in `src/lib/nav.ts`: `{ label: "Asian Games", href: "/asian-games" }`, same shape as the existing F1 entry (no dropdown needed — the hub page itself links to the medal tally).

## Explicitly out of scope

- Match-level or event-level data for any Asian Games sport other than cricket. There is no honest source for it (see Goal).
- Scraping or otherwise relying on `back.results.asiangames2026.org` or any other bot-protected backend.
- A "results feed" for non-cricket sports sourced from Wikipedia's event-by-event articles (considered and dropped: Wikipedia's per-event updates lag real events by an unpredictable amount — minutes to hours depending on who's editing — which is a materially different and weaker thing than the "live" the rest of the site promises; the user's approved scope is medal tally + cricket-only live, not a stale results ticker for other sports).
