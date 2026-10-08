import { LEAGUE_LABEL, hasStandings, type League } from "./leagues";

/** The leagues whose tournaments are played in groups (the World Cup T20s), so their table is "group tables". */
const GROUPED: League[] = ["t20wc", "wt20wc"];

export type SeriesHubLink = { href: string; prefix: string; label: string };

/**
 * The line on a series page whose points table lives on its hub instead. The hub is the series' `league`
 * (SERIES_LEAGUE_SQL in cricketSeries.ts, the single mapping); it renders only when that hub has a standings route.
 * The label is the hub's own name, so the men's and the women's competition each read correctly.
 */
export function seriesHubStandingsLink(league: League | null): SeriesHubLink | null {
  if (!league || !hasStandings(league)) return null;
  return {
    href: `/${league}/standings`,
    prefix: GROUPED.includes(league) ? "Group tables and standings:" : "Points table and standings:",
    label: `${LEAGUE_LABEL[league]} standings`,
  };
}
