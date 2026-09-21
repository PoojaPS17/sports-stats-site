// Which stored match reports were built from Cricsheet, shared by the Cricsheet importer
// (its cards-only --rewrite-cards selection) and the ESPN card refresh (which must never
// overwrite Cricsheet's ball-by-ball cards). No database access: the SQL is a fragment.

/** The leagues Cricsheet feeds (keys of MATCH_TYPE in import-cricsheet.ts). Every other cricket league is ESPN-only. */
export const CRICSHEET_LEAGUES = ["odi", "t20i", "ipl", "bbl"] as const;
export type CricsheetLeague = (typeof CRICSHEET_LEAGUES)[number];
export const isCricsheetLeague = (league: string): league is CricsheetLeague => (CRICSHEET_LEAGUES as readonly string[]).includes(league);

// A Cricsheet report's batting rows carry no `dismissal` (the ESPN parser writes one, "not out"
// included, but only since fe9fbff: an older ESPN report has none either). So the marker means
// Cricsheet only in a league Cricsheet feeds; anywhere else a stored report is ESPN's by definition.
// The row looked at is the first one of the first team entry that has any batting rows.
const firstBattingRow = (scorecard: unknown): unknown => {
  if (!Array.isArray(scorecard)) return undefined;
  for (const team of scorecard) if (Array.isArray(team?.battingRows) && team.battingRows.length > 0) return team.battingRows[0];
  return undefined;
};
const hasRow = (row: unknown): row is object => row != null && typeof row === "object";

/** The stored scorecard was built from Cricsheet: a Cricsheet league, and its first batting row has no dismissal text. */
export function isCricsheetReport(league: string, scorecard: unknown): boolean {
  const row = firstBattingRow(scorecard);
  return isCricsheetLeague(league) && hasRow(row) && !("dismissal" in row);
}

/** The stored scorecard is ESPN's and has batting rows to rebuild. No batting rows at all reads as no report. */
export function isEspnReport(league: string, scorecard: unknown): boolean {
  const row = firstBattingRow(scorecard);
  return hasRow(row) && (!isCricsheetLeague(league) || "dismissal" in row);
}

// SQL twin of isCricsheetReport, for a query that aliases game_details as `d`.
const FIRST_BATTING_ROW_SQL = `(select t.value -> 'battingRows' -> 0
    from jsonb_array_elements(case when jsonb_typeof(d.details -> 'scorecard') = 'array' then d.details -> 'scorecard' else '[]'::jsonb end) with ordinality as t(value, n)
    where jsonb_typeof(t.value -> 'battingRows') = 'array' and jsonb_array_length(t.value -> 'battingRows') > 0
    order by t.n limit 1)`;
export const CRICSHEET_REPORT_SQL = `d.league in (${CRICSHEET_LEAGUES.map((l) => `'${l}'`).join(", ")})
    and ${FIRST_BATTING_ROW_SQL} is not null and not (${FIRST_BATTING_ROW_SQL} ? 'dismissal')`;
