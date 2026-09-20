#!/usr/bin/env bash
# Scheduled scraper jobs for the Oracle VM. Mirrors .github/workflows/scrape.yml step for step
# (GitHub's cron ran it about every 3 hours instead of every 15 minutes); systemd timers call
# `scrape.sh <tick|daily|hourly>`. A failing step is recorded but never stops later, independent
# steps; the job exits 1 if any step failed so systemd and journalctl show it.
# `migrate` runs only in the daily job (after its git pull), so after any manual `git pull` on
# the VM, run `npm run migrate` yourself.
set -uo pipefail

scrape_dir="${SCRAPE_DIR:-/opt/sportsdb/scrapers}"
cd "$scrape_dir" || { echo "[scrape] cannot cd to $scrape_dir" >&2; exit 1; }

failed=0
check_out=""

# Remove the check:live temp file however the job ends; a SIGTERM (systemd stop or timeout) turns
# into a normal exit so the EXIT trap still runs.
trap 'rm -f "$check_out"' EXIT
trap 'exit 143' TERM INT HUP

# run <npm-script> [-- args]: run one scraper step, remember a failure, keep going.
run() {
  echo "[scrape] $(date -u +%H:%M:%S) npm run $*"
  npm run --silent "$@" || { echo "[scrape] FAILED: $*" >&2; failed=1; }
}

# The daily job pulls the latest main so scraper fixes reach the VM without a manual deploy.
update_code() {
  local before after
  before="$(cksum package-lock.json)"
  git pull --ff-only --quiet || { echo "[scrape] git pull failed" >&2; failed=1; return; }
  after="$(cksum package-lock.json)"
  if [ "$before" != "$after" ]; then
    echo "[scrape] package-lock.json changed - npm ci"
    npm ci --no-audit --no-fund || { echo "[scrape] npm ci failed" >&2; failed=1; }
  fi
}

# Two scoreboard requests per league decide whether the real fetch runs, and for which leagues.
job_tick() {
  local should_scrape mode leagues
  # A stray SCRAPE_MODE / SCRAPE_LEAGUES from systemd or .env.local must never narrow a run;
  # only the values computed below are passed, per step.
  unset SCRAPE_MODE SCRAPE_LEAGUES
  check_out="$(mktemp "${TMPDIR:-/tmp}/scrape-check.XXXXXX")"
  GITHUB_OUTPUT="$check_out" FORCE_SCRAPE=false run check:live
  should_scrape="$(sed -n 's/^should_scrape=//p' "$check_out")"
  mode="$(sed -n 's/^mode=//p' "$check_out")"
  leagues="$(sed -n 's/^leagues=//p' "$check_out")"
  rm -f "$check_out"
  if [ "$should_scrape" = "true" ]; then
    SCRAPE_LEAGUES="$leagues" run seed:teams
    SCRAPE_MODE="$mode" SCRAPE_LEAGUES="$leagues" run fetch:all
  fi
  # Tennis and cricket run all day in every time zone, so these feeds are read on every tick.
  run fetch:tennis-daily
  run fetch:cricket-series -- --days 1 --ahead 2
}

# Full update of every league, plus the once-a-day sweeps.
job_daily() {
  unset SCRAPE_MODE SCRAPE_LEAGUES
  update_code
  run migrate
  run seed:teams
  SCRAPE_MODE=full SCRAPE_LEAGUES= run fetch:all
  run fetch:tennis-daily
  run fetch:cricket-series -- --days 1 --ahead 2
  run fetch:cricket-series -- --days 10 --ahead 90
  run fetch:tennis-rankings
  run fetch:tennis-daily -- --calendar --days 1 --ahead 1
  run import:cricket-espn
  run fetch:fixtures
  run seed:f1-teams
}

# Feeds the old workflow never scheduled, then the alarm for any scraper that stopped.
job_hourly() {
  unset SCRAPE_MODE SCRAPE_LEAGUES
  run fetch:injuries
  run fetch:f1-scores
  run fetch:f1-standings
  run check:stale
}

case "${1:-}" in
  tick) job_tick ;;
  daily) job_daily ;;
  hourly) job_hourly ;;
  *) echo "usage: scrape.sh <tick|daily|hourly>" >&2; exit 2 ;;
esac

exit "$failed"
