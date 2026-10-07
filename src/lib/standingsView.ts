import { getStandings, getStandingsBySeason, getStandingsSeasons, getMostRecentPlayedSeason, type League, type StandingRow } from "@/lib/queries";

/**
 * The table the standings page shows for a league, and the season it belongs to. A table for the coming season
 * exists (every team 0-0) before a ball is kicked; showing it as "current" is meaningless, so it falls back to the
 * last season with games (`fallbackSeason`, set when that happened). The page and its share image read the same
 * thing here, so the picture never shows a different table from the page it was shared from.
 */
export async function currentStandingsView(league: League): Promise<{ standings: StandingRow[]; seasons: number[]; activeSeason: number | null; fallbackSeason: number | null }> {
  const [latest, seasons] = await Promise.all([getStandings(league), getStandingsSeasons(league)]);
  const played = latest.some((r) => r.wins + r.losses + (r.draws ?? 0) > 0);
  const fallbackSeason = played ? null : await getMostRecentPlayedSeason(league);
  const standings = fallbackSeason ? await getStandingsBySeason(league, fallbackSeason) : latest;
  const activeSeason = standings[0]?.season ?? seasons[0] ?? null;
  return { standings, seasons, activeSeason, fallbackSeason };
}
