import type { Pool } from "pg";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { MAX_AGE_MINUTES } from "../../scripts/lib/heartbeat";

// Read-only checks the Ops Room's Umpire and Physio read over HTTPS, because the database only
// accepts connections from the VM. Every section is aggregate: counts, ages, sizes and at most
// EXAMPLES ids so a finding can be looked up, never row bodies.
export const EXAMPLES = 5;

export type Section<T> = { ok: true; data: T } | { ok: false; error: string };

function ok<T>(data: T): Section<T> {
  return { ok: true, data };
}

/** No section may hold a pool client longer than this. */
export const SECTION_TIMEOUT_MS = 20_000;

export class SectionTimeout extends Error {
  constructor(ms: number) {
    super(`section exceeded ${ms} ms`);
    this.name = "SectionTimeout";
  }
}

// `set local statement_timeout` needs a transaction, which the shared pool helper does not open,
// and pg's query config ({ text, values, ... }) has no per-query timeout, so the cap is a race
// against a timer instead: the section resolves as failed at 20 s while the query itself is left
// to finish and be thrown away. That bounds how long the report holds pool clients, which is what
// the cap is for; it does not cancel the query on the server.
export function withSectionTimeout<T>(work: Promise<T>, ms: number = SECTION_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const alarm = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new SectionTimeout(ms)), ms);
    const handle = timer as unknown as { unref?: () => void };
    if (typeof handle.unref === "function") handle.unref();
  });
  return Promise.race([work, alarm]).finally(() => clearTimeout(timer)) as Promise<T>;
}

// The endpoint is public, so the driver's own sentence never leaves the server: a pg message names
// the database user, the internal host and port, or a column that does not exist. The Umpire only
// needs to know which section broke, so it gets the error's code, or "timeout", or nothing at all.
function sectionError(err: unknown): string {
  if (err instanceof SectionTimeout) return "timeout";
  const code = (err as { code?: unknown } | null | undefined)?.code;
  return typeof code === "string" && code.length > 0 ? code : "section failed";
}

async function guard<T>(name: string, fn: () => Promise<T>): Promise<Section<T>> {
  try {
    return ok(await withSectionTimeout(fn()));
  } catch (err) {
    console.warn(`[opsReport] ${name} failed: ${err instanceof Error ? err.message : String(err)}`);
    return { ok: false, error: sectionError(err) };
  }
}

export function buildSection(): Section<{ commit: string; builtAt: string }> {
  return ok({
    commit: process.env.NEXT_PUBLIC_BUILD_COMMIT ?? "unknown",
    builtAt: process.env.NEXT_PUBLIC_BUILD_TIME ?? "unknown",
  });
}

export interface Heartbeat {
  scraper: string;
  /** Minutes since the last success; null when the scraper has never recorded a run. */
  ageMinutes: number | null;
  /** The limit from MAX_AGE_MINUTES, or null for a scraper that records runs but has no limit. */
  limitMinutes: number | null;
  stale: boolean;
}

export function heartbeatsSection(pool: Pool): Promise<Section<Heartbeat[]>> {
  return guard("heartbeats", async () => {
    const { rows } = await pool.query<{ scraper: string; age: string }>(
      `select scraper, extract(epoch from (now() - last_ok_at)) / 60 as age from scrape_runs`
    );
    const ages = new Map(rows.map((r) => [r.scraper, Math.round(Number(r.age))]));
    const names = new Set([...ages.keys(), ...Object.keys(MAX_AGE_MINUTES)]);
    return [...names].sort().map((scraper) => {
      const ageMinutes = ages.get(scraper) ?? null;
      const limitMinutes = MAX_AGE_MINUTES[scraper] ?? null;
      const stale = limitMinutes !== null && (ageMinutes === null || ageMinutes > limitMinutes);
      return { scraper, ageMinutes, limitMinutes, stale };
    });
  });
}

// Every table that stamps updated_at / fetched_at / viewed_at, discovered from the catalog so a new
// table joins the report without an edit here.
async function stampedTables(pool: Pool): Promise<{ table: string; column: string }[]> {
  const { rows } = await pool.query<{ table_name: string; column_name: string }>(
    `select table_name, column_name from information_schema.columns
     where table_schema = 'public' and column_name in ('updated_at', 'fetched_at', 'viewed_at')
     order by table_name`
  );
  return rows.map((r) => ({ table: r.table_name, column: r.column_name }));
}

