// URL inventory for the XML sitemaps. Split into one sitemap per league and kind so
// each stays well under the 50,000-URL limit and robots.txt can list them all.
import type { MetadataRoute } from "next";
import { pool } from "./db";
import { ALL_LEAGUES, LEAGUES, hasNewsFeed, hasStandings, isCricketLeague, type League } from "./leagues";
import { TOURS } from "./tennisTours";
import { absoluteUrl } from "./site";
import { supportsMatchweeks, weekIndexPath, weekPath, getSeasonsWithGames, getSeasonGames, buildMatchweeks } from "./matchweeks";
import { supportsInjuryTracker, supportsScoreAnalytics } from "./analytics";
import { h2hPath } from "./h2h";
import { supportsProjections } from "./simulator";

type Entry = MetadataRoute.Sitemap[number];

export const SITEMAP_IDS: string[] = [
  "core",
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
    entry("/privacy", "yearly", 0.2),
    entry("/terms", "yearly", 0.2),
  ];
  out.push(entry("/tennis", "hourly", 0.8), entry("/tennis/tournaments", "daily", 0.7), entry("/cricket/series", "hourly", 0.8));
  const { rows: cricketSeries } = await pool.query(`select espn_id, end_date from cricket_series where end_date >= now() - interval '400 days' order by start_date desc`);
  for (const { espn_id, end_date } of cricketSeries) out.push(entry(`/cricket/series/${espn_id}`, "daily", 0.5, end_date));
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
    if (supportsMatchweeks(league)) out.push(entry(weekIndexPath(league), "daily", 0.7));
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
  return out;
}

// Only players with something on the page: a game on record or a season stat line.
// Roster-only players (no figures yet) render with noindex, so they stay out here too.
async function players(league: League): Promise<Entry[]> {
  const { rows } = await pool.query(
    `select p.slug from players p
     where p.league = $1
       and (exists (select 1 from player_game_stats s where s.league = p.league and s.player_espn_id = p.espn_id)
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
    if (!current) out.push(entry(weekIndexPath(league, season), "yearly", 0.3));
    for (const w of ws) out.push(entry(weekPath(league, w.index, current ? null : season), current ? "daily" : "yearly", current ? 0.6 : 0.3));
  }
  return out;
}

// Head-to-head pages for every pairing of clubs in the current standings.
async function h2h(league: League): Promise<Entry[]> {
  const { rows } = await pool.query(
    `select t.slug from standings s join teams t on t.league = s.league and t.espn_id = s.team_espn_id
     where s.league = $1 and s.season = (select max(season) from standings where league = $1) order by t.slug`,
    [league]
  );
  const slugs = rows.map((r) => r.slug as string);
  const out: Entry[] = [];
  for (let i = 0; i < slugs.length; i++) for (let j = i + 1; j < slugs.length; j++) out.push(entry(h2hPath(league, slugs[i], slugs[j]), "weekly", 0.4));
  return out;
}

export async function sitemapEntries(id: string): Promise<Entry[]> {
  if (id === "core") return core();
  const [kind, league] = id.split("-") as [string, League];
  if (!ALL_LEAGUES.includes(league)) return [];
  if (kind === "teams") return teams(league);
  if (kind === "players") return players(league);
  if (kind === "games") return games(league);
  if (kind === "weeks") return supportsMatchweeks(league) ? weeks(league) : [];
  if (kind === "h2h") return supportsScoreAnalytics(league) ? h2h(league) : [];
  return [];
}
