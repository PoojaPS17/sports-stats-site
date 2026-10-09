/* eslint-disable @typescript-eslint/no-explicit-any -- ESPN feed JSON has no published schema */
// A series' points table, read from ESPN at request time. ESPN serves one for any series at
// site.web.api.espn.com/apis/v2/sports/cricket/<league id>/standings (the site.api.espn.com host
// answers 404): rank, matches, wins, losses, draws, ties, no results, points, and for most competitions
// the net run rate and a qualified flag. The net run rate is only meaningful in limited-overs cricket;
// `seriesIsMultiDayOnly` decides whether the page shows the column. Points always come from the feed:
// a competition may award bonus points (the CSA Women Pro50 gives 5 for a win with a bonus, 2 without),
// so counting results is wrong.
import { baseSeriesId } from "./cricketSeriesKey";
import { resolveTeamLogo } from "./teamLogos";

export interface PointsTableRow {
  teamId: string;
  team: string;
  abbreviation: string | null;
  logo: string | null;
  rank: number;
  played: number;
  won: number;
  lost: number;
  /** Multi-day cricket only: the feed's `matchesDraw`. Without it a first-class row does not add up. */
  drawn: number;
  tied: number;
  noResult: number;
  points: number;
  /** As the feed prints it ("1.72", "-0.5"); null when the feed has none. */
  nrr: string | null;
  /** The feed's qualified flag; null when the feed carries none. */
  qualified: boolean | null;
}

export interface CricketSeriesStandings {
  /** The season the feed describes; null when it does not say. */
  seasonYear: number | null;
  /** One group for a league table, several for a tournament with pools (the feed's group name; null for "overall"). */
  groups: { name: string | null; rows: PointsTableRow[] }[];
  hasNrr: boolean;
  hasDraws: boolean;
  hasTies: boolean;
  hasQualified: boolean;
}

const STANDINGS_REVALIDATE = 300;

/** The feed is keyed by ESPN's league id, which an edition key ("8679-2026") shares with every edition. */
export function cricketSeriesStandingsUrl(espnId: string): string {
  return `https://site.web.api.espn.com/apis/v2/sports/cricket/${baseSeriesId(espnId)}/standings`;
}

/** The table in the feed's own order (its rank), or null when the body has no entries (an error body, an unknown series). */
export function parseCricketSeriesStandings(body: unknown): CricketSeriesStandings | null {
  if (body == null || typeof body !== "object") return null;
  const b = body as any;
  const children: any[] = Array.isArray(b.children) ? b.children : [];
  const groups: CricketSeriesStandings["groups"] = [];
  let hasNrr = false;
  let hasDraws = false;
  let hasTies = false;
  let hasQualified = false;
  for (const child of children) {
    const entries: any[] = Array.isArray(child?.standings?.entries) ? child.standings.entries : [];
    const rows: PointsTableRow[] = [];
    for (const e of entries) {
      if (!e?.team) continue;
      const stats: any[] = Array.isArray(e.stats) ? e.stats : [];
      const stat = (name: string) => stats.find((s) => s?.name === name);
      const num = (name: string) => {
        const s = stat(name);
        const v = Number(s?.value ?? s?.displayValue);
        return Number.isFinite(v) ? v : 0;
      };
      const nrrStat = stat("netrr");
      const nrr = nrrStat ? String(nrrStat.displayValue ?? nrrStat.value ?? "").trim() || null : null;
      const qualifiedStat = stat("qualified");
      const logo = (e.team.logos ?? []).find((l: any) => l?.href)?.href ?? null;
      rows.push({
        teamId: String(e.team.id ?? ""),
        team: String(e.team.displayName ?? e.team.name ?? ""),
        abbreviation: e.team.abbreviation ?? null,
        logo: resolveTeamLogo(e.team.id, logo),
        rank: num("rank") || rows.length + 1,
        played: num("matchesPlayed"),
        won: num("matchesWon"),
        lost: num("matchesLost"),
        drawn: num("matchesDraw"),
        tied: num("matchesTied"),
        noResult: num("noresult"),
        points: num("matchPoints"),
        nrr,
        qualified: qualifiedStat ? Number(qualifiedStat.value ?? qualifiedStat.displayValue) > 0 : null,
      });
      if (nrr !== null) hasNrr = true;
    }
    if (rows.length === 0) continue;
    rows.sort((a, b) => a.rank - b.rank);
    if (rows.some((r) => r.drawn > 0)) hasDraws = true;
    if (rows.some((r) => r.tied > 0)) hasTies = true;
    if (rows.some((r) => r.qualified === true)) hasQualified = true;
    const name = String(child.name ?? "").trim();
    groups.push({ name: name && !/^overall$/i.test(name) ? name : null, rows });
  }
  if (groups.length === 0) return null;
  const year = Number(b.season?.year);
  return { seasonYear: Number.isFinite(year) && year > 0 ? year : null, groups, hasNrr, hasDraws, hasTies, hasQualified };
}

/**
 * Whether a series page shows the table: three or more teams (two is a bilateral series' win count, not a points
 * table), and the feed's season must be this series' when both are known, because an edition key shares the feed with
 * every other edition of the tournament.
 */
export function pointsTableShown(table: CricketSeriesStandings | null, series: { season: number | null }): boolean {
  if (!table) return false;
  if (table.seasonYear !== null && series.season !== null && table.seasonYear !== series.season) return false;
  return table.groups.reduce((n, g) => n + g.rows.length, 0) >= 3;
}

/** The series' table from ESPN, cached for five minutes; null when the feed fails or has none. */
export async function fetchCricketSeriesStandings(espnId: string): Promise<CricketSeriesStandings | null> {
  try {
    const res = await fetch(cricketSeriesStandingsUrl(espnId), { next: { revalidate: STANDINGS_REVALIDATE } });
    if (!res.ok) return null;
    return parseCricketSeriesStandings(await res.json());
  } catch {
    return null;
  }
}
