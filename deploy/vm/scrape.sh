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
  # Heartbeat for check:stale, only when every step above succeeded (an idle tick counts too).
  if [ "$failed" -eq 0 ]; then run record:run -- scrape-tick; fi
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
  # Un-windowed safety nets for cricket, in the order the data needs: the competition sweep adds
  # games the scores scrape never saw, then the reconcile adds internationals the listing knows but
  # the 21-day sweep missed, then the top-up fills scorecards for completed games with no player
  # rows (leaders and match pages). `run` records a failure and keeps going, so a bad sweep never
  # skips the two after it.
  run sweep:cricket-seasons
  run import:cricket-espn -- --reconcile
  run topup:cricket-player-stats
  run fetch:fixtures
  run seed:f1-teams
}

# Feeds the old workflow never scheduled, then the alarm for any scraper that stopped.
job_hourly() {
  unset SCRAPE_MODE SCRAPE_LEAGUES
  run fetch:injuries
  run fetch:f1-scores
  run fetch:f1-standings
  # This job only covers the CURRENT edition. After first deploying this feature, run
  # `npm run backfill:asian-games-medals` once, manually, to seed every past edition (1951-2025).
  run fetch:asian-games-medals
  run check:stale
}

# Rosters barely change intra-day; once a day matches the old GitHub schedule (08:17 UTC).
job_rosters() {
  run migrate
  run fetch:rosters
  run fetch:cricket-rosters
  run fetch:player-photos
  run fetch:team-info
}

# Wikipedia pageviews and App Store charts; hourly, same as the old GitHub schedule.
job_trending() {
  run migrate
  run fetch:trending-wikipedia
  run fetch:trending-appstore
}

# Weekly Cricsheet archive import (Monday 05:41 UTC, matching the old GitHub schedule). The VM
# has no `unzip`, so this unpacks with python3's zipfile module instead (present on every stock
# Ubuntu image) rather than asking for a package install. Downloads go to a scratch directory
# that is removed on exit, win or lose, so runs never see a previous run's leftovers.
job_cricsheet() {
  local dir
  dir="$(mktemp -d "${TMPDIR:-/tmp}/cricsheet.XXXXXX")"
  # Double-quoted so $dir is baked into the trap command now, not looked up when the trap fires:
  # by the time job_cricsheet returns and this RETURN trap runs, the `local dir` binding above is
  # already gone, and a live '$dir' reference would hit set -u's unbound-variable check.
  trap "rm -rf '$dir'" RETURN
  run migrate
  if ! (
    set -e
    curl -sSL -o "$dir/odis_male_json.zip" https://cricsheet.org/downloads/odis_male_json.zip
    curl -sSL -o "$dir/t20s_male_json.zip" https://cricsheet.org/downloads/t20s_male_json.zip
    curl -sSL -o "$dir/ipl_male_json.zip" https://cricsheet.org/downloads/ipl_male_json.zip
    curl -sSL -o "$dir/bbl_male_json.zip" https://cricsheet.org/downloads/bbl_male_json.zip
    curl -sSL -o "$dir/people.csv" https://cricsheet.org/register/people.csv
    for name in odis t20s ipl bbl; do
      python3 -c "import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])" "$dir/${name}_male_json.zip" "$dir/$name"
    done
  ); then
    echo "[scrape] FAILED: cricsheet download/unzip" >&2
    failed=1
    return
  fi
  run import:cricsheet -- odi "$dir/odis" --people "$dir/people.csv" --missing
  run import:cricsheet -- t20i "$dir/t20s" --people "$dir/people.csv" --missing
  run import:cricsheet -- ipl "$dir/ipl" --people "$dir/people.csv"
  run import:cricsheet -- bbl "$dir/bbl" --people "$dir/people.csv"
}

main() {
  case "${1:-}" in
    tick) job_tick ;;
    daily) job_daily ;;
    hourly) job_hourly ;;
    rosters) job_rosters ;;
    trending) job_trending ;;
    cricsheet) job_cricsheet ;;
    *) echo "usage: scrape.sh <tick|daily|hourly|rosters|trending|cricsheet>" >&2; exit 2 ;;
  esac
}

# Keep this the last line, on one line: bash reads a script by offset and parses this whole line
# before running it, so the daily job's `git pull` replacing this file cannot change the exit.
main "$@"; exit "$failed"
