# Ops Room: design

**Date:** 2026-09-28
**Status:** approved in chat by the site owner on 2026-09-28; implementation plan follows.

## 1. Goal

One private page, the Ops Room, that shows the site owner every morning whether sports-db.live is healthy, what the data looks like, what needs attention, and what a set of named agents found overnight. The agents run unattended, report only, and never change the site. The owner decides what to act on and asks for the fix in chat.

The model is a page a friend of the owner built for ps-store-db.live: a roster of named agents with one job each, scheduled jobs that leave one dated line per agent, an issue list, a rulebook, and a showcase. This design reproduces the working parts. The animated pixel showcase is explicitly out of scope for the first version.

## 2. Decisions already taken

| Question | Decision |
|---|---|
| Where the agents run | Claude Code cloud routines, the same mechanism as the daily article draft. One exception below for Search Console, Bing and GA4, which need the owner's browser. |
| What an agent may do | Report only. No commits, no pull requests, no posts. |
| Naming | Sports crew roles: Physio, Umpire, Kit Manager, Analyst, Scout, Press Officer, Editor, Scorer, Steward. |
| Cadence | Every agent daily, except the Steward weekly. |
| Alerts | The dashboard only. The existing GitHub watchdog keeps emailing when scrapers stop. |
| Search Console and Bing | The owner has given Claude in Chrome signed-in access. Those readings come from a local scheduled task on the owner's Mac, weekdays at 10:00 IST. |
| Showcase | Later, after the crew works. |

## 3. Architecture

```
cloud routine (one per agent, daily)      local scheduled task (weekdays 10:00 IST)
   reads live site, /api/ops/report,          Claude in Chrome: Search Console,
   ESPN, GitHub, npm audit                    Bing Webmaster, GA4
        |                                              |
        v  ArtifactData (set/update/batch)             v
   +---------------------------------------------------------+
   |  Ops Room artifact database (db capability)              |
   |  crew/  runs/  issues/  status/  daily/  rules/          |
   +---------------------------------------------------------+
        ^ onSnapshot                                  ^ owner clicks
   Ops Room page: Today, Issues, Runs, Crew, Rulebook
```

Three parts:

1. **A read-only report endpoint in the site**, `/api/ops/report`, because the database only accepts connections from the VM. It runs the data checks in SQL, returns aggregate numbers and up to five example ids per finding, and is cached at the edge for fifteen minutes.
2. **The Ops Room artifact**, a single HTML page with the `db` capability. It reads the database live and lets the owner acknowledge or close an issue and edit the rulebook.
3. **The crew**: nine agent prompts kept in the repo under `ops/crew/`, each created as a cloud routine from that file. One local scheduled task for the browser-only readings.

### 3.1 How results travel

Every agent writes with the `ArtifactData` tool, as the owner, to the artifact's database. The spike on 2026-09-28 (a run-once routine writing `spike/run1`) is the proof that a cloud routine can do this. If the spike had failed, the fallback was for routines to commit JSON under `ops/reports/` on a branch and a local step to load it; the rest of the design is unchanged either way.

### 3.2 Data model

All documents are JSON objects. The store holds at most 5,000 documents, so runs are pruned.

**`crew/<agentId>`**, one per agent, seeded by the session and updated by the agent at the end of each run.

```
{ id, name, role, group, job, never, when, schedule, model,
  lastRunAt, lastStatus, lastHeadline, routineId }
```

`group` is one of `dugout`, `officials`, `backroom`, `front-office`.

**`runs/<agentId>-<YYYY-MM-DD>`**, one per agent per day, written once at the end of the run.

```
{ agent, date, startedAt, finishedAt, status, headline, details, issueKeys }
```

`status` is `ok`, `warn` or `fail`. `headline` is the one line shown on Today, at most 160 characters. `details` is Markdown, at most 8 KB. Each agent deletes its own runs older than 60 days at the end of a run.

**`issues/<key>`**, one per distinct problem. `key` is `<agentId>:<slug>`, stable across days so a problem is never reported as new twice.

