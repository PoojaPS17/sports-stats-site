# Coverage report and backup check: draft

Status: DRAFT (2026-09-20), for review. Nothing here is built into the repo, committed, or run against production. The coverage script draft is `2026-09-20-coverage-report-draft.ts.txt` (this folder); it was type-checked and run once, read-only, against the local rehearsal database. Both pieces belong on their own branch off `main`, after the stage-aware merge (the report reads the `stage` column).

Why: the aim is that once history is stored we stop re-pulling it and only watch live games. That needs two facts we do not have yet: which seasons are provably complete in our database, and that the database itself can be restored.

## 1. Coverage report: `npm run audit:coverage [league] [--strict]`

Read-only, no ESPN calls. One table row per league and season, then findings, then a "complete since" verdict per league.

What it checks:

| Check | Rule | Why this rule |
|---|---|---|
| Teams x games | Count completed regular-stage games per team; the most common count is "usual"; teams that differ are listed. For NBA and NFL the usual count is also compared with the league's full length (NBA 82, NFL 16 to 2020 and 17 from 2021). | Needs no external truth for the per-team check, and the fixed length catches a whole league missing its last week. |
| Gaps | Any stretch with no completed game longer than 10 days (NBA) or 15 days (NFL, which has a two-week gap before the Super Bowl) inside a season. | Catches a missing month that every team shares, which the per-team rule cannot see. |
| Box scores | For NBA and NFL: share of completed games with a `game_details` report and with `player_game_stats` lines. | The player pages and the performance cards depend on these. |
| Loose ends | Games not completed, older than 3 days, and not marked Postponed or Canceled; completed games missing a score; games with no season year. | A real hole, as opposed to an expected postponement. |
| Standings | Standings rows per season next to the season's teams. | A season without standings shows a blank table. |
| Verdict | "Schedule complete from season X" and "box scores complete from season Y": the first season after which every closed season passes. A season with any game still to come is "open" and left out. | This is the answer to "are we fully set". |

Known exceptions are a short table in the script (season, kind, reason) and are printed but not counted: NBA 2019-20 (suspended 12 Mar to 31 Jul 2020, teams played 63 to 75 games) and NFL 2022 (Bills v Bengals cancelled, two teams on 16). Anything else that fails is a finding. `--strict` exits 1 on any finding, like `audit-player-totals`.

What the first run on the local rehearsal database showed (NBA and NFL from 2015, box scores loaded from 2024 only, so box-score findings there are expected):
- The team-schedule backfill left NBA 2015 to 2026 and NFL 2015 to 2026 complete: every team on 82 (NBA) or 16/17 (NFL) games. Nothing missing.
- Every "never finished" game turned out to be a Postponed or Canceled event that ESPN keeps next to the replayed game. Before the script learned to separate them, they looked like holes (NBA 2021: 32; NBA 2022: 11). Those rows are stored with a 0-0 score, `completed = false`, `stage = regular`.
- Not covered by the draft: whether a game that is stored is stored correctly (the two audits already cover scores and player totals), and soccer seasons (only the games-per-team check applies; the reference lengths are NBA and NFL only).

Before it is built: split the queries from the verdict logic into a pure `scripts/lib/audit-coverage.ts` with tests (the draft is one file so it could be read and run), bind the league argument as a query parameter, and add `"audit:coverage"` to `package.json`. Effort: about half a day including tests. Runs on demand and monthly; not part of the tick.

## 2. Backup check

### What the repo already says (read from `tools/oci/provision.sh`, not yet verified on the VM)

- PostgreSQL 17 on the VM, port 5433, local connections only, PgBouncer in front.
- A cron job `/etc/cron.d/sportsdb-backup`: nightly at 03:20 UTC, `pg_dump -Fc` to `/var/backups/sportsdb/sportsdb-YYYYMMDD.dump`, keep 7 days.

This corrects something I said earlier: I said I had not checked whether the database is backed up. A nightly dump is set up. I have not confirmed it is running, that the files are healthy, or that one has ever been restored.

