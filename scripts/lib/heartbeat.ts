import type { Pool } from "pg";

/** Longest a scraper may go without a successful run before check:stale fails, in minutes. */
export const MAX_AGE_MINUTES: Record<string, number> = {
  "fetch-injuries": 180,
  "fetch-f1-scores": 180,
  "fetch-f1-standings": 180,
};

/** Record a successful run. last_changed_at only moves when the caller knows rows really changed. */
export async function recordRun(pool: Pool, scraper: string, opts: { changed?: boolean } = {}): Promise<void> {
  await pool.query(
    `insert into scrape_runs (scraper, last_ok_at, last_changed_at)
     values ($1, now(), case when $2::boolean then now() end)
     on conflict (scraper) do update set
       last_ok_at = now(),
       last_changed_at = case when $2::boolean then now() else scrape_runs.last_changed_at end`,
    [scraper, opts.changed === true]
  );
}

export interface StaleScraper {
  scraper: string;
  /** Minutes since the last success; null when the scraper has never recorded a run. */
  ageMinutes: number | null;
}

export async function findStale(pool: Pool, limits: Record<string, number> = MAX_AGE_MINUTES): Promise<StaleScraper[]> {
  const { rows } = await pool.query(`select scraper, extract(epoch from (now() - last_ok_at)) / 60 as age from scrape_runs`);
  const ages = new Map<string, number>(rows.map((r) => [r.scraper as string, Number(r.age)]));
  const stale: StaleScraper[] = [];
  for (const [scraper, max] of Object.entries(limits)) {
    const age = ages.get(scraper);
    if (age === undefined) stale.push({ scraper, ageMinutes: null });
    else if (age > max) stale.push({ scraper, ageMinutes: Math.round(age) });
  }
  return stale;
}
