#!/usr/bin/env bash
# Deploys the app whenever origin/main differs from the sha that was last BUILT and started.
# sportsdb-deploy.timer runs this every ten minutes as ubuntu from /opt/sportsdb/repo; a run
# that finds nothing new exits 0 in a second.
#
# The comparison is against the checkout's .deployed.sha, written only after a deploy ends with a
# healthy app, never against the checkout's HEAD: a manual `git pull` moves HEAD without building
# anything, and on 2026-10-03 that made the first run exit while the app still served the old build.
# No marker (first run, or a build done by hand) means deploy.
#
# The build runs in its own checkout (/opt/sportsdb/build) while the live app keeps serving. Until
# 2026-10-07 the app was stopped first and `next build` ran in the live checkout, so every merge
# took the site offline for the whole build (about three minutes of 502s); with twelve merges in a
# day Googlebot met 86 server errors, robots.txt among them, and cut its crawl rate by three
# quarters. Now the app is down only for the swap: stop, rename the finished .next (and
# node_modules when package-lock.json changed) into the live checkout, start. A build that fails
# leaves the live app untouched and running; a swapped-in build that does not answer the health
# check is swapped back out and the previous build restarted, and the unit fails either way (the
# ops report lists it under host.failedUnits; `journalctl -u sportsdb-deploy` has the reason).
#
# `next start` in the live checkout reads next.config.ts, public/ and package.json from there, so
# the live checkout is fast-forwarded too, before the stop: a running server reads none of those
# again after boot (public/ files are static, a new one beside an old build is harmless).
#
# NODE_ENV is cleared on purpose: with it set to production, npm ci drops the dev dependencies
# (tsx, the migrate runner, the build tooling) and the next start cannot boot (2026-10-03 outage).
#
# Everything lives in main() so bash parses the whole file before running any of it: the
# fast-forward below replaces this very file, and bash otherwise reads a script as it goes.
set -uo pipefail
unset NODE_ENV

log() { echo "[deploy] $(date -u +%H:%M:%S) $*"; }
fail() { log "FAILED: $*" >&2; exit 1; }