### Gaps in that setup

1. **Same disk as the database.** It protects against a bad migration or an accidental delete. It does not protect against losing the VM, the disk or the Oracle account. Once ESPN history is only in our database (the goal), that is the one copy.
2. **No alert.** Cron output goes nowhere; if the dump fails or writes a truncated file, nothing tells us. The `scrape_runs` heartbeat and `check:stale` already exist for scrapers and would do this job.
3. **No restore test.** An untested backup is a guess.
4. **Retention of 7 nightly dumps only.** A problem found after a week is not recoverable.
5. **Not covered:** the VM's `.env` (secrets), nginx and PgBouncer config. They are outside the database and not in git.

### Read-only checks on the VM (run only after you approve each one)

```
cat /etc/cron.d/sportsdb-backup
ls -l --time-style=long-iso /var/backups/sportsdb/
sudo -u postgres psql -p 5433 -Atc "select pg_size_pretty(pg_database_size('sportsdb'))"
df -h /
sudo -u postgres pg_restore --list "$(ls -1t /var/backups/sportsdb/*.dump | head -1)" | head -5
```

Pass means: the cron file exists; the newest dump is under 26 hours old; the seven files are similar in size and none is empty; the disk has room for several times the database size; `pg_restore --list` prints a table of contents without error (it reads the dump, changes nothing).

### Restore test (a write; shown and approved before it runs)

Restore the newest dump into a scratch database on the VM (`createdb sportsdb_restoretest`, `pg_restore`, compare row counts of `games`, `player_game_stats`, `game_details` with the live database, then `dropdb`). It uses some disk and CPU for a few minutes and touches nothing live. Alternative with no VM writes: copy the dump to the Mac and restore into the local throwaway Postgres, which also produces an off-VM copy; that needs a `pg_restore` of version 17 or later on the Mac.

### Improvements, cheapest first (none built or enabled)

1. **Fresh dump before the production migration.** `npm run migrate` rewrites `games` (the stored `stage` column) and takes a lock on it. Take a manual `pg_dump` immediately before it. Costs minutes and some disk. This goes into the production runbook regardless of the rest.
2. **Off-VM copy to the Mac.** `scp` the newest dump over the existing key, weekly. No Oracle resource, no cost; the download counts as egress but a dump is far below the 10 TB a month allowance. It depends on the Mac being on.
3. **Alert on a missing or bad dump.** Replace the cron one-liner with `deploy/vm/backup.sh`: dump to a temporary file, check it with `pg_restore --list`, check it is at least half the size of yesterday's, move it into place, then record a `db-backup` heartbeat (`npm run record:run db-backup`). Add `"db-backup": 1560` (26 hours) to `MAX_AGE_MINUTES` in `scripts/lib/heartbeat.ts`, and `check:stale` will fail when backups stop. No new service.
4. **Oracle-side copy (decision for you).** Options: an Object Storage bucket for dumps, or boot-volume backups. Both are new resources in the tenancy. I believe Always Free covers a small amount of each (Object Storage about 20 GB, a few volume backups), but I have not checked current Oracle documentation, and on a pay-as-you-go account anything over the free amount is billed. The size of the database (check above) decides whether dumps times retention fit. I will not create either without your explicit go-ahead and a confirmed limit.
5. **Longer retention:** keep the newest dump of each month for 6 months, if the size allows.

Recommended order: the checks, then 1 (before the migration), 3, 2, then decide 4 and 5 from the database size.

## 3. Found on the way (not part of this work; not verified in a browser)

`getHeadToHead` in `src/lib/analytics.ts` (line 397) picks the next meeting as the earliest game that is not completed, across all dates. A Postponed or Canceled game from an earlier season counts as "not completed", so for a pair of teams with a postponed past meeting the page may show that old game as the upcoming one, ahead of the real next one. It is a small change (ignore games whose status is Postponed or Canceled, and games in the past) and it sits in the function the stage-aware branch already changed. Worth a test with a postponed fixture before deciding.
