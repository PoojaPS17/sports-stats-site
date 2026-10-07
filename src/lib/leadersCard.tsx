import type { ReactElement } from "react";
import { formatLeaderValue } from "@/lib/leaders";
import { LEAGUE_LABEL, formatSeasonLabel, type League } from "@/lib/queries";
import { chartCardElement, evenCap, fitSections, type ChartCardFormat, type ChartRow, type FittedSection } from "@/lib/chartCard";
import type { LeaderBoardView } from "@/lib/leadersView";

/** A board never shows more than the page's own ten. */
const BOARD_ROWS = 10;

/**
 * Which rows of which boards fit the image, in the order they are drawn: left column first. Boards are shared evenly
 * between two columns and all show the same number of rows, so one board is never a different length from its neighbour
 * only because it came first. The unit goes in the heading, so a row has the room for a long name.
 */
export function layoutLeaders(boards: LeaderBoardView[], format: ChartCardFormat): { columns: FittedSection<ChartRow>[][]; hiddenGroups: number } {
  const filled = boards.filter((b) => b.rows.length > 0);
  const columnCount = filled.length > 1 ? 2 : 1;
  const cap = Math.min(BOARD_ROWS, evenCap(filled.length, columnCount, format, true));
  const sections: [string, ChartRow[]][] = filled.map((b) => [
    `${b.label} (${b.unit})`,
    b.rows.map((r, i) => ({ position: String(r.rank ?? i + 1), name: r.name, primary: formatLeaderValue(r.value, b.unit) })),
  ]);
  return fitSections(sections, format, { cap, columnCount, headed: true });
}

/** The leaders page's boards as a picture: every category's top rows on the navy share-card frame. */
export function leadersCardElement({ league, season, boards, format }: { league: League; season: number | null; boards: LeaderBoardView[]; format: ChartCardFormat }): ReactElement {
  const { columns, hiddenGroups } = layoutLeaders(boards, format);
  const omitted = hiddenGroups > 0 || columns.some((c) => c.some((s) => s.hidden > 0));
  return chartCardElement({
    kicker: season ? `${formatSeasonLabel(league, season)} season` : "Season leaders",
    title: `${LEAGUE_LABEL[league]} leaders`,
    note: omitted ? `Top of each board shown. Full leaders at sports-db.live/${league}/leaders` : `sports-db.live/${league}/leaders`,
    format,
    columns,
    headed: true,
  });
}
