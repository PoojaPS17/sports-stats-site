/* eslint-disable @typescript-eslint/no-explicit-any -- ESPN feed JSON has no published schema */
// How a cricket series is identified in `cricket_series` / `cricket_series_matches.series_espn_id`.
//
// ESPN's daily listing groups matches under a "league" whose id is the series id. A bilateral tour has a
// league id of its own ("India Women tour of Sri Lanka", 24046), but a recurring tournament (Big Bash League
// 8044, Women's Big Bash 21284, the IPL 8048, ...) keeps the same id every season, so keying by it merged every
// edition into one series. A tournament is therefore one series per edition, keyed `<league id>-<season>`
// ("8044-2025-26"): the season is the label ESPN's own event carries (notes[type=season], "2025/26" - the season
// Cricinfo files the edition under, which is not always the calendar year of the event: the 2026 T20 World Cup
// is 2025/26, while its numeric `season` field reads 2026).
//
// Pure (no database, no Next), so scripts, server code and Client Components can share it.

/** The ESPN league ids SportsDB archives with scorecards: editions whatever the listing's own tournament flag says. */
const ARCHIVED_LEAGUE_IDS = new Set(["8048", "8044", "8039", "8604", "21282", "21284", "8584", "8634"]);

/** The ESPN league id behind a series id: "8044-2025-26" and "8044" are both league 8044. Use it wherever the id is sent to ESPN. */
export function baseSeriesId(seriesId: string): string {
  const dash = seriesId.indexOf("-");
  return dash < 0 ? seriesId : seriesId.slice(0, dash);
}

/** An edition key ("8044-2025-26") rather than a bare ESPN league id. */
export function isEditionKey(seriesId: string): boolean {
  return seriesId.includes("-");
}

/** The edition label of a series id ("2025-26"), or null for a bare league id. */
export function editionLabel(seriesId: string): string | null {
  const dash = seriesId.indexOf("-");
  return dash < 0 ? null : seriesId.slice(dash + 1);
}

/** ESPN's season note ("2025/26", "2024") as an id-safe label ("2025-26", "2024"), or null when it is neither. */
function labelFromNote(text: unknown): string | null {
  const t = String(text ?? "").trim();
  const split = /^(\d{4})[/-](\d{2}|\d{4})$/.exec(t);
  if (split) return `${split[1]}-${split[2].slice(-2)}`;
  return /^\d{4}$/.test(t) ? t : null;
}

/**
 * The edition label in the event's link slug, when ESPN's season note is missing: match links end in the edition
 * ("...-big-bash-league-2025-26", "...-indian-premier-league-2024"), the same label the note gives, including for
 * the editions whose numeric `season` is the calendar year rather than the season ("...-icc-mens-t20-world-cup-2025-26").
 * Bilateral links end in a series id ("...-t20i-24046") and never match; a trailing year pair must be consecutive
 * ("2025-26") and a lone year plausible, or the slug is not read as an edition.
 */
function labelFromLink(link: unknown): string | null {
  if (typeof link !== "string") return null;
  const slug = link.split(/[?#]/)[0].split("/").filter(Boolean).pop() ?? "";
  const m = /-((?:19|20)\d{2})(?:-(\d{2}))?$/.exec(slug);
  if (!m) return null;
  const year = Number(m[1]);
  if (m[2] === undefined) return String(year);
  return Number(m[2]) === (year + 1) % 100 ? `${year}-${m[2]}` : null;
}

/** SQL: a series that is not a tournament, or has at least one stored match (`alias` is the cricket_series row). A tournament with no matches is an emptied row and is never listed. */
export const seriesHasPlaySql = (alias: string) =>
  `(not ${alias}.is_tournament or exists (select 1 from cricket_series_matches hp where hp.series_espn_id = ${alias}.espn_id))`;

/** True for a league whose id repeats every season, so its matches are filed per edition. */
export function isEditioned(lg: { id?: unknown; isTournament?: unknown }): boolean {
  return lg.isTournament === true || ARCHIVED_LEAGUE_IDS.has(String(lg.id ?? ""));
}

export interface SeriesEdition {
  /** The series id to store the match under. */
  id: string;
  /** "2025-26" / "2024" for a tournament edition; null for a series that is its own id. */
  label: string | null;
  edition: boolean;
}

/**
 * The series a listed match belongs to. `lg` is the listing's league object (id, isTournament), `ev` the event.
 * Tournaments (isTournament, or one of the archived competitions) are keyed per edition; anything else is its own series.
 */
export function seriesEdition(lg: { id?: unknown; isTournament?: unknown }, ev: any): SeriesEdition {
  const base = String(lg.id ?? "");
  if (!isEditioned(lg)) return { id: base, label: null, edition: false };
  const note = (Array.isArray(ev?.notes) ? ev.notes : []).find((n: any) => n?.type === "season");
  const season = Number(ev?.season);
  const dateYear = ev?.date ? new Date(ev.date).getUTCFullYear() : NaN;
  // The note, then the link's own edition suffix (both are ESPN's label for the edition), and only then a guess from the numeric
  // season or the date, which is the calendar year and so cannot tell "2025-26" from "2025".
  const label = labelFromNote(note?.text) ?? labelFromLink(ev?.link) ?? (Number.isInteger(season) && season > 1800 ? String(season) : Number.isFinite(dateYear) ? String(dateYear) : null);
  return label ? { id: `${base}-${label}`, label, edition: true } : { id: base, label: null, edition: false };
}

/** "Big Bash League" + "2025-26"; a name that already carries a year ("Asia Cup 2025") is left as ESPN wrote it. */
export function seriesTitle(name: string, label: string | null): string {
  if (!label || /\b(19|20)\d{2}\b/.test(name)) return name;
  return `${name} ${label}`;
}
