// One-time historical backfill of match/score data, run manually (not part of the
// recurring 15-min cron) — this data is static (completed seasons never change), so
// it only needs to be pulled once and then lives in the DB permanently. Uses the
// per-team `schedule?season=` endpoint (a whole season in one call) for NBA/NFL/EPL.
// Cricket has no such per-team endpoint for this competition (404s, same as /teams
// and /roster), but its `scoreboard` endpoint accepts `season=` directly and returns
// the whole season in one call too — so IPL backfill is just as cheap (one request
// per season instead of per team x season).
// Safe to re-run/resume — all writes are upserts.
import { pool } from "./lib/db";
import { HISTORY_START, fetchScoreboardBySeason, fetchTeamSchedule, type League } from "./lib/espn";
import { upsertEvent } from "./lib/games";

const YEARS_BACK = 10;
const REQUEST_DELAY_MS = 120;
const CRICKET_LEAGUES: League[] = ["ipl", "bbl", "cwc", "t20wc", "wpl", "wbbl", "wcwc", "wt20wc"];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Over-cover by one extra year label on each side rather than get the NBA
// ending-year vs NFL/soccer starting-year convention exactly right — an
// out-of-range season just returns 0 events (harmless).
function seasonsToTry(): number[] {
  const currentYear = new Date().getUTCFullYear();
  const years: number[] = [];
  for (let y = currentYear - YEARS_BACK - 1; y <= currentYear; y++) years.push(y);
  return years;
}

async function backfillViaTeamSchedules(league: League) {
  const seasons = seasonsToTry();
  const seen = new Set<string>();
  const scanned = new Set<string>();
  let gameCount = 0;
  // The default (unparameterized) team-schedule call only returns the regular season
  // — postseason games (and their round names, e.g. "NBA Finals - Game 6", "Super Bowl
  // LVIII") need an explicit seasontype=3 request. Not meaningful for EPL (no playoffs
  // in the league itself) or IPL (handled separately, and its scoreboard-by-season
  // already includes its own playoff stage within the one request).
  const seasonTypes = league === "nba" || league === "nfl" ? [undefined, 3] : [undefined];

  // A competition's clubs change every season (cup entrants, promotion and relegation),
  // and only the current edition's clubs are seeded. Each game upserts both its clubs,
  // so after one pass the table also holds the opponents met along the way; those are
  // scanned in a further pass (and so on) until no unscanned club remains, which catches
  // games between two clubs that are both absent from the current edition.
  for (;;) {
  const { rows: teams } = await pool.query(`select espn_id from teams where league = $1 order by espn_id`, [league]);
  const pending = teams.map((t) => t.espn_id as string).filter((id) => !scanned.has(id));
  if (pending.length === 0) break;
  console.log(`[backfill-games] ${league}: scanning ${pending.length} teams`);
  for (const teamId of pending) {
    scanned.add(teamId);
    for (const season of seasons) {
      for (const seasontype of seasonTypes) {
        try {
          const data = await fetchTeamSchedule(league, teamId, season, seasontype);
          for (const ev of data.events ?? []) {
            if (seen.has(ev.id)) continue;
            seen.add(ev.id);
            await upsertEvent(league, ev);
            gameCount++;
          }
        } catch (err) {
          console.error(
            `[backfill-games] ${league} team ${teamId} season ${season}${seasontype ? ` (postseason)` : ""} failed:`,
            err instanceof Error ? err.message : err
          );
        }
        await sleep(REQUEST_DELAY_MS);
      }
    }
  }
  }
  console.log(`[backfill-games] ${league}: scanned ${scanned.size} teams x ${seasons.length} seasons, upserted ${gameCount} games`);
}

// Cricket: the competition id in the URL path (e.g. IPL's 8048) only resolves to the
// *current* season by default, but `scoreboard?season=YYYY` returns that whole
// season's matches in one call — so one request per year covers all of that
// competition's history, same order-of-magnitude cost as the per-team-schedule
// approach used for the others.
// ESPN's cached copy of an old season is often only partly hydrated (bare `{}` entries
// in place of matches), so each season is re-requested with a cache-busting param
// until every listed match has content. A season that never completes is still
// upserted (more facts than before) but reported, so it can be re-run rather than
// silently shown as a full season.
const MAX_SEASON_ATTEMPTS = 8;
// A World Cup year with no edition (or a season before the feed's coverage) lists no
// matches at all; a stale cache can do the same, so an empty answer is trusted only
// once it has been seen a few times.
const EMPTY_ATTEMPTS_TO_TRUST = 3;

