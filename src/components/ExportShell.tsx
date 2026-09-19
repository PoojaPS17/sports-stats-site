import type { ReactNode } from "react";
import { ExportFooter } from "./ExportFooter";
import { LEAGUE_LABEL, type League } from "@/lib/queries";
import { CARD } from "@/lib/exportTheme";

/** Long lists on a card stop here, then say how many more there are on the site. */
export const EXPORT_ROW_LIMIT = 25;

export function ExportLabel({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: CARD.textMuted }}>{children}</div>;
}

// The frame every section image shares: white card, whatever header the section needs,
// its content, and the branded footer. Section cards only supply the middle.
export function ExportShell({ header, context, children }: { header: ReactNode; context: string; children: ReactNode }) {
  return (
    <div style={{ background: CARD.surface, border: `1px solid ${CARD.border}`, borderRadius: 16, padding: 24 }}>
      {header}
      <div style={{ marginTop: 16 }}>{children}</div>
      <ExportFooter context={context} />
    </div>
  );
}

// The heading block for cards that aren't about one match: an eyebrow (league or
// competition), the title, and a line saying what the numbers cover.
export function ExportTitle({ league, eyebrow, title, subtitle }: { league?: League; eyebrow?: string; title: string; subtitle?: string | null }) {
  const top = eyebrow ?? (league ? LEAGUE_LABEL[league] : null);
  return (
    <div>
      {top && <ExportLabel>{top}</ExportLabel>}
      <div style={{ marginTop: top ? 4 : 0, fontSize: 26, fontWeight: 800, lineHeight: 1.15, color: CARD.text }}>{title}</div>
      {subtitle && <div style={{ marginTop: 6, fontSize: 13, color: CARD.textMuted, lineHeight: 1.4 }}>{subtitle}</div>}
    </div>
  );
}

// The line that closes a capped list: "+ 12 more" keeps the image readable while being
// honest that the full list lives on the site.
export function ExportMore({ count, noun = "more", boxed = false }: { count: number; noun?: string; /** Its own rounded box, for a list that isn't inside a bordered table. */ boxed?: boolean }) {
  if (count <= 0) return null;
  const frame = boxed ? { marginTop: 10, border: `1px solid ${CARD.border}`, borderRadius: 10 } : { borderTop: `1px solid ${CARD.border}` };
  return (
    <div style={{ padding: "10px 12px", background: CARD.bg, fontSize: 13, fontWeight: 700, color: CARD.textMuted, textAlign: "center", ...frame }}>
      + {count} {noun}
    </div>
  );
}

/** First `limit` of `items` and how many were left out. */
export function capRows<T>(items: T[], limit: number = EXPORT_ROW_LIMIT): { shown: T[]; hidden: number } {
  return { shown: items.slice(0, limit), hidden: Math.max(0, items.length - limit) };
}

// A titled block inside a card ("Batting", "Substitutes used", a team's name, ...).
export function ExportGroup({ title, aside, children }: { title: ReactNode; aside?: ReactNode; children: ReactNode }) {
  return (
    <div style={{ border: `1px solid ${CARD.border}`, borderRadius: 12, overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, background: CARD.bg, padding: "8px 12px", fontSize: 13, fontWeight: 800, color: CARD.text }}>
        <span>{title}</span>
        {aside && <span style={{ fontWeight: 700 }}>{aside}</span>}
      </div>
      {children}
    </div>
  );
}

/** Colours for a cell's text: results, movement and the like. */
export const TONE = { win: CARD.win, loss: CARD.loss, muted: CARD.textMuted, strong: CARD.text } as const;

export type ExportCell = string | { text: ReactNode; tone?: keyof typeof TONE; bold?: boolean; background?: string };

export type ExportRow = {
  key: string;
  /** Position number shown before the name. */
  rank?: string | number;
  /** A logo, headshot or flag shown before the name. */
  lead?: ReactNode;
  name: ReactNode;
  note?: ReactNode;
  cells: ExportCell[];
  /** A thin coloured bar on the row's left edge (qualification / relegation zones). */
  marker?: string;
};