export function freshnessSection(pool: Pool) {
  return guard("freshness", async () => {
    const tables = [];
    for (const { table, column } of await stampedTables(pool)) {
      const { rows } = await pool.query<{ newest: Date | null }>(`select max(${column}) as newest from ${table}`);
      const newest = rows[0]?.newest ?? null;
      tables.push({ table, column, newest: newest ? newest.toISOString() : null, ageHours: newest ? Math.round(((Date.now() - newest.getTime()) / 3_600_000) * 10) / 10 : null });
    }
    const { rows: leagues } = await pool.query<{ league: string; newest_completed: Date | null; newest_scheduled: Date | null; completed_7d: string }>(
      `select league,
              max(date) filter (where completed) as newest_completed,
              max(date) filter (where not completed) as newest_scheduled,
              count(*) filter (where completed and date > now() - interval '7 days') as completed_7d
       from games group by league order by league`
    );
    return {
      tables,
      leagues: leagues.map((l) => ({
        league: l.league,
        newestCompleted: l.newest_completed ? l.newest_completed.toISOString() : null,
        newestScheduled: l.newest_scheduled ? l.newest_scheduled.toISOString() : null,
        completedLast7Days: Number(l.completed_7d),
      })),
    };
  });
}

export function volumeSection(pool: Pool) {
  return guard("volume", async () => {
    const out = [];
    for (const { table, column } of await stampedTables(pool)) {
      const { rows } = await pool.query<{ last24h: string; prev7d: string }>(
        `select count(*) filter (where ${column} > now() - interval '24 hours') as last24h,
                count(*) filter (where ${column} <= now() - interval '24 hours' and ${column} > now() - interval '8 days') as prev7d
         from ${table}`
      );
      const last24h = Number(rows[0].last24h);
      const dailyMean7d = Math.round((Number(rows[0].prev7d) / 7) * 10) / 10;
      out.push({ table, column, last24h, dailyMean7d, ratio: dailyMean7d > 0 ? Math.round((last24h / dailyMean7d) * 100) / 100 : null });
    }
    return out;
  });
}

// The schema blocks exact duplicates by id, so these look for the semantic kind: the same real thing
// stored under two ids, which is what a second scrape path or a hand-made player row produces.
export function duplicatesSection(pool: Pool) {
  return guard("duplicates", async () => {
    async function group(sql: string, label: (r: Record<string, string>) => string) {
      const { rows } = await pool.query<Record<string, string>>(sql);
      return { count: rows.length, examples: rows.slice(0, EXAMPLES).map(label) };
    }
    const games = await group(
      `select league, (date at time zone 'utc')::date::text as day, home_team_espn_id as h, away_team_espn_id as a, string_agg(espn_id, ', ' order by espn_id) as ids
       from games group by 1, 2, 3, 4 having count(*) > 1`,
      (r) => `${r.league} ${r.day} ${r.h} v ${r.a}: ${r.ids}`
    );
    const players = await group(
      `select league, team_espn_id as team, lower(name) as name, string_agg(espn_id, ', ' order by espn_id) as ids
       from players where team_espn_id is not null and espn_id not like '-%'
       group by 1, 2, 3 having count(*) > 1`,
      (r) => `${r.league} ${r.name} (team ${r.team}): ${r.ids}`
    );
    const tennisMatches = await group(
      `select tour, coalesce(tournament_espn_id, tournament_name) as t, coalesce(round, '') as round,
              least(player1_espn_id, player2_espn_id) as p1, greatest(player1_espn_id, player2_espn_id) as p2,
              string_agg(espn_id, ', ' order by espn_id) as ids
       from tennis_matches group by 1, 2, 3, 4, 5 having count(*) > 1`,
      (r) => `${r.tour} ${r.t} ${r.round} ${r.p1} v ${r.p2}: ${r.ids}`
    );
    const cricketScoreMismatch = await group(
      `select m.espn_id as id, g.league, coalesce(g.home_score_display, g.home_score::text, '') as gh, m.home->>'score' as mh,
              coalesce(g.away_score_display, g.away_score::text, '') as ga, m.away->>'score' as ma
       from cricket_series_matches m join games g on g.espn_id = m.espn_id and g.league = any(m.league_candidates)
       where g.completed and m.status_state = 'post' is not false
         and (split_part(coalesce(g.home_score_display, g.home_score::text, ''), ' ', 1) <> split_part(coalesce(m.home->>'score', ''), ' ', 1)
           or split_part(coalesce(g.away_score_display, g.away_score::text, ''), ' ', 1) <> split_part(coalesce(m.away->>'score', ''), ' ', 1))`,
      (r) => `${r.league} ${r.id}: games ${r.gh}/${r.ga} vs series ${r.mh}/${r.ma}`
    );
    const newsArticles = await group(
      `select league, link, string_agg(article_id, ', ' order by article_id) as ids
       from news_articles where link is not null group by 1, 2 having count(*) > 1`,
      (r) => `${r.league} ${r.link}: ${r.ids}`
    );
    return { games, players, tennisMatches, cricketScoreMismatch, newsArticles };
  });
}

