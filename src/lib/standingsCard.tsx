import type { ReactElement } from "react";
import { PixelBall } from "@/components/Logo";
import { groupStandings } from "@/components/StandingsTable";
import { hasTies } from "@/lib/leagues";
import { LEAGUE_LABEL, type League, type StandingRow } from "@/lib/queries";

export type StandingsCardFormat = "og" | "portrait";

export const STANDINGS_CARD_SIZES: Record<StandingsCardFormat, { width: number; height: number }> = {
  og: { width: 1200, height: 630 },
  portrait: { width: 1080, height: 1350 },
};

// Pixels the frame itself takes (title block over the tables, footer under them), the height of a table's heading
// and of one row. The layout fits whole rows into what is left; nothing here is measured from the rendered image.
const FRAME = { og: { top: 150, bottom: 74, row: 40, head: 44 }, portrait: { top: 190, bottom: 90, row: 49, head: 52 } } as const;
const COLUMN_GAP = 40;
/** A heading with fewer rows under it than this is not worth drawing: the next column (or the omission note) takes it. */
const MIN_ROWS = 3;
/** Most rows one group shows when the league has several (a division, a conference), and when it is one table. */
const GROUP_ROWS = 5;
const TABLE_ROWS = 20;

export interface CardRow {
  position: number;
  name: string;
  color: string;
  /** The figure the table is ordered by: points in football and cricket, the record elsewhere. */
  primary: string;
  secondary: string;
}

export interface CardSection {
  title: string;
  rows: CardRow[];
  /** Rows of this group the image leaves out. */
  hidden: number;
}

/** A team colour as a CSS colour, or the muted grey when the feed sent none or sent something that is not a hex colour. */
export function dotColor(color: string | null | undefined): string {
  const hex = (color ?? "").replace(/^#/, "");
  return /^[0-9a-f]{6}$/i.test(hex) ? `#${hex}` : "#6b7690";
}

function pct(value: string): string {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(3).replace(/^0/, "") : "";
}

function cardRow(league: League, mode: "soccer" | "cricket" | "default", r: StandingRow, position: number): CardRow {
  const base = { position, name: r.name, color: dotColor(r.color) };
  if (mode === "soccer") return { ...base, primary: String(r.points ?? "-"), secondary: `${r.wins}-${r.draws ?? 0}-${r.losses}` };
  if (mode === "cricket") return { ...base, primary: String(r.points ?? "-"), secondary: `${r.wins}-${r.losses}` };
  const record = hasTies(league) && r.draws ? `${r.wins}-${r.losses}-${r.draws}` : `${r.wins}-${r.losses}`;
  return { ...base, primary: record, secondary: pct(r.win_percent) };
}

/**
 * Which rows of which tables fit the image, in the order they are drawn: left column first. A league with several
 * groups shows the top of each as far as the height allows, a single table shows as many rows as fit, and a group
 * that would get fewer than MIN_ROWS in the space left moves to the next column (or is left out when there is none).
 */
export function layoutStandings(league: League, standings: StandingRow[], format: StandingsCardFormat): { columns: CardSection[][]; hiddenGroups: number } {
  const { mode, sections } = groupStandings(league, standings);
  // A single table needs no heading of its own: the title over it already names the league.
  const frame = { ...FRAME[format], head: sections.length > 1 ? FRAME[format].head : 0 };
  const { height } = STANDINGS_CARD_SIZES[format];
  const budget = height - frame.top - frame.bottom;
  const cap = sections.length > 1 ? GROUP_ROWS : TABLE_ROWS;
  const columnCount = sections.length > 1 ? 2 : 1;
  const columns: CardSection[][] = [[]];
  let used = 0;
  let placed = 0;
  for (const [title, rows] of sections) {
    let fit = Math.min(rows.length, cap, Math.floor((budget - used - frame.head) / frame.row));
    if (fit < Math.min(MIN_ROWS, rows.length)) {
      if (columns.length >= columnCount) break;
      columns.push([]);
      used = 0;
      fit = Math.min(rows.length, cap, Math.floor((budget - frame.head) / frame.row));
      if (fit < Math.min(MIN_ROWS, rows.length)) break;
    }
    columns[columns.length - 1].push({ title, rows: rows.slice(0, fit).map((r, i) => cardRow(league, mode, r, i + 1)), hidden: rows.length - fit });
    used += frame.head + fit * frame.row;
    placed++;
  }
  return { columns, hiddenGroups: sections.length - placed };
}

/**
 * The standings as a picture: the same groups and order as the page, the top of each, on the navy share-card frame.
 * Every element with more than one child says `display: flex`, and every text is one string, which the renderer needs.
 */
export function standingsCardElement({ league, standings, subtitle, format }: { league: League; standings: StandingRow[]; subtitle: string | null; format: StandingsCardFormat }): ReactElement {
  const { columns, hiddenGroups } = layoutStandings(league, standings, format);
  const frame = FRAME[format];
  const headed = columns.flat().length > 1 || hiddenGroups > 0;
  // Two columns leave a name about 360px: the second figure is dropped so "Washington Commanders" is not clipped.
  const compact = columns.length > 1;
  const portrait = format === "portrait";
  const note = hiddenGroups > 0 || columns.some((c) => c.some((s) => s.hidden > 0)) ? `Top of each table shown. Full standings at sports-db.live/${league}/standings` : `sports-db.live/${league}/standings`;
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: portrait ? "56px 60px 0" : "40px 56px 0", background: "linear-gradient(135deg, #0b1324 0%, #121c33 100%)", color: "#eef1f7", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", flexDirection: "column", height: frame.top - (portrait ? 56 : 40) }}>
        <div style={{ fontSize: portrait ? 28 : 24, color: "#9aa5bd", textTransform: "uppercase", letterSpacing: 4 }}>{subtitle ?? "Standings"}</div>
        <div style={{ fontSize: portrait ? 68 : 52, fontWeight: 800, letterSpacing: -2, lineHeight: 1.1 }}>{`${LEAGUE_LABEL[league]} standings`}</div>
      </div>
      <div style={{ display: "flex", flex: 1, gap: COLUMN_GAP }}>
        {columns.map((sections, ci) => (
          <div key={ci} style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
            {sections.map((s) => (
              <div key={s.title} style={{ display: "flex", flexDirection: "column" }}>
                {headed && <div style={{ display: "flex", alignItems: "center", height: frame.head, fontSize: portrait ? 24 : 20, fontWeight: 700, color: "#c6f135", textTransform: "uppercase", letterSpacing: 2 }}>{s.title}</div>}
                {s.rows.map((r) => (
                  <div key={r.position} style={{ display: "flex", alignItems: "center", height: frame.row, gap: 14, borderTop: "1px solid #24314f", fontSize: portrait ? 28 : 24 }}>
                    <div style={{ display: "flex", width: 34, color: "#9aa5bd", fontWeight: 700 }}>{String(r.position)}</div>
                    <div style={{ display: "flex", width: 14, height: 14, borderRadius: 7, background: r.color, border: "1px solid #3a4a6b" }} />
                    <div style={{ display: "flex", flex: 1, minWidth: 0, fontWeight: 700, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{r.name}</div>
                    <div style={{ display: "flex", fontWeight: 800 }}>{r.primary}</div>
                    {!compact && <div style={{ display: "flex", width: portrait ? 120 : 100, justifyContent: "flex-end", color: "#9aa5bd" }}>{r.secondary}</div>}
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
