#!/usr/bin/env bash
# Install and enable the scraper timers. Run on the VM: sudo bash deploy/vm/install.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
install -m 644 "$here"/systemd/sportsdb-scrape@.service "$here"/systemd/sportsdb-scrape-*.timer /etc/systemd/system/
install -m 644 "$here"/systemd/sportsdb-deploy.service "$here"/systemd/sportsdb-deploy.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now sportsdb-scrape-tick.timer sportsdb-scrape-daily.timer sportsdb-scrape-hourly.timer sportsdb-scrape-rosters.timer sportsdb-scrape-trending.timer sportsdb-scrape-cricsheet.timer
# The deploy timer polls origin/main for the app checkout (/opt/sportsdb/repo), not the scrapers' checkout.
systemctl enable --now sportsdb-deploy.timer
systemctl list-timers 'sportsdb-*' --no-pager
