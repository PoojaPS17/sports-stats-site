// Qualification and relegation bands of a soccer table. Pure (no database), shared by the standings
// table, its share image and the season summary.
//
// Two sources, by whether the season is over:
//   - A season in progress is banded by position: the allocation as it stands at the start of the
//     season. ESPN's own per-row note for the current season looks like last year's allocation (La
//     Liga shows five Champions League places where the BBC shows four), so it is not used.
//   - A finished season is banded from each row's own stored ESPN note (`standings.zone`), because
//     the allocation differs from year to year (an Europa League winner brings a fifth Champions
//     League place, a cup winner an extra European place, the Conference League only exists since
//     2021). A finished table with no notes falls back to the positional rule.
import type { StandingRow } from "./queries";
import { isCupCompetition, isSoccerLeague, type League } from "./leagues";
import { notStarted, tableComplete } from "./standingsOrder";

export interface Zone {
  /** One of the `.zone-N` classes in globals.css. */
  cls: string;
  label: string;
}

const CHAMPIONS: Zone = { cls: "zone-1", label: "Champions League" };
const EUROPA: Zone = { cls: "zone-2", label: "Europa League" };
const CONFERENCE: Zone = { cls: "zone-4", label: "Conference League" };
const RELEGATION: Zone = { cls: "zone-3", label: "Relegation" };
const RELEGATION_PLAYOFF: Zone = { cls: "zone-2", label: "Relegation play-off" };

/** Shown under the legend of a table still being played. */
export const UPCOMING_CAPTION = "Qualification places as at the start of the season; cup results can change them.";

// The leagues whose sixth place is a Conference League place at the start of the season (the BBC's
// tables mark it). The Premier League's depends on the cups, so it has none.
const CONFERENCE_AT_SIXTH: League[] = ["laliga", "seriea", "bundesliga"];

/**
 * The band of a table position (1-based), or null when the shape has no rule. Domestic leagues: a
 * full table only (20 teams, or the Bundesliga's 18 with its relegation play-off place), so a
 * partial table isn't mislabelled. Champions League: the 36-team league phase (top eight straight
 * to the round of 16, ninth to 24th into the playoffs, the rest out) or a four-team group from the
 * old format (top two through, third to the Europa League). Any other shape gets no zones rather
 * than a guess. `finished` is the fallback for a finished table with no notes: the older rule
 * without a Conference League band (that competition did not exist for most of the history).
 */
export function zoneRules(league: League, total: number, finished = false): ((position: number) => Zone | null) | null {
  if (league === "ucl") {
    if (total === 36) return (p) => (p <= 8 ? { cls: "zone-1", label: "Round of 16" } : p <= 24 ? { cls: "zone-2", label: "Knockout playoffs" } : { cls: "zone-3", label: "Eliminated" });
    if (total === 4) return (p) => (p <= 2 ? { cls: "zone-1", label: "Round of 16" } : p === 3 ? { cls: "zone-2", label: "Europa League" } : { cls: "zone-3", label: "Eliminated" });
    return null;
  }
  const conference = !finished && CONFERENCE_AT_SIXTH.includes(league);
  if (league === "bundesliga") {
    if (total !== 18) return null;
    return (p) => (p <= 4 ? CHAMPIONS : p === 5 ? EUROPA : p === 6 && conference ? CONFERENCE : p === 16 ? RELEGATION_PLAYOFF : p >= 17 ? RELEGATION : null);
  }
  if (total !== 20) return null;
  return (p) => (p <= 4 ? CHAMPIONS : p === 5 ? EUROPA : p === 6 && conference ? CONFERENCE : p >= 18 ? RELEGATION : null);
}

export function legendFor(league: League, total: number, finished = false): Zone[] {
  const rules = zoneRules(league, total, finished);
  if (!rules) return [];
  const seen = new Map<string, Zone>();
  for (let p = 1; p <= total; p++) {
    const z = rules(p);
    if (z && !seen.has(z.label)) seen.set(z.label, z);
  }
  return [...seen.values()];
}

/**
 * The band ESPN's note describes, or null for a blank note or wording that is not one of them.
 * The distinct notes for the four domestic leagues from 2015 to 2026 (tests/fixtures/espn-zone-notes.json):
 * "Champions League", "Champions League qualifying", "Europa League", "Europa League qualifying",
 * "Europa League playoffs", "Conference League qualifying", "Europa Conference League",
 * "Europa Conference League qualifying", "Conference League Playoff Round", "Relegation",
 * "Relegated", "Relegation playoff", "Relegation via playoffs", "Relegated via playoff".
 * A "qualifying" or play-off wording is kept in the label, so a place ESPN calls "Champions League
 * qualifying" is not shown as a straight Champions League place.
 */
export function zoneFromNote(description: string | null | undefined): Zone | null {
  const t = description?.trim().toLowerCase();
  if (!t) return null;
  const qualifying = /qualif|play-?off/.test(t);
  if (t.includes("conference league")) {
    return { cls: CONFERENCE.cls, label: /play-?off round/.test(t) ? "Conference League playoff round" : qualifying ? "Conference League qualifying" : CONFERENCE.label };
  }
  if (t.includes("europa league")) return { cls: EUROPA.cls, label: qualifying ? "Europa League qualifying" : EUROPA.label };
  if (t.includes("champions league")) return { cls: CHAMPIONS.cls, label: qualifying ? "Champions League qualifying" : CHAMPIONS.label };
  // "Relegated" (past tense: the outcome is known) is a relegation, even "Relegated via playoff" (Serie A
  // 2022-23 Spezia, who lost the play-off and went down). Only a place, "Relegation playoff(s)" or
  // "Relegation via playoffs", is the play-off band.
  if (t.includes("relegated")) return RELEGATION;
  if (t.includes("relegat")) return /play-?off/.test(t) ? RELEGATION_PLAYOFF : RELEGATION;
  return null;
}

