#!/usr/bin/env bash
# Install and enable the scraper timers. Run on the VM: sudo bash deploy/vm/install.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
install -m 644 "$here"/systemd/sportsdb-scrape@.service "$here"/systemd/sportsdb-scrape-*.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now sportsdb-scrape-tick.timer sportsdb-scrape-daily.timer sportsdb-scrape-hourly.timer
systemctl list-timers 'sportsdb-scrape-*' --no-pager
