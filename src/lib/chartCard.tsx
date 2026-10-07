import type { ReactElement } from "react";
import { PixelBall } from "@/components/Logo";

export type ChartCardFormat = "og" | "portrait";

export const CHART_CARD_SIZES: Record<ChartCardFormat, { width: number; height: number }> = {
  og: { width: 1200, height: 630 },
  portrait: { width: 1080, height: 1350 },
};

// Pixels the frame itself takes (title block over the tables, footer under them), the height of a table's heading
// and of one row. The layout fits whole rows into what is left; nothing here is measured from the rendered image.
export const CHART_FRAME = { og: { top: 150, bottom: 74, row: 40, head: 44 }, portrait: { top: 190, bottom: 90, row: 49, head: 52 } } as const;
const COLUMN_GAP = 40;
/** A heading with fewer rows under it than this is not worth drawing: the next column (or the omission note) takes it. */
const MIN_ROWS = 3;

export interface FittedSection<T> {
  title: string;
  rows: T[];
  /** Rows of this group the image leaves out. */
  hidden: number;
}

/**
 * Which rows of which tables fit the image, in the order they are drawn: left column first. At most `cap` rows of a
 * group are drawn, as many as the height allows; a group that would get fewer than MIN_ROWS in the space left moves to
 * the next column (or is left out when there is none). `headed` says whether groups carry a heading of their own.
 */
export function fitSections<T>(sections: [string, T[]][], format: ChartCardFormat, opts: { cap: number; columnCount: number; headed: boolean }): { columns: FittedSection<T>[][]; hiddenGroups: number } {
  const frame = CHART_FRAME[format];
  const head = opts.headed ? frame.head : 0;
  const budget = CHART_CARD_SIZES[format].height - frame.top - frame.bottom;
  const columns: FittedSection<T>[][] = [[]];
  let used = 0;
  let placed = 0;
  for (const [title, rows] of sections) {
    let fit = Math.min(rows.length, opts.cap, Math.floor((budget - used - head) / frame.row));
    if (fit < Math.min(MIN_ROWS, rows.length)) {
      if (columns.length >= opts.columnCount) break;
      columns.push([]);
      used = 0;
      fit = Math.min(rows.length, opts.cap, Math.floor((budget - head) / frame.row));
      if (fit < Math.min(MIN_ROWS, rows.length)) break;
    }
    columns[columns.length - 1].push({ title, rows: rows.slice(0, fit), hidden: rows.length - fit });
    used += head + fit * frame.row;
    placed++;
  }
  return { columns, hiddenGroups: sections.length - placed };
}

/** The most rows each of `groups` tables may show when they are shared evenly between `columnCount` columns. */
export function evenCap(groups: number, columnCount: number, format: ChartCardFormat, headed: boolean): number {
  const frame = CHART_FRAME[format];
  const budget = CHART_CARD_SIZES[format].height - frame.top - frame.bottom;
  const perColumn = Math.ceil(groups / columnCount);
  return Math.max(MIN_ROWS, Math.floor((budget - perColumn * (headed ? frame.head : 0)) / frame.row / perColumn));
}

export interface ChartRow {
  /** Rank or position, printed as given. */
  position: string;
  /** A team colour for the dot before the name; none draws no dot. */
  dot?: string;
  name: string;
  primary: string;
  /** A second, quieter figure at the right edge; leave it out to give the name the room. */
  secondary?: string;
}

/**
 * The share-card frame for a chart: kicker over the title, the tables in columns, and the site mark with a note.
 * Every element with more than one child says `display: flex`, and every text is one string, which the renderer needs.
 */
export function chartCardElement({ kicker, title, note, format, columns, headed }: { kicker: string; title: string; note: string; format: ChartCardFormat; columns: FittedSection<ChartRow>[][]; headed: boolean }): ReactElement {
  const frame = CHART_FRAME[format];
  const portrait = format === "portrait";
  const showSecondary = columns.length <= 1;
  // Two columns leave a name about 320px: a size down and tighter gaps so "Washington Commanders" is not clipped.
  const rowFont = portrait ? (showSecondary ? 28 : 26) : 24;
  const rowGap = showSecondary ? 14 : 10;
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: portrait ? "56px 60px 0" : "40px 56px 0", background: "linear-gradient(135deg, #0b1324 0%, #121c33 100%)", color: "#eef1f7", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", flexDirection: "column", height: frame.top - (portrait ? 56 : 40) }}>
        <div style={{ fontSize: portrait ? 28 : 24, color: "#9aa5bd", textTransform: "uppercase", letterSpacing: 4 }}>{kicker}</div>
        <div style={{ fontSize: portrait ? 68 : 52, fontWeight: 800, letterSpacing: -2, lineHeight: 1.1 }}>{title}</div>
      </div>
      <div style={{ display: "flex", flex: 1, gap: COLUMN_GAP }}>
        {columns.map((sections, ci) => (
          <div key={ci} style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
            {sections.map((s) => (
              <div key={s.title} style={{ display: "flex", flexDirection: "column" }}>
                {headed && <div style={{ display: "flex", alignItems: "center", height: frame.head, fontSize: portrait ? 24 : 20, fontWeight: 700, color: "#c6f135", textTransform: "uppercase", letterSpacing: 2 }}>{s.title}</div>}
                {s.rows.map((r) => (
                  <div key={r.position + r.name} style={{ display: "flex", alignItems: "center", height: frame.row, gap: rowGap, borderTop: "1px solid #24314f", fontSize: rowFont }}>
                    <div style={{ display: "flex", width: showSecondary ? 34 : 30, color: "#9aa5bd", fontWeight: 700 }}>{r.position}</div>
                    {r.dot && <div style={{ display: "flex", width: 14, height: 14, borderRadius: 7, background: r.dot, border: "1px solid #3a4a6b" }} />}
                    <div style={{ display: "flex", flex: 1, minWidth: 0, fontWeight: 700, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{r.name}</div>
                    <div style={{ display: "flex", fontWeight: 800 }}>{r.primary}</div>
                    {showSecondary && r.secondary !== undefined && <div style={{ display: "flex", width: portrait ? 120 : 100, justifyContent: "flex-end", color: "#9aa5bd" }}>{r.secondary}</div>}
                  </div>
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: frame.bottom, fontSize: portrait ? 22 : 20, color: "#9aa5bd" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#c6f135", fontWeight: 700 }}>
          <PixelBall size={26} fill="#ffffff" live="#c6f135" />
          SportsDB
        </div>
        <div style={{ display: "flex" }}>{note}</div>
      </div>
    </div>
  );
}