/**
 * The bands of a finished table's rows from their notes, one per row (null for none). The Bundesliga's
 * 16th place plays a relegation play-off every season, but ESPN notes it in only some (2018, 2020,
 * 2025), so once the table carries relegation notes at all a 16th that is not itself relegated is
 * banded as the play-off: the table, its legend and the season summary then agree.
 */
function bandsFromNotes(league: League, rows: StandingRow[]): (Zone | null)[] {
  const noted = rows.map((r) => zoneFromNote(r.zone));
  const hasRelegation = noted.some((z) => z?.label === RELEGATION.label || z?.label === RELEGATION_PLAYOFF.label);
  if (league === "bundesliga" && rows.length === 18 && hasRelegation && noted[15]?.label !== RELEGATION.label) noted[15] = RELEGATION_PLAYOFF;
  return noted;
}

export interface TableZones {
  /** The band of row `index` of `rows` (one table), or null. */
  zoneAt: (rows: StandingRow[], index: number) => Zone | null;
  /** Exactly the bands that appear, in table order. */
  legend: Zone[];
  /** A note for under the legend, or null. */
  caption: string | null;
}

/**
 * How to band the tables of a soccer standings list, or null for no bands at all (a table nobody
 * has played in, a shape with no rule, a league that is not soccer). See the top of the file for
 * which season gets which source.
 */
export function zonesFor(league: League, sections: [string, StandingRow[]][]): TableZones | null {
  if (!isSoccerLeague(league) || sections.length === 0) return null;
  const size = sections[0][1].length;
  // Zones are places in a table; a table nobody has played in has none. Zones apply per section (a
  // cup's groups are four-team tables of their own).
  if (!sections.every(([, rows]) => rows.length === size && !notStarted(rows))) return null;

  const domestic = !isCupCompetition(league);
  let finished = false;
  if (domestic && sections.length === 1) {
    const rows = sections[0][1];
    finished = tableComplete(rows);
    if (finished) {
      const noted = bandsFromNotes(league, rows);
      if (noted.some((z) => z !== null)) {
        const legend = new Map<string, Zone>();
        for (const z of noted) if (z && !legend.has(z.label)) legend.set(z.label, z);
        return { zoneAt: (r, i) => (r === rows ? noted : bandsFromNotes(league, r))[i] ?? null, legend: [...legend.values()], caption: null };
      }
    }
  }

  const rules = zoneRules(league, size, finished);
  if (!rules) return null;
  const legend = legendFor(league, size, finished);
  return { zoneAt: (rows, i) => (rows[i]?.unranked ? null : rules(i + 1)), legend, caption: domestic && !finished && legend.length > 0 ? UPCOMING_CAPTION : null };
}

/**
 * Who went down at the end of a finished domestic season, and who is in a relegation play-off.
 * The stored notes decide when the season has any relegation note (Serie A 2022-23: Spezia, ESPN's
 * "Relegated via playoff", went down with Cremonese and Sampdoria); otherwise the league's rule: three
 * clubs in the Premier League, La Liga and Serie A; two in the Bundesliga, whose 16th-placed club plays
 * a play-off and is not relegated yet. The table's bands use the same notes, so they agree.
 */
export function relegationSummary<T extends StandingRow>(league: League, standings: T[]): { relegated: T[]; playoff: T[] } {
  const bundesliga = league === "bundesliga";
  const noted = bandsFromNotes(league, standings);
  if (noted.some((z) => z?.label === RELEGATION.label || z?.label === RELEGATION_PLAYOFF.label)) {
    return { relegated: standings.filter((_, i) => noted[i]?.label === RELEGATION.label), playoff: standings.filter((_, i) => noted[i]?.label === RELEGATION_PLAYOFF.label) };
  }
  const down = bundesliga ? 2 : 3;
  return { relegated: standings.slice(-down), playoff: bundesliga && standings.length > down ? [standings[standings.length - down - 1]] : [] };
}

/** The number of clubs in each domestic league's table, which the positional rules above assume. */
export const DOMESTIC_TABLE_SIZE: Partial<Record<League, number>> = { epl: 20, laliga: 20, seriea: 20, bundesliga: 18 };

/**
 * How many places of a domestic league's table the start-of-season bands give the Champions League,
 * direct relegation, and a relegation play-off (the Bundesliga's 16th): the same rule the table
 * bands by, so the projections page words its columns the way the table shades them. Null for a
 * league with no such table.
 */
export function placeCounts(league: League): { champions: number; relegation: number; relegationPlayoff: number } | null {
  const size = DOMESTIC_TABLE_SIZE[league];
  const rules = size ? zoneRules(league, size) : null;
  if (!size || !rules) return null;
  const counts = { champions: 0, relegation: 0, relegationPlayoff: 0 };
  for (let p = 1; p <= size; p++) {
    const label = rules(p)?.label;
    if (label === CHAMPIONS.label) counts.champions++;
    else if (label === RELEGATION.label) counts.relegation++;
    else if (label === RELEGATION_PLAYOFF.label) counts.relegationPlayoff++;
  }
  return counts;
}
