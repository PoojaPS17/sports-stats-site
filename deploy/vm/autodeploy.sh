#!/usr/bin/env bash
# Deploys the app whenever origin/main has moved. sportsdb-deploy.timer runs this every ten
# minutes as ubuntu from /opt/sportsdb/repo; a run that finds nothing new exits 0 in a second.
#
# Order matches the manual deploy (stop, pull, install, migrate, build, start): `next build`
# empties .next first and `npm ci` empties node_modules, so a server left running through
# either would serve 500s anyway. A build that fails leaves the service STOPPED and the unit
# failed, which the ops report lists under host.failedUnits; `journalctl -u sportsdb-deploy`
# has the reason. Fix forward on main (or `git checkout` the previous sha by hand) and rerun.
#
# NODE_ENV is cleared on purpose: with it set to production, npm ci drops the dev dependencies
# (tsx, the migrate runner, the build tooling) and the next start cannot boot (2026-10-03 outage).
set -uo pipefail
unset NODE_ENV

repo="${APP_REPO:-/opt/sportsdb/repo}"
scrape_env="${SCRAPE_ENV:-/opt/sportsdb/scrape.env}"
health="${APP_HEALTH:-http://127.0.0.1:3000/api/health}"

log() { echo "[deploy] $(date -u +%H:%M:%S) $*"; }
fail() { log "FAILED: $*" >&2; exit 1; }

cd "$repo" || fail "cannot cd to $repo"
git fetch --quiet origin main || fail "git fetch"

before="$(git rev-parse HEAD)"
after="$(git rev-parse origin/main)"
if [ "$before" = "$after" ]; then
  exit 0
fi
log "main moved ${before:0:7} -> ${after:0:7}, deploying"

lock_before="$(cksum package-lock.json)"
sudo systemctl stop sportsdb-app || fail "stop sportsdb-app"
git merge --ff-only --quiet origin/main || fail "fast-forward to origin/main (local commits on the VM?)"

if [ "$lock_before" != "$(cksum package-lock.json)" ]; then
  log "package-lock.json changed, npm ci"
  npm ci --no-audit --no-fund || fail "npm ci"
fi

# migrate reads DATABASE_URL from the process environment; dotenv only loads .env.local/.env,
# which are empty on the VM, and the real value lives in the scrapers' env file.
DATABASE_URL="$(grep '^DATABASE_URL=' "$scrape_env" | cut -d= -f2- | tr -d '\r')"
[ -n "$DATABASE_URL" ] || fail "DATABASE_URL not found in $scrape_env"
export DATABASE_URL
npm run migrate || fail "npm run migrate"

# NEXT_PUBLIC_* values are baked in at build time, so the production env must be in scope here.
set -a
# shellcheck disable=SC1091
. ./.env.production
set +a
npm run build || fail "npm run build (service left stopped; see journalctl -u sportsdb-deploy)"

sudo systemctl start sportsdb-app || fail "start sportsdb-app"
for _ in 1 2 3 4 5 6 7 8 9 10 11 12; do
  sleep 5
  if curl -fsS --max-time 5 "$health" >/dev/null 2>&1; then
    log "live on ${after:0:7}, health ok"
    exit 0
  fi
done
fail "sportsdb-app started but $health did not answer within 60s"
