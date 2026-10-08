// ESPN's `class.internationalClassId` on a cricket fixture, as the SportsDB league its result is archived under.
// 1 = men's Test, 2 = men's ODI, 3 = men's T20I, 9 = women's ODI, 10 = women's T20I; women's Tests and every
// domestic or first-class card use other ids and have no league here.
import type { League } from "./leagues";

export type IntlLeague = "test" | "odi" | "t20i" | "wodi" | "wt20i";

export const CLASS_TO_LEAGUE: Record<string, IntlLeague> = { "1": "test", "2": "odi", "3": "t20i", "9": "wodi", "10": "wt20i" };

export const isIntlLeague = (league: League | string): league is IntlLeague => Object.values(CLASS_TO_LEAGUE).includes(league as IntlLeague);
