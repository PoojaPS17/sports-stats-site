// F1-specific ESPN fetchers. Not a `League` in the team-sports sense (drivers race
// individually across a season-long calendar of weekend "events" built from multiple
// timed sessions, not a single team-vs-team match) — its own small parallel pipeline,
// same reasoning as tennis.ts. Constructors/drivers do reuse the existing
// teams/players tables (league='f1') since those are a genuine shape match.
const SITE_BASE = "https://site.api.espn.com/apis/site/v2/sports/racing/f1";
const CORE_BASE = "https://sports.core.api.espn.com/v2/sports/racing/leagues/f1";
const REQUEST_TIMEOUT_MS = 20_000;

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!res.ok) {
    const text = await res.text();
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`ESPN request failed (${res.status}): ${url}`);
    }
  }
  return res.json() as Promise<T>;
}

// Always returns "whichever race weekend is currently on" — like tennis's scoreboard,
// this silently ignores any season/date filter (confirmed by testing), so it can only
// ever be used for the live/recent view, not historical backfill.
export function fetchF1Scoreboard() {
  return getJson<any>(`${SITE_BASE}/scoreboard`);
}

export function fetchF1Teams() {
  return getJson<any>(`${SITE_BASE}/teams?limit=50`);
}

export function fetchF1Standings(seasonYear: number) {
  return getJson<{ items?: { $ref: string }[] }>(`${CORE_BASE}/seasons/${seasonYear}/types/2/standings?lang=en&region=us`);
}

// Every event id for a season, as bare $ref pointers — dereference each with
// fetchByRef to get the full weekend (all sessions, all competitors) in one request.
export function fetchF1SeasonEventRefs(seasonYear: number) {
  return getJson<{ items?: { $ref: string }[] }>(`${CORE_BASE}/seasons/${seasonYear}/types/2/events?limit=40&lang=en&region=us`);
}

export function fetchByRef<T = any>(ref: string): Promise<T> {
  return getJson<T>(ref);
}

function extractEntityId(ref: string | undefined): string | null {
  const m = ref?.match(/\/(athletes|manufacturers)\/(\d+)/);
  return m ? m[2] : null;
}

function statValue(stats: any[], name: string): number | null {
  const stat = stats.find((s: any) => s.name === name);
  return typeof stat?.value === "number" ? stat.value : null;
}

// Shared by both fetch-f1-standings.ts (current season, run on a schedule) and
// backfill-f1-standings.ts (every past season, run once) — each standings group
// references its driver/constructor only by a $ref URL (no inline name), so the
// numeric id is pulled straight out of that URL rather than dereferencing it, since
// the driver/constructor themselves are already upserted by fetch-f1-scores.ts /
// backfill-f1-events.ts / seed-f1-teams.ts and this only needs their existing espn_id.
export async function upsertF1StandingsForSeason(pool: import("pg").Pool, seasonYear: number): Promise<void> {
  const data = await fetchF1Standings(seasonYear);
  for (const item of data.items ?? []) {
    const groupRef = item["$ref"];
    try {
      const group = await fetchByRef<any>(groupRef);
      const type: "driver" | "constructor" = group.id === "0" ? "driver" : "constructor";

      let count = 0;
      for (const entry of group.standings ?? []) {
        const entityId = extractEntityId(entry.athlete?.["$ref"]) ?? extractEntityId(entry.manufacturer?.["$ref"]);
        if (!entityId) continue;
        const stats = entry.records?.[0]?.stats ?? [];
        const position = statValue(stats, "rank");
        const points = statValue(stats, "championshipPts") ?? statValue(stats, "points");
        const wins = statValue(stats, "wins");

        await pool.query(
          `insert into f1_standings (season_year, standings_type, entity_espn_id, position, points, wins, updated_at)
           values ($1, $2, $3, $4, $5, $6, now())
           on conflict (season_year, standings_type, entity_espn_id) do update set
             position = excluded.position, points = excluded.points, wins = excluded.wins, updated_at = now()`,
          [seasonYear, type, entityId, position, points, wins]
        );
        count++;
      }
      console.log(`[f1-standings] ${seasonYear} ${type}: ${count} rows`);
    } catch (err) {
      console.error(`[f1-standings] ${seasonYear} group failed:`, err instanceof Error ? err.message : err);
    }
  }
}