```
{ key, agent, severity, title, detail, fix, firstSeen, lastSeen,
  occurrences, status, statusChangedAt, autoResolved }
```

`severity` is `critical`, `high`, `medium` or `low`. `status` is `open`, `acknowledged`, `fixed` or `reopened`. The agent's rules at the end of a run:

- Finding with no existing issue: create it `open`, `occurrences` 1.
- Finding whose issue is `open`, `acknowledged` or `reopened`: update `lastSeen`, increment `occurrences`, refresh `detail`.
- Finding whose issue is `fixed`: set `reopened`, update `lastSeen`.
- An `open` or `reopened` issue of this agent that was not found this run: set `fixed` with `autoResolved: true`. The owner's `acknowledged` issues are never auto-closed by the agent; they close when the finding stops appearing for seven consecutive runs.

**`status/site`**, written by the Physio only.

```
{ up, checkedAt, latencyMs, productionCommit, mainCommit, deployPending,
  edgeStale, tlsDaysLeft }
```

**`daily/<YYYY-MM-DD>`**, one per day, merged by the Scorer (cloud) and the local Chrome task.

```
{ date, views, gameViews, topGames: [{league, id, name, views}],
  byCountry: {IN: n, ...}, byPlatform: {ios, android, desktop},
  ga4Users, ga4Views, gscClicks, gscImpressions, gscIndexed, gscNotIndexed,
  bingIndexed, bingCrawlErrors, readAt: {scorer, chrome} }
```

**`rules/<id>`**, the rulebook. `{ text, order, addedAt, addedBy }`. Seeded with the standing rules; editable on the page by the owner.

Access: the default `db: {}` rules. The artifact is organization-internal and the owner is the only writer that matters.

### 3.3 The report endpoint

`GET /api/ops/report` in `src/app/api/ops/report/route.ts`. Public, aggregate only, no ids beyond ESPN's public identifiers, `Cache-Control: public, s-maxage=900`. Each section is computed by a function in `src/lib/opsReport.ts` so it can be tested against the throwaway Postgres in `tests/helpers/testDb.ts`. Sections:

- **`build`**: the commit the running build was made from and the build time. The commit is read at build time in `next.config.ts` and exposed as an environment variable.
- **`heartbeats`**: every `scrape_runs` row with its age in minutes and the limit from `MAX_AGE_MINUTES`.
- **`freshness`**: newest `updated_at` or `fetched_at` per table (the logic of `scripts/audit-freshness.ts`), and per league the date of the newest completed game and the newest scheduled game.
- **`duplicates`**: counts and up to five examples for each of: games with the same league, UTC day, home and away team under different ids; players with the same league, lower-cased name and team under different ids; tennis matches with the same tour, tournament, round and players under different ids; cricket series matches whose scores disagree with the `games` row for the same ESPN id; news articles with the same league and URL under different ids.
- **`scraping`**: completed games older than 48 hours whose `updated_at` moved in the last 24 hours (refetching finished fixtures); tick runs in the last 24 hours if a run log exists, otherwise the age of the tick heartbeat.
- **`integrity`**: completed games with a null score; completed games older than 48 hours with no `player_game_stats` row, per league, excluding leagues ESPN provides no box score for; games dated more than 400 days from today; `player_game_stats` and `player_season_stats` rows whose player or game is missing; standings rows where played is not the sum of won, lost and drawn; teams with no game in the current season; F1 sessions in the past with no result row.
- **`volume`**: rows per table with a timestamp column inserted in the last 24 hours against the mean of the previous seven days.
- **`backup`**: newest file in `/var/backups/sportsdb`, its age in hours and size, and the size of the one before it. `null` when the directory does not exist.
- **`dbHealth`**: database size, the five largest tables, dead-row ratio per table from `pg_stat_user_tables`, and current connections against `max_connections`.
- **`views`**: `game_views` for yesterday and today in UTC: total, top five games with names, by country, by platform.

