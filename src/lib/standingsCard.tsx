import type { ReactElement } from "react";
import { groupStandings } from "@/components/StandingsTable";
import { hasTies } from "@/lib/leagues";
import { LEAGUE_LABEL, type League, type StandingRow } from "@/lib/queries";
import { CHART_CARD_SIZES, chartCardElement, fitSections, type ChartCardFormat, type ChartRow, type FittedSection } from "@/lib/chartCard";

export type StandingsCardFormat = ChartCardFormat;
export const STANDINGS_CARD_SIZES = CHART_CARD_SIZES;

/** Most rows one group shows when the league has several (a division, a conference), and when it is one table. */
const GROUP_ROWS = 5;
const TABLE_ROWS = 20;

export type CardSection = FittedSection<CardRow>;

export interface CardRow {
  /** Null in a preseason table: exhibition records seed nobody. */
  position: number | null;
  name: string;
  color: string;
  /** The figure the table is ordered by: points in football and cricket, the record elsewhere. */
  primary: string;
  secondary: string;
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

function cardRow(league: League, mode: "soccer" | "cricket" | "default", r: StandingRow, position: number | null): CardRow {
  const base = { position, name: r.name, color: dotColor(r.color) };
  if (mode === "soccer") return { ...base, primary: String(r.points ?? "-"), secondary: `${r.wins}-${r.draws ?? 0}-${r.losses}` };
  if (mode === "cricket") return { ...base, primary: String(r.points ?? "-"), secondary: `${r.wins}-${r.losses}` };
  const record = hasTies(league) && r.draws ? `${r.wins}-${r.losses}-${r.draws}` : `${r.wins}-${r.losses}`;
  return { ...base, primary: record, secondary: pct(r.win_percent) };
}

/**
 * Which rows of which tables fit the image, in the order they are drawn: left column first. A league with several
 * groups shows the top of each as far as the height allows, a single table shows as many rows as fit.
 */
export function layoutStandings(league: League, standings: StandingRow[], format: StandingsCardFormat): { columns: CardSection[][]; hiddenGroups: number } {
  const { mode, sections } = groupStandings(league, standings);
  const rows: [string, CardRow[]][] = sections.map(([title, list]) => [title, list.map((r, i) => cardRow(league, mode, r, r.preseason ? null : i + 1))]);
  // A single table needs no heading of its own: the title over it already names the league.
  return fitSections(rows, format, { cap: sections.length > 1 ? GROUP_ROWS : TABLE_ROWS, columnCount: sections.length > 1 ? 2 : 1, headed: sections.length > 1 });
}

/** The standings as a picture: the same groups and order as the page, the top of each, on the navy share-card frame. */
export function standingsCardElement({ league, standings, subtitle, format }: { league: League; standings: StandingRow[]; subtitle: string | null; format: StandingsCardFormat }): ReactElement {
  const { columns, hiddenGroups } = layoutStandings(league, standings, format);
  const headed = columns.flat().length > 1 || hiddenGroups > 0;
  const omitted = hiddenGroups > 0 || columns.some((c) => c.some((s) => s.hidden > 0));
  const drawn: FittedSection<ChartRow>[][] = columns.map((c) => c.map((s) => ({ ...s, rows: s.rows.map((r) => ({ position: r.position === null ? "–" : String(r.position), dot: r.color, name: r.name, primary: r.primary, secondary: r.secondary })) })));
  return chartCardElement({
    kicker: subtitle ?? "Standings",
    title: `${LEAGUE_LABEL[league]} standings`,
    note: omitted ? `Top of each table shown. Full standings at sports-db.live/${league}/standings` : `sports-db.live/${league}/standings`,
    format,
    columns: drawn,
    headed,
  });
}
