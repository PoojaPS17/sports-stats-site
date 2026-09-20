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
  /** False when football rounds are labelled by date because numbering could not be verified. */
  numbered: boolean;
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
  const weeks = buildMatchweeks(league, games);
  return { season, seasons, weeks, isCurrentSeason: season === seasons[0], numbered: weeks.every((w) => w.numbered) };
}

/**
 * True when a season's round index has something to show. The index pages 404 otherwise, and the sitemap
 * lists an index only when this holds, so a listed URL is never a 404 (see tests/matchweek-hub.test.ts).
 * A league with games can still have no rounds: NBA preseason games belong to no round.
 */
export function hasWeeks(ctx: WeekContext | null): ctx is WeekContext {
  return ctx !== null && ctx.weeks.length > 0;
}
