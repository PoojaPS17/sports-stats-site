// URL inventory for the XML sitemaps. Split into one sitemap per league and kind so
// each stays well under the 50,000-URL limit and robots.txt can list them all.
import type { MetadataRoute } from "next";
import { pool } from "./db";
import { ALL_LEAGUES, LEAGUES, hasNewsFeed, hasStandings, isCricketLeague, type League } from "./leagues";
import { TOURS } from "./tennisTours";
import { absoluteUrl } from "./site";
import { supportsMatchweeks, weekIndexPath, weekPath, getSeasonsWithGames, getSeasonGames, buildMatchweeks } from "./matchweeks";
import { hasWeeks, loadWeeks } from "./matchweekPage";
import { countedMeetingSql, supportsInjuryTracker, supportsScoreAnalytics } from "./analytics";
import { h2hPath } from "./h2h";
import { supportsProjections } from "./simulator";
import { playerSport } from "./playerProfile";
import { noStatLineGameSql } from "./playerLog";
import { notPseudoAthleteSql } from "./pseudoAthlete";

type Entry = MetadataRoute.Sitemap[number];

// Leagues whose players have season-by-season pages (the ones with game logs).
const SEASON_PAGE_LEAGUES = ALL_LEAGUES.filter((l) => playerSport(l) !== null);

export const SITEMAP_IDS: string[] = [
  "core",
  "f1",
  "tennis",
  ...SEASON_PAGE_LEAGUES.map((l) => `pseasons-${l}`),
  ...ALL_LEAGUES.flatMap((l) => [`teams-${l}`, `players-${l}`, `games-${l}`]),
  ...LEAGUES.filter((l) => supportsMatchweeks(l)).map((l) => `weeks-${l}`),
  ...ALL_LEAGUES.filter((l) => supportsScoreAnalytics(l)).map((l) => `h2h-${l}`),
];

const entry = (path: string, changeFrequency: Entry["changeFrequency"], priority: number, lastModified?: string | Date | null): Entry => ({
  url: absoluteUrl(path),
  changeFrequency,
  priority,
  lastModified: lastModified ? new Date(lastModified) : undefined,
});

async function core(): Promise<Entry[]> {
  const out: Entry[] = [
    entry("/", "hourly", 1),
    entry("/top-games", "daily", 0.5),
    entry("/f1", "daily", 0.7),
    entry("/f1/standings", "daily", 0.6),
    entry("/contact", "yearly", 0.2),
    entry("/privacy", "yearly", 0.2),
    entry("/terms", "yearly", 0.2),
  ];
  out.push(entry("/tennis", "hourly", 0.8), entry("/tennis/tournaments", "daily", 0.7), entry("/cricket/series", "hourly", 0.8));
  // Every series with at least one match on record; a finished one no longer changes.
  const { rows: cricketSeries } = await pool.query(
    `select s.espn_id, s.end_date, (s.end_date >= now() - interval '30 days') as recent from cricket_series s
     where exists (select 1 from cricket_series_matches m where m.series_espn_id = s.espn_id)
     order by s.start_date desc`
  );
  for (const { espn_id, end_date, recent } of cricketSeries) out.push(entry(`/cricket/series/${espn_id}`, recent ? "daily" : "yearly", recent ? 0.5 : 0.3, end_date));
  // Matches outside the archived competitions live at /cricket/matches; the archived
  // ones are in their league's games sitemap.
  const { rows: seriesMatches } = await pool.query(
    `select m.espn_id, m.date from cricket_series_matches m
     where m.date >= now() - interval '45 days' and m.date <= now() + interval '14 days'
       and not exists (select 1 from games g where g.espn_id = m.espn_id and g.league = any(m.league_candidates))
     order by m.date desc`
  );
  for (const { espn_id, date } of seriesMatches) out.push(entry(`/cricket/matches/${espn_id}`, "hourly", 0.4, date));
  for (const t of TOURS) out.push(entry(`/tennis/${t}`, "daily", 0.7), entry(`/tennis/${t}/rankings`, "weekly", 0.6));
  const { rows: tournaments } = await pool.query(`select espn_id, season, end_date from tennis_tournaments order by season desc, start_date`);
  for (const { espn_id, end_date } of tournaments) out.push(entry(`/tennis/tournaments/${espn_id}`, "weekly", 0.5, end_date));
  const { rows: tennisSeasons } = await pool.query(`select distinct season from tennis_tournaments order by season desc`);
  for (const { season } of tennisSeasons.slice(1)) out.push(entry(`/tennis/tournaments/${season}`, "yearly", 0.4));
  const { rows: tennisDays } = await pool.query(`select distinct to_char(day, 'YYYY-MM-DD') as day from tennis_matches where day >= current_date - 60 order by 1 desc`);
  for (const { day } of tennisDays) out.push(entry(`/tennis/scores/${day}`, "daily", 0.5));
  for (const league of ALL_LEAGUES) {
    out.push(entry(`/${league}`, "hourly", 0.9), entry(`/${league}/teams`, "weekly", 0.7), entry(`/${league}/leaders`, "daily", 0.7));
    if (hasStandings(league)) out.push(entry(`/${league}/standings`, "daily", 0.9));
    if (hasNewsFeed(league)) out.push(entry(`/${league}/news`, "hourly", 0.5));
    if (supportsScoreAnalytics(league)) {
      out.push(entry(`/${league}/power-rankings`, "daily", 0.7), entry(`/${league}/records`, "weekly", 0.6), entry(`/${league}/compare`, "monthly", 0.4));
      for (const scope of ["home", "away", "form"]) out.push(entry(`/${league}/standings/${scope}`, "daily", 0.6));
    }
    if (isCricketLeague(league)) out.push(entry(`/${league}/centuries`, "weekly", 0.6));
    if (supportsInjuryTracker(league)) out.push(entry(`/${league}/injuries`, "daily", 0.6));
    // The hub answers 200 noindex when the league has no rounds yet (no games, or only preseason ones), so it is listed only when it has rounds to show.
    if (supportsMatchweeks(league) && hasWeeks(await loadWeeks(league))) out.push(entry(weekIndexPath(league), "daily", 0.7));
    if (supportsProjections(league)) out.push(entry(`/${league}/projections`, "daily", 0.8));
    const { rows: seasons } = await pool.query(`select distinct season from standings where league = $1 order by season desc`, [league]);
    for (const { season } of seasons) out.push(entry(`/${league}/standings/${season}`, "yearly", 0.4));
  }
  return out;
}

