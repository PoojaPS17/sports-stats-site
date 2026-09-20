import { isRegularSeasonGame } from "./gameStage";
import type { PlayerSport } from "./playerProfile";

/** The games-logged count on the player comparison. The compared numbers are ESPN's regular-season
 * season stats, so for NBA and NFL only regular-season games count (no playoffs, play-in,
 * preseason, All-Star or Cup final). Every other sport counts every row, as it always has. */
export function countRegularGames(rows: { stage?: string | null; round?: string | null }[], sport: PlayerSport | null): number {
  if (sport !== "nba" && sport !== "nfl") return rows.length;
  return rows.filter((r) => isRegularSeasonGame({ stage: r.stage, round: r.round ?? null })).length;
}