The endpoint never throws for one failed section: each section is `{ ok: false, error }` on failure so the Umpire can report that too.

## 4. The crew

Times are IST. Each agent's prompt lives in `ops/crew/<id>.md` with YAML front matter (`id`, `name`, `role`, `group`, `schedule` as UTC cron, `model`) and the prompt as the body. The prompt is self-contained: the cloud session starts with no memory.

| Id | Name | Group | Runs | Model |
|---|---|---|---|---|
| physio | Physio, site health | backroom | 06:00 daily | claude-sonnet-5 |
| umpire | Umpire, data | officials | 06:15 daily | claude-sonnet-5 |
| kit-manager | Kit Manager, layout | backroom | 06:30 daily | claude-sonnet-5 |
| analyst | Analyst, search engines | front-office | 06:45 daily | claude-sonnet-5 |
| scout | Scout, visibility | front-office | 07:15 daily | claude-sonnet-5 |
| editor | Editor, article gate | officials | 07:30 daily | claude-sonnet-5 |
| press-officer | Press Officer, social | front-office | 07:45 daily | claude-sonnet-5 |
| scorer | Scorer, daily numbers | front-office | 08:00 daily | claude-sonnet-5 |
| steward | Steward, security | backroom | 05:30 Monday | claude-sonnet-5 |

The dugout group holds the owner and the main chat session as cards, not routines.

**Physio.** Fetches a fixed seed list of twenty URLs and records status, latency and cache headers. Flags any non-200, a CSS or JS chunk referenced by a page that returns 404, `cf-cache-status: HIT` with an `age` above the page's `s-maxage`, a prefetch payload (`?_rsc=`) that references a chunk the current build does not have, TLS certificate under 14 days, robots.txt or a sitemap unreachable. Reads `/api/health` and `/api/ops/report.build`, compares the production commit with `main` on GitHub, and writes `status/site`. Never: nothing to change, this agent only reads.

**Umpire.** Reads `/api/ops/report`. Every section above becomes a finding with a severity: a stale heartbeat or a league whose newest completed game is older than its newest real result on ESPN is `critical`; duplicates, refetching, null scores and orphan rows are `high`; volume drops, backup age over 26 hours and dead-row ratio over 20 percent are `medium`; the rest `low`. Cross-checks three completed games from yesterday against ESPN's scoreboard JSON, sending the browser user agent ESPN requires. Never: connects to the database directly, or suggests deleting rows without naming the exact ids.

**Kit Manager.** Runs PageSpeed Insights (no key needed at this volume) for the home page, a league page, a match page, an article page and a player page, mobile and desktop. Flags cumulative layout shift over 0.1, accessibility below 90, contrast and tap-target failures, and a performance score that fell by 15 or more since the previous run (kept in the run details). Fetches the same pages' HTML and checks for overflow-prone patterns the sweep found before: unbounded chips in the scores strip, images without dimensions. Falls back to the HTML checks alone if the API is throttled.

**Analyst.** Fetches every sitemap, counts URLs, validates XML, checks that `lastmod` values are not in the future and that the newest article is present. Checks the IndexNow key file returns 200. Validates JSON-LD on one game page, one article and one player page, and reports the known open Event warnings (`offers`, `endDate`) as `low` with a note that they are open on purpose. Reads the Chrome task's numbers from `daily/` and flags a week-on-week drop in clicks or indexed pages over 20 percent. Never: submits anything to a search engine.

**Scout.** Searches `site:sports-db.live` on Google and Bing for the newest article and two recent games and records whether they are indexed. Lists pages linked from the home page that are missing from the sitemap and article pages with fewer than three internal links pointing at them. Writes one concrete reach suggestion a day in the run details, never the same one twice in fourteen days.

**Editor.** Finds the open pull request from the article routine. Reads the article, verifies every number with a web search, checks house style (no em-dashes, footer attribution, title budget, the career-label rule), runs `npm test` and `npx tsc --noEmit` on the branch, and writes a verdict headline: merge, merge with edits, or skip, with the reasons. Never: comments on, approves or merges the pull request.