main() {
  local repo build scrape_env health built_marker built target
  local live_lock_before build_lock ci_stamp moved_modules=0
  repo="${APP_REPO:-/opt/sportsdb/repo}"
  build="${BUILD_REPO:-/opt/sportsdb/build}"
  scrape_env="${SCRAPE_ENV:-/opt/sportsdb/scrape.env}"
  health="${APP_HEALTH:-http://127.0.0.1:3000/api/health}"
  # Inside the checkout because ubuntu owns it; untracked (.gitignore), so a fast-forward never touches it.
  built_marker="${BUILT_MARKER:-$repo/.deployed.sha}"

  cd "$repo" || fail "cannot cd to $repo"
  git fetch --quiet origin main || fail "git fetch"

  built="$(cat "$built_marker" 2>/dev/null || echo none)"
  target="$(git rev-parse origin/main)"
  if [ "$built" = "$target" ]; then
    exit 0
  fi
  log "built ${built:0:7}, origin/main ${target:0:7}: deploying"

  # ---- Build, with the live app still serving ------------------------------------------------
  if [ ! -d "$build/.git" ]; then
    log "no build checkout at $build, cloning"
    git clone --quiet "$(git remote get-url origin)" "$build" || fail "git clone into $build"
  fi
  cd "$build" || fail "cannot cd to $build"
  git fetch --quiet origin main || fail "git fetch in $build"
  # Detached at origin/main: the build checkout never carries a branch of its own.
  git checkout --quiet --detach origin/main || fail "git checkout origin/main in $build"
  # .next/cache is the compiler's cache, kept here between builds so they stay warm; it is not
  # handed over (the live app makes its own, which also stops the runtime fetch cache growing
  # across deploys: it was 7.6 GB on 2026-10-07).
  rm -rf .next
  mkdir .next
  [ -d .next-cache ] && mv .next-cache .next/cache

  # node_modules here is installed from the lock it was stamped with; reinstall when the lock moved
  # or the tree is gone (it is handed to the live checkout whenever the lock changes, see the swap).
  build_lock="$(cksum package-lock.json)"
  ci_stamp="$(cat .npm-ci.lock-cksum 2>/dev/null || echo none)"
  if [ ! -d node_modules ] || [ "$build_lock" != "$ci_stamp" ]; then
    log "npm ci in $build (lock changed or node_modules missing)"
    npm ci --no-audit --no-fund || fail "npm ci in $build"
    echo "$build_lock" > .npm-ci.lock-cksum || fail "could not write .npm-ci.lock-cksum"
  fi

  # migrate reads DATABASE_URL from the process environment; dotenv only loads .env.local/.env,
  # which are empty on the VM, and the real value lives in the scrapers' env file. Migrations are
  # additive and already run beside the live app every morning (scrape.sh), so this is safe here.
  DATABASE_URL="$(grep '^DATABASE_URL=' "$scrape_env" | cut -d= -f2- | tr -d '\r')"
  [ -n "$DATABASE_URL" ] || fail "DATABASE_URL not found in $scrape_env"
  export DATABASE_URL
  npm run migrate || fail "npm run migrate"

  # NEXT_PUBLIC_* values are baked in at build time, so the production env must be in scope here.
  # It lives in the live checkout (the app unit's EnvironmentFile) and is not copied around.
  set -a
  # shellcheck disable=SC1091
  . "$repo/.env.production"
  set +a
  npm run build || fail "npm run build (live app untouched; see journalctl -u sportsdb-deploy)"
  [ -f .next/BUILD_ID ] || fail "npm run build left no .next/BUILD_ID in $build"
  rm -rf .next-cache
  [ -d .next/cache ] && mv .next/cache .next-cache

  # ---- Bring the live checkout's files to the same sha, still serving --------------------------
  cd "$repo" || fail "cannot cd to $repo"
  live_lock_before="$(cksum package-lock.json)"
  git merge --ff-only --quiet origin/main || fail "fast-forward to origin/main (local commits on the VM?)"

  # ---- Swap: the only window the app is down ---------------------------------------------------
  rm -rf .next.prev .next.failed node_modules.prev
  sudo systemctl stop sportsdb-app || fail "stop sportsdb-app"
  mv .next .next.prev 2>/dev/null
  mv "$build/.next" .next || swap_back "could not move the new .next into $repo"
  if [ "$live_lock_before" != "$(cksum package-lock.json)" ] || [ ! -d node_modules ]; then
    log "package-lock.json changed, taking the build checkout's node_modules"
    mv node_modules node_modules.prev 2>/dev/null
    mv "$build/node_modules" node_modules || swap_back "could not move node_modules into $repo"
    moved_modules=1
  fi
  sudo systemctl start sportsdb-app || swap_back "start sportsdb-app"
  for _ in 1 2 3 4 5 6 7 8 9 10 11 12; do
    sleep 5
    if curl -fsS --max-time 5 "$health" >/dev/null 2>&1; then
      echo "$target" > "$built_marker" || fail "could not write $built_marker"
      log "live on ${target:0:7}, health ok"
      rm -rf .next.prev node_modules.prev
      exit 0
    fi
  done
  swap_back "sportsdb-app started but $health did not answer within 60s"
}

# Puts the previous build back and restarts it, then fails the unit. The rejected build stays in
# .next.failed (and node_modules.failed) for a look; the next run removes them.
swap_back() {
  log "swapping the previous build back: $*" >&2
  sudo systemctl stop sportsdb-app
  rm -rf .next.failed node_modules.failed
  [ -d .next ] && mv .next .next.failed
  [ -d .next.prev ] && mv .next.prev .next
  if [ "$moved_modules" = 1 ] && [ -d node_modules.prev ]; then
    mv node_modules node_modules.failed
    mv node_modules.prev node_modules
  fi
  sudo systemctl start sportsdb-app
  fail "$*"
}

main "$@"
