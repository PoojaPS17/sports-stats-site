import { normalizeStage } from "./stage";

// The classification itself lives in the database (games.stage, a generated column); this is
// the TypeScript side of it. See db/schema.sql.
export type GameStage = "regular" | "playoffs" | "playin" | "excluded" | "other";

/** A game that counts toward regular-season tables and totals. Rows from a query that predates
 * `stage` fall back to the old reading: no round means regular season. */
export function isRegularSeasonGame(g: { stage?: GameStage | string | null; round: string | null }): boolean {
  return g.stage ? g.stage === "regular" : g.round == null;
}

/** What the game log calls a game that is not a plain regular-season or playoff-round game:
 * the play-in, preseason, the NBA Cup final and the All-Star game. Regular-season and playoff
 * rows return null (a playoff row keeps its round label). */
export function stageLabel(row: { stage?: string | null; season_type?: number | null; competition_type?: string | null }): string | null {
  if (row.stage === "playin") return "Play-In";
  if (row.competition_type === "ALLSTAR") return "All-Star";
  if (row.competition_type === "CC") return "NBA Cup final";
  if (row.season_type === 1) return "Preseason";
  return null;
}

/** The game log's Stage/Round cell. Split sports (NBA, NFL): the stage label, then the normalised
 * playoff round, then "Week n"; an excluded game with no label of its own reads "Not counted", so
 * a dimmed row always says why. Other sports: the round, or the week. Empty when there is nothing. */
export function stageCellText(
  row: { stage?: string | null; season_type?: number | null; competition_type?: string | null; round?: string | null; week?: number | null },
  split: boolean
): string {
  const round = normalizeStage(row.round);
  const week = row.week ? `Week ${row.week}` : null;
  if (!split) return round ?? week ?? "";
  const label = stageLabel(row) ?? (row.stage === "excluded" ? "Not counted" : null);
  return [label, round, week].filter(Boolean).join(" · ");
}
