// Every (Summer) Asian Games edition, 1951-2026. A new edition is added here once, a
// deliberate few-line change roughly every 4 years when a new Games is confirmed and
// its host is announced — not scraped, because that's curated information (host
// city, official dates) with no single reliable scrapeable source, unlike the medal
// counts (scripts/lib/asianGamesMedals.ts).
//
// `year` is the Games' OFFICIAL edition year, matching the Wikipedia article title
// ("{year} Asian Games"), which is not always the calendar year it was actually held
// in: the 2022 Asian Games were postponed by the pandemic and held in September-
// October 2023, but kept the "2022" name (and Wikipedia title) throughout.
export interface AsianGamesEdition {
  year: number;
  edition: number;
  hostCity: string;
  hostCountry: string;
  /** ISO date (YYYY-MM-DD) the Games opened. */
  startDate: string;
  /** ISO date (YYYY-MM-DD) the Games closed. */
  endDate: string;
}

export const ASIAN_GAMES_EDITIONS: AsianGamesEdition[] = [
  { year: 1951, edition: 1, hostCity: "New Delhi", hostCountry: "India", startDate: "1951-03-04", endDate: "1951-03-11" },
  { year: 1954, edition: 2, hostCity: "Manila", hostCountry: "Philippines", startDate: "1954-05-01", endDate: "1954-05-09" },
  { year: 1958, edition: 3, hostCity: "Tokyo", hostCountry: "Japan", startDate: "1958-05-24", endDate: "1958-06-01" },
  { year: 1962, edition: 4, hostCity: "Jakarta", hostCountry: "Indonesia", startDate: "1962-08-24", endDate: "1962-09-04" },
  { year: 1966, edition: 5, hostCity: "Bangkok", hostCountry: "Thailand", startDate: "1966-12-09", endDate: "1966-12-20" },
  { year: 1970, edition: 6, hostCity: "Bangkok", hostCountry: "Thailand", startDate: "1970-12-09", endDate: "1970-12-20" },
  { year: 1974, edition: 7, hostCity: "Tehran", hostCountry: "Iran", startDate: "1974-09-01", endDate: "1974-09-16" },
  { year: 1978, edition: 8, hostCity: "Bangkok", hostCountry: "Thailand", startDate: "1978-12-09", endDate: "1978-12-20" },
  { year: 1982, edition: 9, hostCity: "New Delhi", hostCountry: "India", startDate: "1982-11-19", endDate: "1982-12-04" },
  { year: 1986, edition: 10, hostCity: "Seoul", hostCountry: "South Korea", startDate: "1986-09-20", endDate: "1986-10-02" },
  { year: 1990, edition: 11, hostCity: "Beijing", hostCountry: "China", startDate: "1990-09-22", endDate: "1990-10-07" },
  { year: 1994, edition: 12, hostCity: "Hiroshima", hostCountry: "Japan", startDate: "1994-10-02", endDate: "1994-10-16" },
  { year: 1998, edition: 13, hostCity: "Bangkok", hostCountry: "Thailand", startDate: "1998-12-06", endDate: "1998-12-20" },
  { year: 2002, edition: 14, hostCity: "Busan", hostCountry: "South Korea", startDate: "2002-09-29", endDate: "2002-10-14" },
  { year: 2006, edition: 15, hostCity: "Doha", hostCountry: "Qatar", startDate: "2006-12-01", endDate: "2006-12-15" },
  { year: 2010, edition: 16, hostCity: "Guangzhou", hostCountry: "China", startDate: "2010-11-12", endDate: "2010-11-27" },
  { year: 2014, edition: 17, hostCity: "Incheon", hostCountry: "South Korea", startDate: "2014-09-19", endDate: "2014-10-04" },
  { year: 2018, edition: 18, hostCity: "Jakarta & Palembang", hostCountry: "Indonesia", startDate: "2018-08-18", endDate: "2018-09-02" },
  // Postponed a year by the pandemic; kept the "2022" name and Wikipedia title throughout.
  { year: 2022, edition: 19, hostCity: "Hangzhou", hostCountry: "China", startDate: "2023-09-23", endDate: "2023-10-08" },
  { year: 2026, edition: 20, hostCity: "Aichi-Nagoya", hostCountry: "Japan", startDate: "2026-09-19", endDate: "2026-10-04" },
];

/**
 * The edition the recurring scraper polls and the medal tally page defaults to.
 * Update this (and add a new row above) when a new Games opens, roughly every 4 years.
 */
export const CURRENT_EDITION_YEAR = 2026;

export function currentEdition(): AsianGamesEdition {
  const found = ASIAN_GAMES_EDITIONS.find((e) => e.year === CURRENT_EDITION_YEAR);
  if (!found) throw new Error(`CURRENT_EDITION_YEAR (${CURRENT_EDITION_YEAR}) is not in ASIAN_GAMES_EDITIONS`);
  return found;
}

/** True while `edition` is in progress (its date window includes today), for the hub page's "Live" badge. */
export function isGamesOpen(edition: AsianGamesEdition, now: Date = new Date()): boolean {
  const day = now.toISOString().slice(0, 10);
  return day >= edition.startDate && day <= edition.endDate;
}

/**
 * Wikipedia's article title for this edition's medal table. Every edition from 1954
 * onward has a standalone page at this title; 1951 does not (see
 * scripts/lib/asianGamesMedals.ts for its fallback to the main "1951 Asian Games" article).
 */
export function wikipediaMedalTableTitle(year: number): string {
  return `${year} Asian Games medal table`;
}