**Press Officer.** Reads the X daily plan document and the social posts log the X routines keep, lists what was planned against what was posted, drafts up to three posts from yesterday's results with the exact copy in the run details, and flags a story already posted in the last seven days. Never: posts, replies or schedules anything.

**Scorer.** Reads `/api/ops/report.views` and writes `daily/<date>` with views, top games, country and platform splits, plus the headline line, for example "27 Sep: 1,204 game views, top IND v WI 3rd ODI, 61% India, 70% mobile". Never: changes anything.

**Steward, weekly.** Runs `npm audit --omit=dev` and `npm outdated` for `next`, `react` and `pg`, checks security headers on the home page, TLS expiry, that `.env*` files are not tracked, and greps the tree for key-shaped strings. Never: upgrades a dependency.

### 4.1 The local Chrome task

A scheduled task on the owner's Mac, weekdays at 10:00 IST, run by this Claude app with Claude in Chrome. It opens Search Console for sports-db.live and reads the last seven days of clicks and impressions and the indexed and not-indexed page counts; opens Bing Webmaster Tools and reads indexed pages and crawl errors; opens GA4 and reads yesterday's users and views. It merges the numbers into `daily/<yesterday>` with `readAt.chrome` and writes issues for a drop over 20 percent week on week. It never changes a setting in any of the three tools. If the app is closed at 10:00 the task does not run that day; the Today tab shows the last reading with its date.

## 5. The page

A single HTML artifact with the site's identity: navy bands, Volt lime signature, Barlow Condensed for display type, the site's light and dark tokens. Five tabs.

- **Today.** Status banner from `status/site`: up or down, latency, production commit, deploy pending, edge stale, checked at. Counts of open `critical` and `high` issues. Then one row per agent from `crew/`: name, role, `lastHeadline`, date, coloured dot for `lastStatus`. Yesterday's numbers from `daily/`.
- **Issues.** Open, acknowledged and reopened issues grouped by severity, each a row with agent, title, first seen, last seen, occurrences, and the fix. Two buttons per row: Acknowledge and Mark fixed, which update the document. A collapsed list of issues fixed in the last seven days.
- **Runs.** Per agent, the last fourteen runs with status, headline and expandable details rendered from Markdown.
- **Crew.** Cards in the four groups, each with Job, Never, When, and Last run, the format of the friend's character card. The dugout holds the owner and the main chat session.
- **Rulebook.** Ordered rules, editable inline by the owner, with an add box.

Live: the page subscribes once per collection and re-renders on change. It works with `db` unavailable by showing an empty-state message. No external libraries except a Markdown renderer from cdnjs.

## 6. Seeds

On first publish the session seeds `crew/` from the nine files, `rules/` with:

1. Deploy from `main` only, after the pull request is merged. Never between 04:30 and 07:30 IST, when the daily scrape runs.
2. Purge the Cloudflare cache once after every deploy, and check `/beyond-the-scoreline` serves the new build.
3. Agents report. They never commit, merge, post or change a setting.
4. Nothing is posted to X without the owner's approval of the exact copy.
5. Numbers in articles are verified by search or left out.
6. Set up an external uptime monitor pinging `https://sports-db.live/api/health` every five minutes. Owner action; not done yet.

## 7. Testing

- `tests/ops-report.test.ts`: each section of `src/lib/opsReport.ts` against the throwaway Postgres, seeded with rows that trigger each finding and rows that must not.
- `tests/ops-crew.test.ts`: every file under `ops/crew/` has the required front matter, a `Never` section, a valid UTC cron, and the artifact URL placeholder; the ids match the table above.
- `tests/page-cache-lifetime.test.ts` already covers new route files.
- Each routine is run once by hand after creation and its `runs/` document checked on the page before it is left on its schedule.

## 8. Out of scope

- The animated pixel showcase.
- Agents that fix anything.
- Search Console or Bing API credentials; the browser reading replaces them.
- X follower metrics; the API is paid.
- Email or push alerts.
