#!/usr/bin/env bash
# Scheduled scraper jobs for the Oracle VM. Mirrors .github/workflows/scrape.yml step for step
# (GitHub's cron ran it about every 3 hours instead of every 15 minutes); systemd timers call
# `scrape.sh <tick|daily|hourly>`. A failing step is recorded but never stops later, independent
# steps; the job exits 1 if any step failed so systemd and journalctl show it.
set -uo pipefail

cd "${SCRAPE_DIR:-/opt/sportsdb/scrapers}"

failed=0

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
  local out should_scrape mode leagues
  out="$(mktemp)"
  GITHUB_OUTPUT="$out" FORCE_SCRAPE=false run check:live
  should_scrape="$(sed -n 's/^should_scrape=//p' "$out")"
  mode="$(sed -n 's/^mode=//p' "$out")"
  leagues="$(sed -n 's/^leagues=//p' "$out")"
  rm -f "$out"
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