type Finding = { count: number; examples: string[] };

// Leagues ESPN never provides a box score for, so "completed with no player_game_stats" is normal there.
const NO_BOX_SCORE_LEAGUES = ["ucl"];

export function scrapingSection(pool: Pool) {
  return guard("scraping", async () => {
    const { rows } = await pool.query<{ league: string; espn_id: string }>(
      `select league, espn_id from games
       where completed and date < now() - interval '48 hours' and updated_at > now() - interval '24 hours'
       order by updated_at desc`
    );
    const { rows: tick } = await pool.query<{ age: string | null }>(
      `select extract(epoch from (now() - last_ok_at)) / 60 as age from scrape_runs where scraper = 'scrape-tick'`
    );
    const { rows: totals } = await pool.query<{ n: string }>(
      `select count(*) as n from player_season_stats where updated_at > now() - interval '24 hours'`
    );
    return {
      refetchedFinished: { count: rows.length, examples: rows.slice(0, EXAMPLES).map((r) => `${r.league} ${r.espn_id}`) },
      tickAgeMinutes: tick[0]?.age === null || tick[0]?.age === undefined ? null : Math.round(Number(tick[0].age)),
      seasonTotalsRewrittenToday: Number(totals[0].n),
    };
  });
}

export function integritySection(pool: Pool) {
  return guard("integrity", async () => {
    async function finding(sql: string, label: (r: Record<string, string>) => string, params: unknown[] = []) {
      const { rows } = await pool.query<Record<string, string>>(sql, params);
      return { count: rows.length, examples: rows.slice(0, EXAMPLES).map(label) };
    }
    const g = (r: Record<string, string>) => `${r.league} ${r.espn_id}`;
    const completedNoScore = await finding(
      `select league, espn_id from games where completed and (home_score is null or away_score is null) and home_score_display is null order by date desc`, g);
    const { rows: noBox } = await pool.query<{ league: string; n: string; ids: string }>(
      `select g.league, count(*) as n, string_agg(g.espn_id, ', ' order by g.date desc) filter (where true) as ids
       from games g left join player_game_stats s on s.league = g.league and s.game_espn_id = g.espn_id
       where g.completed and g.date < now() - interval '48 hours' and g.date > now() - interval '30 days'
         and s.game_espn_id is null and g.league <> all($1::text[])
       group by g.league order by g.league`, [NO_BOX_SCORE_LEAGUES]);
    const completedNoBoxScore = noBox.map((r) => ({ league: r.league, count: Number(r.n), examples: r.ids.split(", ").slice(0, EXAMPLES) }));
    // Any game more than 400 days in the future, or dated before 2000 (the null-date class of bug);
    // not `* 30` on the far side, which would wrongly flag every historical season the site covers.
    const gamesFarFromToday = await finding(
      `select league, espn_id from games where date > now() + interval '400 days' or date < '2000-01-01' order by date`, g);
    const orphanGameStats = await finding(
      `select s.league, s.game_espn_id as espn_id from player_game_stats s left join games g on g.league = s.league and g.espn_id = s.game_espn_id
       where g.espn_id is null group by 1, 2`, g);
    const orphanSeasonStats = await finding(
      `select s.league, s.player_espn_id as espn_id from player_season_stats s left join players p on p.league = s.league and p.espn_id = s.player_espn_id
       where p.espn_id is null`, g);
    // For the four football leagues: wins + losses + draws may not exceed a 38-match season, and a row
    // with points set must have points equal to 3 * wins + draws.
    const standingsSumMismatch = await finding(
      `select league, team_espn_id as espn_id from standings
       where league in ('epl','laliga','bundesliga','seriea') and wins is not null and losses is not null
         and ((wins + losses + coalesce(draws, 0)) > 38 or (points is not null and points <> 3 * wins + coalesce(draws, 0)))`, g);
    // Only a league that has actually played in the window counts as in season: a pre-season fixture
    // list satisfies "a game dated in the last 30 days" on its own, and would report every team in a
    // league whose season has not started.
    const teamsIdleThisSeason = await finding(
      `select t.league, t.espn_id from teams t
       where t.league in (select league from games where completed and date > now() - interval '30 days')
         and not exists (select 1 from games g where g.league = t.league and (g.home_team_espn_id = t.espn_id or g.away_team_espn_id = t.espn_id) and g.date > now() - interval '60 days')`, g);
    const f1SessionsNoResult = await finding(
      `select 'f1' as league, s.espn_id from f1_sessions s left join f1_session_results r on r.session_espn_id = s.espn_id
       where s.date < now() - interval '1 day' and s.session_type in ('Race','Qual','Sprint') group by s.espn_id having count(r.driver_espn_id) = 0`, g);
    return { completedNoScore, completedNoBoxScore, gamesFarFromToday, orphanGameStats, orphanSeasonStats, standingsSumMismatch, teamsIdleThisSeason, f1SessionsNoResult };
  });
}

