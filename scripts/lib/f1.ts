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
