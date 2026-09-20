# API data optimisation — design

Status: design approved by the user on 2026-09-20 (all five sections). Spec not yet committed.

## Addendum (2026-09-20, found while planning Phase A)

1. **GitHub cron is unreliable for this repo.** Measured over 3.6 days: the "every 15 minutes" scrape ran about 8 times a day
   (median gap 172 min, max 325 min), "hourly" trending had a 189 min median gap, and the "06:07 UTC" daily run started
   between 10:44 and 11:28 UTC. Database-backed pages therefore lagged ESPN by roughly 3 hours on game days.
   **Decision (user, 2026-09-20): run the scraper schedule from the Oracle VM with systemd timers** (`deploy/vm/`), keeping
   GitHub workflows only for rosters, trending and Cricsheet. A2 below is implemented that way; A4 (concurrency) is provided
   by systemd, which never starts a running oneshot service twice.
2. **The site is already served from the Oracle VM** (`sportsdb-app.service`, Next.js on port 3000 behind nginx and Cloudflare,
   checkout `/opt/sportsdb/repo`, running since 2026-09-19 17:34 UTC). Consequences for Phase B: the refresh signal targets the
   local app (`http://127.0.0.1:3000/api/revalidate`), a single self-hosted Next.js instance keeps its ISR cache on disk (fine
   for one VM), and Vercel limits matter only for the vercel.app review alias. The VM checkout was 3 commits behind
   `origin/main` when inspected; deploying it is the user's step.
3. **Phase A "A1 baseline"** is delivered in two parts: a freshness report (`scripts/audit-freshness.ts`) with the plan, and the
   page ↔ database ↔ ESPN comparison as the Task 3 audit that follows.


## Goal

Use ESPN, the database and hosting efficiently without ever lowering data accuracy or completeness.
Live pages stay fresh (10–120 s). Everything else is cached aggressively and refreshed only when the
underlying data really changes. The design must work on Vercel today and on Oracle + Cloudflare later.

Hard constraint: no data mismatch. Every step is verified against the database and against ESPN.

## Context (measured 2026-09-20)

- Site: Next.js 16 (App Router, ISR) on Vercel Hobby, functions in bom1. Database: Postgres 17 on an Oracle
  Always Free ARM VM behind PgBouncer (transaction pooling). Scrapers: GitHub Actions (public repo, so minutes are free).
- Database is healthy: 853 MB, 99.96 % heap / 99.99 % index cache hits, autovacuum working, only ~2.5 MB of unused indexes.
- Live ESPN fetching happens only in `src/lib/gamesLive.ts`, `matchDetail.ts`, `tennisLive.ts`, `cricketLive.ts`.
- Scrapers never scheduled: `fetch:injuries`, `fetch:f1-scores`, `fetch:f1-standings`, `seed:f1-teams`.
  Injuries and F1 data were 2.5–2.6 days old. `fetch:tennis-scores` is superseded by `fetch:tennis-daily` and stays off.
- Every upsert rewrites `updated_at`, so "nothing changed" cannot be detected. `injuries` is delete-then-insert
  without a transaction. `f1_sessions` upsert does not update `date` on conflict.
- No workflow has a `concurrency` guard; recent runs lasted 50–100 minutes and can overlap the next tick.

## Phase A — before the site goes live (correctness)

A1. **Baseline comparison script** (read-only): for a sample of pages per league compare page ↔ database ↔ live ESPN.
    Saved before any change so existing mismatches are separated from any introduced later. Re-run after each step.
A2. **Schedule the missing scrapers**: new workflow, hourly: `fetch:injuries`, `fetch:f1-scores`, `fetch:f1-standings`.
    `seed:f1-teams` joins the daily 06:07 UTC run. `fetch:tennis-scores` stays unscheduled.
A3. **Heartbeat table** `scrape_runs` (one row per scraper: `last_ok_at`, `last_changed_at`). Scrapers write it on success.
    The "last updated" stamp reads it. A staleness check fails the workflow loudly when a scraper misses its window.
