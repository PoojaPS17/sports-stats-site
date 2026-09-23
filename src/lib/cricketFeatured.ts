// Which cricket is headline cricket. ESPN's daily listing carries every match played
// anywhere (county and Ranji first-class rounds, provincial one-day cups, club T20s,
// youth and A-team tours), and most of it is of no interest to the reader who comes
// for the scores. Live and upcoming lists on the homepage and the Series directory
// show only the competitions below; everything else stays stored and reachable
// through the series picker (nav Cricket menu, /cricket/series) and search.
//
// Pure constants, safe to import from Client Components (no database import).
import { baseSeriesId } from "./cricketSeriesKey";

/** ESPN series ids of the featured competitions, with a short display name. */
export const FEATURED_SERIES: Record<string, string> = {
  // Competitions SportsDB archives with scorecards, tables and player pages.
  "8048": "IPL",
  "8044": "Big Bash League",
  "8039": "Cricket World Cup",
  "8604": "T20 World Cup",
  "21282": "Women's Premier League",
  "21284": "Women's Big Bash",
  "8584": "Women's World Cup",
  "8634": "Women's T20 World Cup",
  // The other major franchise leagues (scores and results from the series feed).
  "8679": "Pakistan Super League",
  "21275": "SA20",
  "8623": "Caribbean Premier League",
  "19601": "The Hundred",
  "21376": "The Hundred Women's",
  "20898": "Women's Caribbean Premier League",
  "21266": "Major League Cricket",
  "20921": "International League T20",
  "19943": "Lanka Premier League",
  "8653": "Bangladesh Premier League",
};

// ESPN's `class.internationalClassId`: 1 Test, 2 ODI, 3 T20I; 8/9/10 the women's
// equivalents. Youth internationals (14, 15) and unofficial "Other" matches are not
// headline cricket.
export const FEATURED_CLASS_IDS = ["1", "2", "3", "8", "9", "10"];

export function isFeaturedSeriesId(seriesEspnId: string | null | undefined): boolean {
  // A tournament's series id is an edition key ("8044-2025-26"); the competition is its ESPN league id.
  return Boolean(seriesEspnId && FEATURED_SERIES[baseSeriesId(seriesEspnId)]);
}

/** True for a match in a featured competition or an official international (Test, ODI, T20I, men's or women's). */
export function isFeaturedCricket(m: { series_espn_id: string; international_class_id: string | null }): boolean {
  return isFeaturedSeriesId(m.series_espn_id) || (m.international_class_id !== null && FEATURED_CLASS_IDS.includes(m.international_class_id));
}

const list = (values: string[]) => values.map((v) => `'${v}'`).join(",");

/** SQL predicate for the same rule over a `cricket_series_matches` row aliased `alias`. */
export function featuredMatchSql(alias = "m"): string {
  return `(split_part(${alias}.series_espn_id, '-', 1) in (${list(Object.keys(FEATURED_SERIES))}) or ${alias}.international_class_id in (${list(FEATURED_CLASS_IDS)}))`;
}

/** SQL predicate for a `cricket_series` row aliased `alias`: a featured competition, or a series with an official international in it. */
export function featuredSeriesSql(alias = "s"): string {
  return `(split_part(${alias}.espn_id, '-', 1) in (${list(Object.keys(FEATURED_SERIES))})
    or exists (select 1 from cricket_series_matches x where x.series_espn_id = ${alias}.espn_id and x.international_class_id in (${list(FEATURED_CLASS_IDS)})))`;
}

/**
 * True for a cricket match at the Asian Games specifically (not the broader
 * MULTI_SPORT_GAMES set in homeData.ts, which also matches Commonwealth Games and
 * Olympic cricket for homepage ranking purposes). Matched on the series name, not
 * a stored edition id, so the next Asian Games needs no code change here either.
 */
export function isAsianGamesCricket(m: { series_name: string }): boolean {
  return /\basian games\b/i.test(m.series_name);
}