export const BACKUP_DIR = "/var/backups/sportsdb";

// Backups are a nightly pg_dump on the VM (docs/superpowers/specs/2026-09-20-coverage-and-backup-design.md).
// "present: false" is itself a finding: the Umpire reports that no backup exists.
export function backupSection(dir: string = BACKUP_DIR) {
  try {
    if (!existsSync(dir)) return ok({ present: false, newest: null, previousBytes: null });
    const dumps = readdirSync(dir)
      .filter((f) => f.endsWith(".dump"))
      .map((name) => { const st = statSync(join(dir, name)); return { name, bytes: st.size, mtime: st.mtimeMs }; })
      .sort((a, b) => b.mtime - a.mtime);
    if (dumps.length === 0) return ok({ present: false, newest: null, previousBytes: null });
    const [newest, previous] = dumps;
    return ok({
      present: true,
      newest: { name: newest.name, ageHours: Math.round(((Date.now() - newest.mtime) / 3_600_000) * 10) / 10, bytes: newest.bytes },
      previousBytes: previous ? previous.bytes : null,
    });
  } catch (err) {
    console.warn(`[opsReport] backup failed: ${err instanceof Error ? err.message : String(err)}`);
    return { ok: false as const, error: sectionError(err) };
  }
}

export function dbHealthSection(pool: Pool) {
  return guard("dbHealth", async () => {
    const { rows: size } = await pool.query<{ bytes: string }>(`select pg_database_size(current_database()) as bytes`);
    const { rows: tables } = await pool.query<{ table: string; bytes: string }>(
      `select relname as table, pg_total_relation_size(c.oid) as bytes from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' order by 2 desc limit 5`);
    const { rows: dead } = await pool.query<{ table: string; live: string; dead: string }>(
      `select relname as table, n_live_tup as live, n_dead_tup as dead from pg_stat_user_tables where n_live_tup + n_dead_tup > 1000 order by n_dead_tup desc limit 10`);
    const { rows: conn } = await pool.query<{ used: string; max: string }>(
      `select (select count(*) from pg_stat_activity) as used, current_setting('max_connections')::int as max`);
    return {
      sizeBytes: Number(size[0].bytes),
      largestTables: tables.map((t) => ({ table: t.table, bytes: Number(t.bytes) })),
      deadRowRatio: dead.map((d) => ({ table: d.table, live: Number(d.live), dead: Number(d.dead), ratio: Math.round((Number(d.dead) / Math.max(1, Number(d.live) + Number(d.dead))) * 1000) / 1000 })),
      connections: { used: Number(conn[0].used), max: Number(conn[0].max) },
    };
  });
}