async function fetchCompleteSeason(league: League, season: number): Promise<{ events: any[]; listed: number; complete: boolean }> {
  let best: { events: any[]; listed: number } = { events: [], listed: 0 };
  let empties = 0;
  for (let attempt = 1; attempt <= MAX_SEASON_ATTEMPTS; attempt++) {
    try {
      const data = await fetchScoreboardBySeason(league, season, { bypassCache: attempt > 1 });
      const listed: any[] = data.events ?? [];
      const populated = listed.filter((ev) => ev?.id && ev.competitions?.[0]);
      if (populated.length > best.events.length) best = { events: populated, listed: listed.length };
      if (listed.length > 0 && populated.length === listed.length) return { ...best, complete: true };
      if (listed.length === 0 && best.listed === 0 && ++empties >= EMPTY_ATTEMPTS_TO_TRUST) return { events: [], listed: 0, complete: true };
      console.warn(`[backfill-games] ${league} ${season}: ${populated.length}/${listed.length} matches populated (attempt ${attempt})`);
    } catch (err) {
      console.error(`[backfill-games] ${league} season ${season} attempt ${attempt} failed:`, err instanceof Error ? err.message : err);
    }
    await sleep(REQUEST_DELAY_MS * 10);
  }
  return { ...best, complete: false };
}

// `onlySeasons` re-runs just the seasons an earlier pass reported INCOMPLETE.
async function backfillCricketViaSeasonScoreboard(league: League, onlySeasons: number[] | null = null) {
  const currentYear = new Date().getUTCFullYear();
  const firstSeason = HISTORY_START[league] ?? currentYear - YEARS_BACK;
  const seen = new Set<string>();
  const incomplete: string[] = [];
  let gameCount = 0;

  for (let season = firstSeason; season <= currentYear; season++) {
    if (onlySeasons && !onlySeasons.includes(season)) continue;
    const { events, listed, complete } = await fetchCompleteSeason(league, season);
    if (!complete) incomplete.push(`${season} (${events.length}/${listed})`);
    for (const ev of events) {
      if (seen.has(ev.id)) continue;
      seen.add(ev.id);
      await upsertEvent(league, ev);
      gameCount++;
    }
    if (listed > 0 || !complete) console.log(`[backfill-games] ${league} ${season}: ${events.length}/${listed} matches${complete ? "" : " (INCOMPLETE)"}`);
    await sleep(REQUEST_DELAY_MS);
  }
  console.log(`[backfill-games] ${league}: scanned ${currentYear - firstSeason + 1} seasons, upserted ${gameCount} games`);
  if (incomplete.length > 0) console.error(`[backfill-games] ${league}: INCOMPLETE seasons, re-run later: ${incomplete.join(", ")}`);
}

async function main() {
  const target = process.argv[2] as League | undefined;
  const leagues: League[] = target ? [target] : ["nba", "nfl", "epl", "laliga", "bundesliga", "seriea", "ucl", "ipl", "bbl", "cwc", "t20wc", "wpl", "wbbl", "wcwc", "wt20wc"];
  // Optional comma-separated seasons (cricket only): `backfill-games cwc 1987,1992`.
  const onlySeasons = process.argv[3] ? process.argv[3].split(",").map(Number).filter(Number.isInteger) : null;

  for (const league of leagues) {
    console.log(`[backfill-games] starting ${league} (${HISTORY_START[league] ? `since ${HISTORY_START[league]}` : `last ${YEARS_BACK} years`})...`);
    if (CRICKET_LEAGUES.includes(league)) {
      await backfillCricketViaSeasonScoreboard(league, onlySeasons);
    } else {
      await backfillViaTeamSchedules(league);
    }
  }
  await pool.end();
}

main().catch((err) => {
  console.error("[backfill-games] failed:", err);
  process.exit(1);
});
