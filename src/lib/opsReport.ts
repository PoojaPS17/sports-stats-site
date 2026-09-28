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

const SECTIONS: Record<string, (pool: Pool) => Promise<Section<unknown>> | Section<unknown>> = {
  build: () => buildSection(),
  heartbeats: heartbeatsSection,
};

// A named interface, not `Record<string, Section<unknown>> & { generatedAt: string }`: that
// intersection makes every string key (including generatedAt) satisfy the Section index
// signature, which a plain string never can. Each later task adds its own field here alongside
// its entry in SECTIONS.
export interface OpsReport {
  generatedAt: string;
  build: Section<{ commit: string; builtAt: string }>;
  heartbeats: Section<Heartbeat[]>;
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
