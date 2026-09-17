// Tennis-specific ESPN fetchers. Separate from lib/espn.ts's SPORT_PATH map since
// tennis isn't a `League` in the team-sports sense (no teams, no standings) — it's
// its own small parallel pipeline (see tennis_matches/tennis_rankings in schema.sql).
export type Tour = "atp" | "wta";

const SITE_BASE = "https://site.api.espn.com/apis/site/v2/sports/tennis";
const CORE_BASE = "https://sports.core.api.espn.com/v2/sports/tennis";
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

export function fetchTennisScoreboard(tour: Tour, dateYYYYMMDD?: string) {
  const q = dateYYYYMMDD ? `?dates=${dateYYYYMMDD}` : "";
  return getJson<any>(`${SITE_BASE}/${tour}/scoreboard${q}`);
}

// The rankings resource is discovered via a paginated list (currently always one
// item — the latest week) rather than a fixed URL, since the week number changes.
export async function fetchTennisRankings(tour: Tour): Promise<any | null> {
  const list = await getJson<{ items?: { $ref: string }[] }>(`${CORE_BASE}/leagues/${tour}/rankings`);
  const ref = list.items?.[0]?.["$ref"];
  if (!ref) return null;
  return getJson<any>(ref);
}

export function fetchTennisAthlete(athleteId: string) {
  return getJson<any>(`${CORE_BASE}/athletes/${athleteId}`);
}

export function fetchByRef<T = any>(ref: string): Promise<T> {
  return getJson<T>(ref);
}
