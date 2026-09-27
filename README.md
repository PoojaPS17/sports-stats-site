# SportsDB — NBA, NFL, Premier League & IPL scores, standings and player stats

Programmatic-SEO sports tracker. Pattern: free ESPN data → scraper cron → Postgres → templated pages → ads. See `/Users/ps/.claude/plans/validated-singing-crane.md` for the original build plan.

## How it works

- `scripts/fetch-scores.ts`, `fetch-standings.ts`, `fetch-player-stats.ts` pull from ESPN's free, unauthenticated "hidden" JSON API and upsert into Postgres.
- The Next.js app (`src/app`) reads from the same database and renders pages per league: scores, standings, teams, players, leaders, news — with 60s–300s ISR revalidation.
- In production the scrapers run from the Oracle VM's systemd timers (`deploy/vm/`: a live-game tick every 15 minutes, plus hourly and daily jobs); `.github/workflows/scrape.yml` is the same job run by hand from the Actions tab. `.github/workflows/scrape-rosters.yml` runs once a day (rosters barely change intra-day).
- Adding a league means adding it to each script's `LEAGUES` array plus its ESPN path in `scripts/lib/espn.ts` — but the response *shapes* differ meaningfully between American team sports, soccer, and cricket (per-player match stats, standings with draws/points/goals or NRR), so it's not purely config. See the soccer/cricket branches in `fetch-player-stats.ts`, `fetch-standings.ts`, `fetch-scores.ts`, and `seed-teams.ts` for the pattern to follow.
- **IPL (cricket) is scores + standings + news only for now.** ESPN's `/teams/{id}/roster` and per-athlete stats endpoints both 404 for this competition (`"League not found"`), so there's no roster or per-player batting/bowling data yet — rather than build a parser against an uncertain/possibly-incomplete data shape (`summary.matchcards`, confirmed to exist but with an unclear completeness guarantee), that's left as a follow-up once verified further. Cricket's score is a compound string (e.g. `"161/5 (18/20 ov, target 156)"`), stored in `games.home_score_display`/`away_score_display` alongside a best-effort parsed run-count int in `home_score`/`away_score`; the actual match winner comes from ESPN's explicit `winner` flag (`games.home_winner`/`away_winner`), not score comparison, since cricket results aren't decidable by comparing final run totals alone.

## Local development

Requires Node 20+.

```bash
npm install

# start a local Postgres (auto-downloads a real Postgres binary, no Docker needed)
npm run dev:db   # leave this running in its own terminal

# in another terminal:
npm run migrate        # apply schema.sql
npm run seed:teams     # load NBA + NFL + Premier League + IPL teams
npm run fetch:all      # pull current scores, standings, player stats

npm run dev             # http://localhost:3000
```

`.env.local` already points `DATABASE_URL` at the local embedded Postgres (`postgres://postgres:password@localhost:5433/sports`).

## Deploying

**Live at [sports-db.live](https://sports-db.live)**, self-hosted (not Vercel/Supabase — the section below used to describe that pre-launch setup and was out of date). Layout: Cloudflare (DNS + proxy) in front of a single Oracle Cloud "Always Free" VM (`sportsdb-db`, user `ubuntu`). Postgres and the Next.js app (`sportsdb-app` systemd service, port 3000) both run on that VM; scrapers (`/opt/sportsdb/scrapers`) run there too on systemd timers, not GitHub Actions.

**Code-only deploy** (no schema/migration changes):

```bash
cd /opt/sportsdb/repo
sudo systemctl stop sportsdb-app
git pull --ff-only
npm ci
source .env.production   # NEXT_PUBLIC_* vars are build-time, must be sourced before building
npm run build
sudo systemctl start sportsdb-app
```

This takes the app down for a few minutes; a failed build leaves the service stopped, so check `systemctl status sportsdb-app` after.

**If `db/schema.sql` changed**, `git pull` does NOT apply it — run `npm run migrate` (and any relevant `npm run backfill:*` script) by hand afterward, from the VM checkout. Those scripts load `DATABASE_URL` via dotenv from a local `.env`/`.env.local`, which is empty on the VM; the real value lives in `/opt/sportsdb/scrape.env` (loaded automatically for the scraper timers, but not by an interactive shell). Plain `source /opt/sportsdb/scrape.env` has silently failed to export it before — use this instead:

```bash
export DATABASE_URL=$(grep '^DATABASE_URL=' /opt/sportsdb/scrape.env | cut -d= -f2- | tr -d '\r')
```

**Ads**: `AdSlot` (`src/components/AdSlot.tsx`) is already wired into every page template and renders nothing unless `NEXT_PUBLIC_ADS_ENABLED=true`. Once approved by an ad network, set that flag and swap in the real embed code — no placeholder work left to do.

Every VM command here touches production directly and is run by the repo owner, never by an agent over SSH — and any command that sources `.env.production` or `scrape.env` can echo `DATABASE_URL` (including the plaintext DB password) into its output. Scan for a line starting with `DATABASE_URL=postgresql://` before pasting output anywhere, and redact it.

## Adding a betting-odds phase (later)

Deliberately not built yet — see the plan file for why (compliance/disclosure overhead). When ready: add a `fetch-odds.ts` script against [The Odds API](https://the-odds-api.com) (free tier: 500 credits/month), an `odds` table, and `/[league]/odds` pages, plus a responsible-gambling disclaimer in the footer.
