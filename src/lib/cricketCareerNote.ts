// The note above a cricket player's career figures. The figures are sums over the matches this site holds, so
// the note says that, not "every match on record": Cricinfo's Statsguru counts matches the site does not have.
// Years are stated only where the data supports them:
//   - men's ODIs and T20Is: Cricsheet's ball-by-ball archives start in 2002 (ODI) and 2005 (T20I); ESPN fills
//     what Cricsheet lacks from 2009 (scripts/import-cricket-espn.ts). Some ODIs from 2002-2008 are in neither.
//   - women's ODIs and T20Is: ESPN alone, from 2009, with a few later matches missing.
//   - Tests: ESPN alone, every Test since TEST_ARCHIVE_START_YEAR (leagues.ts); the wording is derived in testArchiveCopy.ts.
//   - domestic leagues and World Cups: no year is stated; a match with no scorecard is not counted.
import { LEAGUE_LABEL, isFirstClassCricket, isInternationalCricket, type League } from "./leagues";
import { testCareerCopy } from "./testArchiveCopy";
import { ODI_ARCHIVE_START_YEAR, ODI_FULL_FROM_YEAR, T20I_ARCHIVE_START_YEAR, WOMENS_ARCHIVE_START_YEAR } from "./cricketCoverage";

const MATCHES_SENTENCE = "Matches counts every match on this site the player was in the playing XI for.";

export function testCareerNote(): string {
  return `${testCareerCopy()} ${MATCHES_SENTENCE}`;
}

export function womensInternationalCareerNote(league: "wodi" | "wt20i"): string {
  const format = league === "wodi" ? "ODIs" : "T20 internationals";
  return `Counts the women's ${format} held on this site (World Cups included). Coverage begins in ${WOMENS_ARCHIVE_START_YEAR}, so earlier matches are not included, and a small number of later matches are missing. Totals are lower than Cricinfo's for players who played before then. ${MATCHES_SENTENCE}`;
}

export function mensInternationalCareerNote(league: "odi" | "t20i"): string {
  return league === "odi"
    ? `Counts the men's ODIs held on this site (World Cups included). Coverage begins in ${ODI_ARCHIVE_START_YEAR} and is incomplete until ${ODI_FULL_FROM_YEAR}: many ODIs from ${ODI_ARCHIVE_START_YEAR} to ${ODI_FULL_FROM_YEAR - 1} and a few later ones are missing. Totals are lower than Cricinfo's for anyone who played before ${ODI_FULL_FROM_YEAR}, and for a long career that began earlier the gap can be large. ${MATCHES_SENTENCE}`
    : `Counts the men's T20 internationals held on this site (World Cups included). Coverage begins in ${T20I_ARCHIVE_START_YEAR}. A small number of matches are missing, so totals can be lower than Cricinfo's for players who played earlier. ${MATCHES_SENTENCE}`;
}

export function domesticCareerNote(league: League): string {
  return `Counts the ${LEAGUE_LABEL[league]} matches held on this site. Matches without a scorecard on this site are not counted, so totals can be lower than Cricinfo's for players who played earlier. ${LEAGUE_LABEL[league]} only: other competitions and formats are not counted. ${MATCHES_SENTENCE}`;
}

export function cricketCareerNote(league: League): string {
  if (isFirstClassCricket(league)) return testCareerNote();
  if (league === "wodi" || league === "wt20i") return womensInternationalCareerNote(league);
  if (isInternationalCricket(league)) return mensInternationalCareerNote(league as "odi" | "t20i");
  return domesticCareerNote(league);
}
