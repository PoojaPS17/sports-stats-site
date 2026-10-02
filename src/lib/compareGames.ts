import { isRegularSeasonGame } from "./gameStage";
import type { PlayerSport } from "./playerProfile";

/** The games-logged count on the player comparison. The compared numbers are ESPN's regular-season
 * season stats, so for the US sports only regular-season games count (no playoffs, play-in, spring
 * training, preseason, All-Star or Cup final). Football and cricket count every row, as they always
 * have: their seasons have no stages ESPN leaves out of a player's totals. */
export function countRegularGames(rows: { stage?: string | null; round?: string | null }[], sport: PlayerSport | null): number {
  if (sport === null || sport === "soccer") return rows.length;
  return rows.filter((r) => isRegularSeasonGame({ stage: r.stage, round: r.round ?? null })).length;
}