A4. **`concurrency` groups** on every scraper workflow so a new tick waits instead of overlapping.
A5. **Injuries atomic**: delete + insert in one transaction so a reader never sees an empty list.
A6. **Task 3 audit** (systematic-debugging): find and fix remaining ESPN ↔ site mismatches, including the `f1_sessions.date`
    and `f1_events` field updates on conflict.

## Phase B — efficiency (after launch, gated by Phase A evidence)

B1. **Guarded upserts**: `WHERE <written columns> IS DISTINCT FROM <new values>` so unchanged rows are skipped and each run
    reports the number of rows truly changed. The guard compares exactly the columns the upsert writes, so a change can
    never be missed. Benefits: fewer dead rows, accurate sitemap/ICS `lastmod`.
B2. **Refresh signal**: `POST /api/revalidate` (secret `REVALIDATE_SECRET`, 401 without). `src/lib/revalidateMap.ts` is
    generated from a dependency-analysis script, and a build/CI check fails if any page reads a table no scope covers.
    Scrapers send one signal per run, only when rows changed; failure logs a warning and never fails the scrape.
    Pattern-based invalidation across all leagues (`revalidatePath('/[league]/standings', 'page')`).
    Signal URL and secret come from environment variables so the host can change without code changes.
B3. **Page tiers**: Group A live (`/`, game/match detail, cricket series, tennis pages) keep 10–120 s. Group B (DB-only pages)
    become signal-driven with a 6 h backup timer. Group C (`top-games`, sitemaps, OG images, static) stay timer-only.
    Timer values live in a few tier constants so reverting is one commit.
B4. **Database**: lower `log_min_duration_statement` from 2000 ms to 250 ms (reload only, needs approval), review after a week,
    `EXPLAIN ANALYZE` the `games` sequential-scan queries, add pool limits in `src/lib/db.ts` after reading the PgBouncer config.
    `pg_stat_statements` is not enabled (would need a Postgres restart).

## Checks

- Coverage check: every page's tables are covered by a scope; every scraper's tables map to a scope.
- Guarded-upsert test: run twice → 0 changes; change each written column alone → exactly 1 change.
- Signal endpoint test: 401 without secret, 200 with it, unknown scope rejected, correct paths invalidated.
- Injuries test: a reader during a replace never sees an empty list.
- Tests use Node's built-in test runner via `tsx` and `embedded-postgres` (already a dev dependency), never the Oracle database.

## Rollout order

| Step | Change | Verification |
|---|---|---|
| 0 | Baseline comparison (A1) | Report saved |
| 1 | A2–A5: schedule scrapers, heartbeat, concurrency, atomic injuries | Injuries and F1 < 1 h old |
| 2 | B1 guarded upserts | Second identical run changes 0 rows |
| 3 | B2 endpoint + generated map, unused | 401/200, coverage check green |
| 4 | Scrapers send signals, timers unchanged | Real change visible in ~1 min, comparison clean |
| 5 | B3 lengthen Group B timers to 6 h, after ~48 h clean | Vercel usage flat or lower |
| 6 | B4 database items | Review after a week |

Rollback: steps 1–2 revert the commit; steps 3–4 remove `REVALIDATE_SECRET` (scrapers skip signalling, timers still cover);
step 5 one commit; step 6 restore old config.

## Success criteria

Injuries and F1 never more than 2 h old; a repeat scraper run changes 0 rows; a real change shows on the site within ~60 s;
sampled pages show 0 mismatches; Vercel usage no higher than today; no scrape fails because of a signal.

## Constraints and approvals

- Oracle Always Free only: one A1 VM ≤ 4 OCPU / 24 GB, ≤ 200 GB storage, outbound ≤ 10 TB/month, no other paid resources.
- Vercel Hobby limits are the tighter constraint (ISR writes, active CPU, origin transfer).
- The user sets `REVALIDATE_SECRET` in Vercel and as a GitHub Actions secret before step 3.
- Nothing is committed or pushed without the user's explicit approval. SSH to the VM and the log-threshold change need approval.
- A later move of the site to Oracle + Cloudflare is a separate project; a single self-hosted Next.js instance keeps its cache on disk,
  which is fine for one VM.