function renderCell(cell: ExportCell): { content: ReactNode; style: React.CSSProperties } {
  if (typeof cell === "string") return { content: cell, style: {} };
  return {
    content: cell.text,
    style: { color: cell.tone ? TONE[cell.tone] : undefined, fontWeight: cell.bold ? 800 : undefined, background: cell.background },
  };
}

// A stats table on the light card: a name column on the left (optionally with a
// position, a logo and a second line), the rest right-aligned numbers. `limit` caps a
// long table and closes it with "+ N more".
export function ExportTable({
  headers,
  rows,
  firstHeader = "Player",
  limit,
  moreNoun,
  bare = false,
  firstMinWidth,
}: {
  headers: string[];
  rows: ExportRow[];
  firstHeader?: string;
  limit?: number;
  moreNoun?: string;
  /** No outer border, for a table that sits inside an ExportGroup. */
  bare?: boolean;
  /** Keeps the name column from being squeezed by wide number columns when rows carry a note. */
  firstMinWidth?: number;
}) {
  const { shown, hidden } = limit ? capRows(rows, limit) : { shown: rows, hidden: 0 };
  const cell = { padding: "6px 8px", textAlign: "right" as const, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" as const };
  const ranked = shown.some((r) => r.rank !== undefined);
  return (
    <div style={bare ? undefined : { border: `1px solid ${CARD.border}`, borderRadius: 12, overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, color: CARD.text }}>
        <thead>
          <tr style={{ background: CARD.bg }}>
            <th style={{ ...cell, textAlign: "left", paddingLeft: 12, fontSize: 11, fontWeight: 700, color: CARD.textMuted }}>{firstHeader}</th>
            {headers.map((h) => (
              <th key={h} style={{ ...cell, fontSize: 11, fontWeight: 700, color: CARD.textMuted }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.key} style={{ borderTop: `1px solid ${CARD.border}` }}>
              <td style={{ ...cell, textAlign: "left", paddingLeft: 12, fontWeight: 600, whiteSpace: "normal", minWidth: firstMinWidth, boxShadow: r.marker ? `inset 4px 0 0 ${r.marker}` : undefined }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {ranked && <span style={{ minWidth: 20, textAlign: "right", fontSize: 12, fontWeight: 600, color: CARD.textMuted }}>{r.rank ?? ""}</span>}
                  {r.lead}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ whiteSpace: "nowrap" }}>{r.name}</div>
                    {r.note && <div style={{ fontSize: 11, fontWeight: 400, color: CARD.textMuted }}>{r.note}</div>}
                  </div>
                </div>
              </td>
              {r.cells.map((c, i) => {
                const { content, style } = renderCell(c);
                return (
                  <td key={i} style={{ ...cell, color: CARD.textMuted, ...style }}>
                    {content}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <ExportMore count={hidden} noun={moreNoun} />
    </div>
  );
}

export type ExportListRow = {
  key: string;
  rank?: string | number;
  lead?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  value: ReactNode;
  unit?: string;
};

// A ranked list ("Top scorers", "Longest winning streaks"): position, avatar, who and
// what, and the figure on the right. Used for leaderboards and record books.
export function ExportList({ rows, limit }: { rows: ExportListRow[]; limit?: number }) {
  const { shown, hidden } = limit ? capRows(rows, limit) : { shown: rows, hidden: 0 };
  return (
    <div>
      {shown.map((r, i) => (
        <div key={r.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderTop: i === 0 ? undefined : `1px solid ${CARD.border}` }}>
          <span style={{ minWidth: 18, textAlign: "right", fontSize: 12, fontWeight: i === 0 ? 800 : 600, color: i === 0 ? CARD.accent : CARD.textMuted }}>{r.rank ?? i + 1}</span>
          {r.lead}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: CARD.text }}>{r.title}</div>
            {r.sub && <div style={{ fontSize: 12, color: CARD.textMuted }}>{r.sub}</div>}
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, color: CARD.text, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
            {r.value}
            {r.unit && <span style={{ marginLeft: 4, fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: CARD.textFaint }}>{r.unit}</span>}
          </div>
        </div>
      ))}
      <ExportMore count={hidden} />
    </div>
  );
}
