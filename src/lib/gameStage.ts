// The classification itself lives in the database (games.stage, a generated column); this is
// the TypeScript side of it. See db/schema.sql.
export type GameStage = "regular" | "playoffs" | "playin" | "excluded" | "other";

/** A game that counts toward regular-season tables and totals. Rows from a query that predates
 * `stage` fall back to the old reading: no round means regular season. */
export function isRegularSeasonGame(g: { stage?: GameStage | string | null; round: string | null }): boolean {
  return g.stage ? g.stage === "regular" : g.round == null;
}