async function teams(league: League): Promise<Entry[]> {
  const { rows } = await pool.query(`select slug from teams where league = $1 order by slug`, [league]);
  const out: Entry[] = [];
  for (const { slug } of rows) {
    out.push(entry(`/${league}/teams/${slug}`, "daily", 0.8), entry(`/${league}/teams/${slug}/about`, "monthly", 0.3));
    if (supportsScoreAnalytics(league)) out.push(entry(`/${league}/teams/${slug}/history`, "monthly", 0.5));
  }
  // One results page per team per season played.
  const { rows: seasons } = await pool.query(
    `select distinct t.slug, g.season_year from games g
     join teams t on t.league = g.league and t.espn_id in (g.home_team_espn_id, g.away_team_espn_id)
     where g.league = $1 and g.season_year is not null
     order by t.slug, g.season_year desc`,
    [league]
  );
  for (const { slug, season_year } of seasons) out.push(entry(`/${league}/teams/${slug}/${season_year}`, "yearly", 0.3));
  return out;
}

// SQL twin of each sport's `played` test in playerProfile.ts: a row for an unused
// substitute is not an appearance, and a page with none renders noindex, so such
// players and seasons stay out of the sitemap. NBA: a minutes cell that is a number
// (including "0", a sub-minute appearance ESPN counts in GP) or any points; "--", ""
// or no MIN is a bench-sheet DNP. A row in a game where nobody has a stat line (ESPN published no
// box score) counts too: the page lists the game and says so, so it has content to index.
const statNumber = (category: string, label: string) => `coalesce(nullif(substring(s.stats->'${category}'->>'${label}' from '^[0-9]+'), '')::int, 0)`;
function playedSql(league: League): string {
  const sport = playerSport(league);
  if (sport === "soccer") return `${statNumber("match", "APP")} = 1`;
  if (sport === "nba") return `(coalesce(s.stats->'box'->>'MIN' ~ '^[0-9]+([.][0-9]+)?$', false) or ${statNumber("box", "PTS")} > 0 or ${noStatLineGameSql("s")})`;
  return "true";
}

// A player's page for each season they played a game in.
async function playerSeasons(league: League): Promise<Entry[]> {
  const { rows } = await pool.query(
    `select distinct p.slug, g.season_year from player_game_stats s
     join games g on g.league = s.league and g.espn_id = s.game_espn_id
     join players p on p.league = s.league and p.espn_id = s.player_espn_id
     where s.league = $1 and g.season_year is not null and g.completed and ${notPseudoAthleteSql()} and ${playedSql(league)}
     order by p.slug, g.season_year desc`,
    [league]
  );
  return rows.map(({ slug, season_year }) => entry(`/${league}/players/${slug}/${season_year}`, "yearly", 0.3));
}

// Race weekends, plus every constructor and every driver with a race result on record
// (a driver page with practice sessions only renders noindex).
async function f1(): Promise<Entry[]> {
  const out: Entry[] = [];
  const { rows: events } = await pool.query(`select espn_id, date, (date >= now() - interval '14 days') as recent from f1_events order by date desc`);
  for (const e of events) out.push(entry(`/f1/events/${e.espn_id}`, e.recent ? "daily" : "yearly", e.recent ? 0.6 : 0.4, e.recent ? null : e.date));
  const { rows: drivers } = await pool.query(
    `select p.slug from players p where p.league = 'f1'
       and exists (select 1 from f1_session_results r join f1_sessions s on s.espn_id = r.session_espn_id
                   where r.driver_espn_id = p.espn_id and s.session_type = 'Race')
     order by p.slug`
  );
  for (const { slug } of drivers) out.push(entry(`/f1/drivers/${slug}`, "weekly", 0.5));
  const { rows: constructors } = await pool.query(`select slug from teams where league = 'f1' order by slug`);
  for (const { slug } of constructors) out.push(entry(`/f1/teams/${slug}`, "weekly", 0.5));
  return out;
}

