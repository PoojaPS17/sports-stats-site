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

// Cricket's `scoreboard` endpoint (unlike `teams/{id}/schedule`, which 404s for this
// competition) accepts a `season` query param and returns that whole season's matches
// in one call — even though the competition id in the path (e.g. IPL's 8048) otherwise
// only resolves to the *current* season by default.
export function fetchScoreboardBySeason(league: League, season: number) {
  return getJson<any>(`${SITE_BASE}/${SPORT_PATH[league]}/scoreboard?season=${season}`);
}

export function fetchStandings(league: League) {
  return getJson<any>(`${CORE_BASE}/${SPORT_PATH[league]}/standings`);
}

// All four leagues' standings endpoints accept a `season` query param and return that
// year's final table — cricket additionally needs `seasontype=2` or it ignores the
// season param and falls back to the current one.
export function fetchStandingsBySeason(league: League, season: number) {
  const q = league === "ipl" ? `season=${season}&seasontype=2` : `season=${season}`;
  return getJson<any>(`${CORE_BASE}/${SPORT_PATH[league]}/standings?${q}`);
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

// Unlike every other endpoint here, soccer's athlete-stats path is NOT league-scoped —
// `soccer/eng.1/athletes/...` 404s; it has to be the bare sport, `soccer/athletes/...`.
// The response it returns is also sport-wide (a player's career across every league
// and competition they've featured in, not just the Premier League) — callers must
// filter rows by `leagueSlug` themselves.
export function fetchAthleteSeasonStats(league: League, athleteEspnId: string) {
  const sportPath = league === "epl" ? "soccer" : SPORT_PATH[league];
  return getJson<any>(`${COMMON_BASE}/${sportPath}/athletes/${athleteEspnId}/stats`);
}

// The athlete season-stats endpoint can lag behind the actual live season (it may not
// have a row for the in-progress year yet), so we don't trust "the last row" as
// "current." The scoreboard always reflects the live season, so use it as ground truth.
export async function fetchCurrentSeasonYear(league: League): Promise<number | null> {
  const data = await fetchScoreboard(league);
  return data.leagues?.[0]?.season?.year ?? null;
}

const CORE_LEAGUE_PATH: Record<League, string> = {
  nba: "basketball/leagues/nba",
  nfl: "football/leagues/nfl",
  epl: "soccer/leagues/eng.1",
  ipl: "cricket/leagues/8048",
};

// The core API's season-scoped team resource carries venue + a coaches reference in
// one request — richer than the site API's team endpoint (no franchise/venue there for
// soccer) and consistent across NBA/NFL/EPL. Not available for IPL (cricket's
// team-level endpoints 404 for this competition, same as site API's /teams/{id}).
export function fetchCoreTeam(league: League, teamEspnId: string, season: number) {
  return getJson<any>(`https://sports.core.api.espn.com/v2/sports/${CORE_LEAGUE_PATH[league]}/seasons/${season}/teams/${teamEspnId}`);
}

export function fetchByRef<T = any>(ref: string): Promise<T> {
  return getJson<T>(ref);
}

