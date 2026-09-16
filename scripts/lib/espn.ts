export type League = "nba" | "nfl";

export const SPORT_PATH: Record<League, string> = {
  nba: "basketball/nba",
  nfl: "football/nfl",
};

const SITE_BASE = "https://site.api.espn.com/apis/site/v2/sports";
const CORE_BASE = "https://site.api.espn.com/apis/v2/sports";

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`ESPN request failed (${res.status}): ${url}`);
  }
  return res.json() as Promise<T>;
}

export function fetchTeams(league: League) {
  return getJson<any>(`${SITE_BASE}/${SPORT_PATH[league]}/teams?limit=100`);
}

export function fetchScoreboard(league: League, dateYYYYMMDD?: string) {
  const q = dateYYYYMMDD ? `?dates=${dateYYYYMMDD}` : "";
  return getJson<any>(`${SITE_BASE}/${SPORT_PATH[league]}/scoreboard${q}`);
}

export function fetchStandings(league: League) {
  return getJson<any>(`${CORE_BASE}/${SPORT_PATH[league]}/standings`);
}

export function fetchSummary(league: League, eventId: string) {
  return getJson<any>(`${SITE_BASE}/${SPORT_PATH[league]}/summary?event=${eventId}`);
}
