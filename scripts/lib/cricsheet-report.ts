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
//
// Even in a Cricsheet league the marker alone is not enough: IPL and BBL are ESPN-fed, with Cricsheet
// filling only the matches ESPN has no scorecard for, and an ESPN IPL/BBL report stored before fe9fbff
// has no dismissal either. What tells them apart is the cards: every ESPN writer stamps its rows with
// the extractor version (`stats.v`), the Cricsheet importer never does. A game holding ANY stamped card
// is ESPN-fed, so re-running an ESPN card writer over a Cricsheet-filled game turns it into an ESPN one
// (backfill:cricket-player-stats without --missing on ipl/bbl does that: do not). The rule cannot
// recognise an ESPN game whose cards were all written before the stamp existed; it reads as Cricsheet's.
const firstBattingRow = (scorecard: unknown): unknown => {
  if (!Array.isArray(scorecard)) return undefined;
  for (const team of scorecard) if (Array.isArray(team?.battingRows) && team.battingRows.length > 0) return team.battingRows[0];
  return undefined;
};
const hasRow = (row: unknown): row is object => row != null && typeof row === "object";

/**
 * The stored scorecard was built from Cricsheet: a Cricsheet league, its first batting row has no dismissal text,
 * and no card of the game carries the ESPN extractor's version stamp (`espnCards`, see above).
 */
export function isCricsheetReport(league: string, scorecard: unknown, espnCards = false): boolean {
  const row = firstBattingRow(scorecard);
  return isCricsheetLeague(league) && hasRow(row) && !("dismissal" in row) && !espnCards;
}

/** The stored scorecard is ESPN's and has batting rows to rebuild. No batting rows at all reads as no report. */
export function isEspnReport(league: string, scorecard: unknown, espnCards = false): boolean {
  const row = firstBattingRow(scorecard);
  return hasRow(row) && (!isCricsheetLeague(league) || "dismissal" in row || espnCards);
}

// SQL twin of the `espnCards` argument: the game holds a card stamped by an ESPN writer. Aliases game_details as `d`.
const ESPN_CARDS_SQL = `exists (select 1 from player_game_stats s where s.league = d.league and s.game_espn_id = d.game_espn_id and s.stats ? 'v')`;

// SQL twin of isCricsheetReport, for a query that aliases game_details as `d`.
const FIRST_BATTING_ROW_SQL = `(select t.value -> 'battingRows' -> 0
    from jsonb_array_elements(case when jsonb_typeof(d.details -> 'scorecard') = 'array' then d.details -> 'scorecard' else '[]'::jsonb end) with ordinality as t(value, n)
    where jsonb_typeof(t.value -> 'battingRows') = 'array' and jsonb_array_length(t.value -> 'battingRows') > 0
    order by t.n limit 1)`;
export const CRICSHEET_REPORT_SQL = `d.league in (${CRICSHEET_LEAGUES.map((l) => `'${l}'`).join(", ")})
    and ${FIRST_BATTING_ROW_SQL} is not null and not (${FIRST_BATTING_ROW_SQL} ? 'dismissal')
    and not ${ESPN_CARDS_SQL}`;
