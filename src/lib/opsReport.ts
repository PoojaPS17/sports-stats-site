import type { Pool } from "pg";
import { MAX_AGE_MINUTES } from "../../scripts/lib/heartbeat";

// Read-only checks the Ops Room's Umpire and Physio read over HTTPS, because the database only
// accepts connections from the VM. Every section is aggregate: counts, ages, sizes and at most
// EXAMPLES ids so a finding can be looked up, never row bodies.
export const EXAMPLES = 5;

export type Section<T> = { ok: true; data: T } | { ok: false; error: string };

function ok<T>(data: T): Section<T> {
  return { ok: true, data };
}

async function guard<T>(fn: () => Promise<T>): Promise<Section<T>> {
  try {
    return ok(await fn());
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
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
  return guard(async () => {
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
  return guard(async () => {
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
  return guard(async () => {
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

const SECTIONS: Record<string, (pool: Pool) => Promise<Section<unknown>> | Section<unknown>> = {
  build: () => buildSection(),
  heartbeats: heartbeatsSection,
  freshness: freshnessSection,
  volume: volumeSection,
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
}

export async function opsReport(pool: Pool): Promise<OpsReport> {
  const entries = await Promise.all(
    Object.entries(SECTIONS).map(async ([name, fn]) => [name, await guard(async () => {
      const s = await fn(pool);
      if (!s.ok) throw new Error(s.error);
      return s.data;
    })] as const)
  );
  // Built dynamically from SECTIONS, so its shape cannot be checked structurally against
  // OpsReport; the cast is safe because every key in SECTIONS names a field on OpsReport.
  return {
    ...Object.fromEntries(entries),
    generatedAt: new Date().toISOString(),
  } as OpsReport;
}