// Tennis players who have played a match on record.
async function tennisPlayers(): Promise<Entry[]> {
  const { rows } = await pool.query(
    `with played as (
       select tour, player1_espn_id as espn_id from tennis_matches
       union
       select tour, player2_espn_id from tennis_matches
     )
     select p.league as tour, p.slug from players p
     join played x on x.tour = p.league and x.espn_id = p.espn_id
     order by p.league, p.slug`
  );
  return rows.map(({ tour, slug }) => entry(`/tennis/${tour}/players/${slug}`, "weekly", 0.5));
}

// Only players with something on the page: a game on record or a season stat line.
// Roster-only players (no figures yet) render with noindex, so they stay out here too.
async function players(league: League): Promise<Entry[]> {
  const { rows } = await pool.query(
    `select p.slug from players p
     where p.league = $1 and ${notPseudoAthleteSql()}
       and (exists (select 1 from player_game_stats s join games g on g.league = s.league and g.espn_id = s.game_espn_id
                    where s.league = p.league and s.player_espn_id = p.espn_id and g.completed and ${playedSql(league)})
            or exists (select 1 from player_season_stats s where s.league = p.league and s.player_espn_id = p.espn_id))
     order by p.slug`,
    [league]
  );
  return rows.map(({ slug }) => entry(`/${league}/players/${slug}`, "weekly", 0.5));
}

// Match pages for the two most recent seasons; older ones remain reachable through
// team and matchweek pages without bloating the sitemap.
async function games(league: League): Promise<Entry[]> {
  const { rows } = await pool.query(
    `select espn_id, updated_at, completed from games
     where league = $1 and season_year >= (select max(season_year) from games where league = $1) - 1
     order by date desc`,
    [league]
  );
  return rows.map((g) => entry(`/${league}/games/${g.espn_id}`, g.completed ? "monthly" : "hourly", g.completed ? 0.4 : 0.6, g.updated_at));
}

async function weeks(league: League): Promise<Entry[]> {
  const seasons = await getSeasonsWithGames(league);
  const out: Entry[] = [];
  for (const [i, season] of seasons.entries()) {
    const ws = buildMatchweeks(league, await getSeasonGames(league, season));
    const current = i === 0;
    // A past season's index answers 200 noindex without rounds, so it is listed only when it has rounds to show.
    if (!current && ws.length > 0) out.push(entry(weekIndexPath(league, season), "yearly", 0.3));
    for (const w of ws) out.push(entry(weekPath(league, w.index, current ? null : season), current ? "daily" : "yearly", current ? 0.6 : 0.3));
  }
  return out;
}

// Head-to-head pages for the pairings of clubs in the current standings that have met. A page with no counted
// meeting renders noindex (its `meetings` is 0), so it is listed only if countedMeetingSql (the twin of the
// page's rule, in analytics.ts: a completed game with both scores, not an excluded stage, either home/away order,
// the same league) finds one.
async function h2h(league: League): Promise<Entry[]> {
  const { rows: current } = await pool.query(
    `select distinct t.slug from standings s join teams t on t.league = s.league and t.espn_id = s.team_espn_id
     where s.league = $1 and s.season = (select max(season) from standings where league = $1)`,
    [league]
  );
  const inStandings = new Set(current.map((r) => r.slug as string));
  const { rows: met } = await pool.query(
    `select distinct ht.slug as home_slug, at.slug as away_slug
     from games g
     join teams ht on ht.league = g.league and ht.espn_id = g.home_team_espn_id
     join teams at on at.league = g.league and at.espn_id = g.away_team_espn_id
     where g.league = $1 and ht.espn_id <> at.espn_id and ${countedMeetingSql("g")}`,
    [league]
  );
  // h2hPath puts a pair in its one canonical (alphabetical) order, so both home/away orders collapse to one URL.
  const paths = new Set<string>();
  for (const { home_slug, away_slug } of met) if (inStandings.has(home_slug) && inStandings.has(away_slug)) paths.add(h2hPath(league, home_slug, away_slug));
  return [...paths].sort().map((path) => entry(path, "weekly", 0.4));
}

export async function sitemapEntries(id: string): Promise<Entry[]> {
  if (id === "core") return core();
  if (id === "f1") return f1();
  if (id === "tennis") return tennisPlayers();
  const [kind, league] = id.split("-") as [string, League];
  if (!ALL_LEAGUES.includes(league)) return [];
  if (kind === "teams") return teams(league);
  if (kind === "players") return players(league);
  if (kind === "pseasons") return playerSport(league) ? playerSeasons(league) : [];
  if (kind === "games") return games(league);
  if (kind === "weeks") return supportsMatchweeks(league) ? weeks(league) : [];
  if (kind === "h2h") return supportsScoreAnalytics(league) ? h2h(league) : [];
  return [];
}
