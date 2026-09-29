# The Ops Room

The Ops Room is nine report-only cloud agents for sports-db.live. Each runs
once a day (the Steward runs weekly) as a Claude Code routine, checks one
area of the site, and writes what it found into a private dashboard
artifact's database with the `ArtifactData` tool. The dashboard page (built
in a later task) reads those documents live; nothing here writes to the
repository or to the production database, and no agent posts, merges,
deploys or changes a setting.

## Where things live

- `ops/crew/<id>.md` is one agent's prompt: front matter plus a body. The
  nine ids are `physio`, `umpire`, `kit-manager`, `analyst`, `scout`,
  `editor`, `press-officer`, `scorer` and `steward`.
- `ops/crew/_protocol.md` is the reporting protocol shared by every agent:
  how to read the crew card and open issues before checking anything, how to
  apply the issue rules (open, reopened, fixed, auto-resolved) after
  checking, how to write the run record and the crew card, how to prune old
  runs, and the final `RESULT:` line.
- `ops/crew/_chrome-readings.md` is the prompt for the local scheduled task
  on the owner's Mac (weekdays 10:00 IST, Claude in Chrome): Search Console,
  Bing Webmaster and GA4 readings merged into `daily/<yesterday>`. It is not
  a cloud routine; the cloud cannot use the owner's signed-in browser.
- `ops/room/seed.json` seeds the dashboard's database: a `crew` document per
  agent (copied from that agent's front matter) and a `rules` document, the
  owner's standing rules shown on the page.
- The report endpoint is `GET /api/ops/report`, cached at the edge for fifteen
  minutes. The route memoises the report for 15 minutes in-process, whatever the
  query string, so cache-busting cannot make the origin recompute.
- `tests/ops-crew.test.ts` checks the shape of all of the above: every crew
  file has the required front matter keys, a `## Never` section, the
  `{{OPS_ROOM_URL}}` placeholder, no em-dashes, and none of the actions an
  agent must never take; the protocol mentions the key mechanics; the seed's
  crew entries match each file's front matter exactly.

## How a routine is built

A later task (Task 12) reads a crew file's front matter for the routine's
name, group, model and cron `schedule` (already UTC, five fields). The
routine's prompt is the file's body with `_protocol.md` appended beneath it,
and the literal token `{{OPS_ROOM_URL}}` replaced everywhere, in both files,
with the dashboard artifact's real URL. `{{DATE}}` is not used anywhere: the
protocol has the agent read the date itself with `date -u`, so a routine
created today behaves the same if it is recreated next month.

Each crew file is self-contained on purpose. A cloud session starts with no
memory of this conversation, the repository's history, or any earlier run,
so every check needs exact URLs, commands and thresholds written into the
file itself, not implied by context.

## Loading the seed

`ops/room/seed.json` is loaded once, when the dashboard artifact is first
published, with a single `ArtifactData` `batch` write: one `set` per
`crew/<id>` document and one `set` per `rules/<id>` document. After that the
crew documents are updated only by the agents themselves (each agent updates
its own `crew/<id>` at the end of its run) and the rules documents only by
the owner, editing them on the page.

## What agents may touch

An Ops Room agent's only side effects are writes to the artifact's database,
in the `issues`, `runs`, `crew`, `status` and `daily` collections, and only
for its own agent id (`status/site` is the Physio's alone; `daily/<date>` is
shared with the Scorer and a separate Chrome task, and is always merged,
never overwritten). Agents never write to the repository, never touch the
production database, and never take an action outside their own report:
no commits, no pull request activity, no social posts, no search-engine
submissions, no setting changes.

## Setup outside the repository

These are done once, by the owner, and nothing in the repository can do them.

- **Cloud environment network access.** The routines run in the claude.ai cloud environment "Default". Its Network access must be Custom with `sports-db.live`, `site.api.espn.com`, `www.googleapis.com`, `api.github.com`, `github.com` and `rdap.org` allowed, plus the default package-manager list. Path: claude.ai/code home, the "Default" chip, hover Cloud, the gear beside Default, "Edit cloud environment". The URLs `/code/environments` and `/code/settings/environments` are 404.
- **Repository source on routines that use GitHub.** Physio, Editor, Steward and Groundsman list the repository as a source; without it the sandbox answers `GitHub access to this repository is not enabled for this session` to every `api.github.com` call.
- **Backup directory on the VM.** `/var/backups/sportsdb` is owned by `postgres` and the app runs as `ubuntu`, so the report's backup section needs: `sudo apt install -y acl && sudo setfacl -m u:ubuntu:rx /var/backups/sportsdb && sudo setfacl -m u:ubuntu:r /var/backups/sportsdb/*.dump && sudo setfacl -d -m u:ubuntu:r /var/backups/sportsdb`.
- **Journal access on the VM**, for `host.app.errors24h`: `sudo usermod -aG systemd-journal ubuntu`, then restart `sportsdb-app`. Until then the field is null.
- **PageSpeed API key**, for the Kit Manager's scores: an environment variable `PAGESPEED_API_KEY` on the Kit Manager routine (the main session sets it; the value never enters the repository).
- **Cloudflare read-only token**, optional, for the Steward's Cloudflare checks: `CLOUDFLARE_ANALYTICS_TOKEN` on the Steward routine, scoped to Analytics: Read and Zone Settings: Read.
- **The restore-test timer**, once the Groundsman's pull request lands: install `deploy/vm/restore-test.service` and `.timer` per the PR body.

## Giving orders

On the page, every issue row has Fix, Explain and Recheck; the Orders section takes a free-text order. Orders go into `orders/` and the Groundsman routine picks them up hourly between 08:35 and 22:35 IST. Code changes come back as a pull request on a `groundsman/<order id>` branch; data changes come back as a script under `scripts/ops/` with the command to run on the VM. The Groundsman never merges, deploys or touches the VM. To run it now, open its routine at claude.ai/code/routines and press Run.