export function viewsSection(pool: Pool) {
  return guard("views", async () => {
    async function day(offset: 0 | 1) {
      const range = `viewed_at >= (date_trunc('day', now() at time zone 'utc') - ($1 || ' days')::interval) at time zone 'utc'
                 and viewed_at < (date_trunc('day', now() at time zone 'utc') - ($1 || ' days')::interval + interval '1 day') at time zone 'utc'`;
      const { rows: date } = await pool.query<{ d: string }>(`select ((date_trunc('day', now() at time zone 'utc') - ($1 || ' days')::interval)::date)::text as d`, [offset]);
      const { rows: total } = await pool.query<{ n: string }>(`select count(*) as n from game_views where ${range}`, [offset]);
      const { rows: top } = await pool.query<{ league: string; id: string; name: string | null; n: string }>(
        `select v.league, v.game_espn_id as id, g.short_name as name, count(*) as n from game_views v
         left join games g on g.league = v.league and g.espn_id = v.game_espn_id
         where ${range} group by 1, 2, 3 order by 4 desc limit 5`, [offset]);
      const { rows: country } = await pool.query<{ k: string | null; n: string }>(`select country as k, count(*) as n from game_views where ${range} group by 1`, [offset]);
      const { rows: platform } = await pool.query<{ k: string | null; n: string }>(`select platform as k, count(*) as n from game_views where ${range} group by 1`, [offset]);
      const tally = (rows: { k: string | null; n: string }[]) => Object.fromEntries(rows.map((r) => [r.k ?? "unknown", Number(r.n)]));
      return { date: date[0].d, total: Number(total[0].n), topGames: top.map((t) => ({ league: t.league, id: t.id, name: t.name, views: Number(t.n) })), byCountry: tally(country), byPlatform: tally(platform) };
    }
    return { yesterday: await day(1), today: await day(0) };
  });
}

const SECTIONS: Record<string, (pool: Pool) => Promise<Section<unknown>> | Section<unknown>> = {
  build: () => buildSection(),
  heartbeats: heartbeatsSection,
  freshness: freshnessSection,
  volume: volumeSection,
  duplicates: duplicatesSection,
  scraping: scrapingSection,
  integrity: integritySection,
  backup: () => backupSection(),
  dbHealth: dbHealthSection,
  views: viewsSection,
};

// A named interface, not `Record<string, Section<unknown>> & { generatedAt: string }`: that
// intersection makes every string key (including generatedAt) satisfy the Section index
// signature, which a plain string never can. Each later task adds its own field here alongside
// its entry in SECTIONS.
export interface OpsReport {
  generatedAt: string;
  build: Section<{ commit: string; builtAt: string }>;
  heartbeats: Section<Heartbeat[]>;
  freshness: Section<{
    tables: { table: string; column: string; newest: string | null; ageHours: number | null }[];
    leagues: { league: string; newestCompleted: string | null; newestScheduled: string | null; completedLast7Days: number }[];
  }>;
  volume: Section<{ table: string; column: string; last24h: number; dailyMean7d: number; ratio: number | null }[]>;
  duplicates: Section<
    Record<"games" | "players" | "tennisMatches" | "cricketScoreMismatch" | "newsArticles", { count: number; examples: string[] }>
  >;
  scraping: Section<{ refetchedFinished: { count: number; examples: string[] }; tickAgeMinutes: number | null; seasonTotalsRewrittenToday: number }>;
  integrity: Section<{
    completedNoScore: Finding;
    completedNoBoxScore: (Finding & { league: string })[];
    gamesFarFromToday: Finding;
    orphanGameStats: Finding;
    orphanSeasonStats: Finding;
    standingsSumMismatch: Finding;
    teamsIdleThisSeason: Finding;
    f1SessionsNoResult: Finding;
  }>;
  backup: Section<{ present: boolean; newest: { name: string; ageHours: number; bytes: number } | null; previousBytes: number | null }>;
  dbHealth: Section<{
    sizeBytes: number;
    largestTables: { table: string; bytes: number }[];
    deadRowRatio: { table: string; live: number; dead: number; ratio: number }[];
    connections: { used: number; max: number };
  }>;
  views: Section<{ yesterday: DayViews; today: DayViews }>;
}

type DayViews = {
  date: string;
  total: number;
  topGames: { league: string; id: string; name: string | null; views: number }[];
  byCountry: Record<string, number>;
  byPlatform: Record<string, number>;
};

export async function opsReport(pool: Pool): Promise<OpsReport> {
  const entries = await Promise.all(
    Object.entries(SECTIONS).map(async ([name, fn]) => {
      // Each section guards itself, and its own guard is what turns an error into a code; this
      // catch is for a section function that throws before its guard runs, so one bad section
      // still cannot fail the whole report.
      let section: Section<unknown>;
      try {
        section = await fn(pool);
      } catch (err) {
        console.warn(`[opsReport] ${name} failed: ${err instanceof Error ? err.message : String(err)}`);
        section = { ok: false, error: sectionError(err) };
      }
      return [name, section] as const;
    })
  );
  // Built dynamically from SECTIONS, so its shape cannot be checked structurally against
  // OpsReport; the cast is safe because every key in SECTIONS names a field on OpsReport.
  return {
    ...Object.fromEntries(entries),
    generatedAt: new Date().toISOString(),
  } as OpsReport;
}
