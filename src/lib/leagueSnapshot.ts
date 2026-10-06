import type { OffseasonRecap } from "./offseason";

export interface LeagueSnapshotData {
  season: number;
  seasonLabel: string;
  inSeason: boolean;
  table: OffseasonRecap["table"];
  /** One per row of `table`: its qualification or relegation band, or null. */
  bands: OffseasonRecap["bands"];
  tableSize: number;
  leaders: OffseasonRecap["leaders"];
}

/** The table and leaders of a recap, optionally trimmed for a compact block (the homepage). */
export function snapshotFromRecap(recap: OffseasonRecap, opts: { tableRows?: number; boards?: number; leaderRows?: number } = {}): LeagueSnapshotData {
  const leaders = (opts.boards !== undefined ? recap.leaders.slice(0, opts.boards) : recap.leaders).map((b) => ({
    ...b,
    rows: opts.leaderRows !== undefined ? b.rows.slice(0, opts.leaderRows) : b.rows,
  }));
  return {
    season: recap.season,
    seasonLabel: recap.seasonLabel,
    inSeason: !recap.seasonOver,
    table: opts.tableRows !== undefined ? recap.table.slice(0, opts.tableRows) : recap.table,
    bands: opts.tableRows !== undefined ? recap.bands.slice(0, opts.tableRows) : recap.bands,
    tableSize: recap.tableSize,
    leaders,
  };
}
