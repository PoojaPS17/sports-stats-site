// Shared loader for the matchweek routes. The URL is /[league]/matchweek[/season][/n]
// (or /week/... for the NFL and NBA via a rewrite); a first segment of 2000+ is read
// as a season, anything smaller as a week number in the current season.
import { buildMatchweeks, getSeasonGames, getSeasonsWithGames, supportsMatchweeks, type Matchweek } from "./matchweeks";
import type { League } from "./leagues";

export interface WeekContext {
  season: number;
  seasons: number[];
  weeks: Matchweek[];
  isCurrentSeason: boolean;
}

export function isSeasonSegment(value: string): boolean {
  const n = Number(value);
  return Number.isInteger(n) && n >= 2000;
}

export async function loadWeeks(league: League, seasonParam?: string): Promise<WeekContext | null> {
  if (!supportsMatchweeks(league)) return null;
  const seasons = await getSeasonsWithGames(league);
  if (seasons.length === 0) return null;
  const season = seasonParam ? Number(seasonParam) : seasons[0];
  if (!seasons.includes(season)) return null;
  const games = await getSeasonGames(league, season);
  return { season, seasons, weeks: buildMatchweeks(league, games), isCurrentSeason: season === seasons[0] };
}
