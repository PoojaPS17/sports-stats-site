export type League = "nba" | "nfl" | "epl" | "ipl";

export const SPORT_PATH: Record<League, string> = {
  nba: "basketball/nba",
  nfl: "football/nfl",
  epl: "soccer/eng.1",
  ipl: "cricket/8048",
};

const SITE_BASE = "https://site.api.espn.com/apis/site/v2/sports";
const CORE_BASE = "https://site.api.espn.com/apis/v2/sports";
const COMMON_BASE = "https://site.api.espn.com/apis/common/v3/sports";

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const REQUEST_TIMEOUT_MS = 20_000;

// Without an explicit timeout, a request ESPN accepts but never responds to (observed
// in practice — a scheduled run once hung for 8+ minutes on a single stuck request)
// blocks the whole script indefinitely, since native fetch() has no default timeout.
async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!res.ok) {
    throw new Error(`ESPN request failed (${res.status}): ${url}`);
  }
  return res.json() as Promise<T>;
}

export function fetchTeams(league: League) {
  return getJson<any>(`${SITE_BASE}/${SPORT_PATH[league]}/teams?limit=100`);
}

// Cricket has no working /teams endpoint (404s: "League not found"). Its scoreboard
// response includes a flat `teams` array though, so use that as the team source instead.
export async function fetchCricketTeams(league: League): Promise<any[]> {
  const data = await fetchScoreboard(league);
  return data.teams ?? [];
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

export function fetchRoster(league: League, teamEspnId: string) {
  return getJson<any>(`${SITE_BASE}/${SPORT_PATH[league]}/teams/${teamEspnId}/roster`);
}

// Returns a whole season's games for one team in a single call — much cheaper than
// scanning every day league-wide. `season` is the year ESPN labels that season with:
// the *ending* year for NBA ("2023" = the 2022-23 season), the *starting* year for
// NFL/soccer ("2024" = the 2024 NFL season / the 2024-25 EPL season). Not available
// for this cricket competition (404s, same as /teams and /roster).
export function fetchTeamSchedule(league: League, teamEspnId: string, season: number) {
  return getJson<any>(`${SITE_BASE}/${SPORT_PATH[league]}/teams/${teamEspnId}/schedule?season=${season}`);
}

export function fetchNews(league: League, limit = 15) {
  return getJson<any>(`${SITE_BASE}/${SPORT_PATH[league]}/news?limit=${limit}`);
}

export function fetchAthleteSeasonStats(league: League, athleteEspnId: string) {
  return getJson<any>(`${COMMON_BASE}/${SPORT_PATH[league]}/athletes/${athleteEspnId}/stats`);
}

// The athlete season-stats endpoint can lag behind the actual live season (it may not
// have a row for the in-progress year yet), so we don't trust "the last row" as "current."
// The scoreboard always reflects the live season, so use it as ground truth instead.
export async function fetchCurrentSeasonYear(league: League): Promise<number | null> {
  const data = await fetchScoreboard(league);
  return data.leagues?.[0]?.season?.year ?? null;
}
