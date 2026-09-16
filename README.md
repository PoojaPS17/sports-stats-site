# ScoreDB — NBA & NFL scores, standings and player stats

Programmatic-SEO sports tracker. Pattern: free ESPN data → scraper cron → Postgres → templated pages → ads. See `/Users/ps/.claude/plans/validated-singing-crane.md` for the original build plan.

## How it works

- `scripts/fetch-scores.ts`, `fetch-standings.ts`, `fetch-player-stats.ts` pull from ESPN's free, unauthenticated "hidden" JSON API and upsert into Postgres.
- The Next.js app (`src/app`) reads from the same database and renders pages per league: scores, standings, teams, players — with 60s–300s ISR revalidation.
- In production, `.github/workflows/scrape.yml` runs the scrapers every 15 minutes via GitHub Actions.

## Local development

This repo bundles its own Node runtime reference isn't required if you already have Node 20+ on PATH. If not, see `../tools/env.sh` (adds a standalone Node 20 to PATH for this session).

```bash
npm install

# start a local Postgres (auto-downloads a real Postgres binary, no Docker needed)
npm run dev:db   # leave this running in its own terminal

# in another terminal:
npm run migrate        # apply schema.sql
npm run seed:teams     # load NBA + NFL teams
npm run fetch:all      # pull current scores, standings, player stats

npm run dev             # http://localhost:3000
```

`.env.local` already points `DATABASE_URL` at the local embedded Postgres (`postgres://postgres:password@localhost:5433/sports`).

## Deploying

1. **Database**: create a free [Supabase](https://supabase.com) Postgres project. Copy its connection string.
2. **Schema**: run `DATABASE_URL=<supabase-url> npm run migrate && DATABASE_URL=<supabase-url> npm run seed:teams` once, locally, against the Supabase database.
3. **Scraper**: push this repo to a public GitHub repo. Add a repo secret `DATABASE_URL` (the Supabase connection string). The `scrape.yml` workflow will then run every 15 minutes for free.
4. **Frontend**: import the repo into [Vercel](https://vercel.com), set the `app` folder as the project root, add the `DATABASE_URL` env var, deploy.
5. **Domain**: point your domain at the Vercel project once you own one.
6. **Ads**: swap the `AdSlot` component (`src/components/AdSlot.tsx`) placeholders for real AdSense/Ezoic embed code once approved.

## Adding a betting-odds phase (later)

Deliberately not built yet — see the plan file for why (compliance/disclosure overhead). When ready: add a `fetch-odds.ts` script against [The Odds API](https://the-odds-api.com) (free tier: 500 credits/month), an `odds` table, and `/[league]/odds` pages, plus a responsible-gambling disclaimer in the footer.
