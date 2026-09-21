// What a cricket points table shows beyond the shared columns. Pure, so the standings page, its
// downloadable image and the tests read the same rules.
import type { League } from "./leagues";

interface CricketRecord {
  wins: number;
  losses: number;
  draws: number | null;
  no_result: number | null;
  qualified?: boolean | null;
}

/** Matches played: every result, ties included (ESPN's `matchesPlayed` is W + L + T + NR). */
export const cricketPlayed = (r: CricketRecord) => r.wins + r.losses + (r.draws ?? 0) + (r.no_result ?? 0);

/** A T column is shown only for a table in which some team has tied a match; most tables have none. */
export const hasCricketTies = (rows: CricketRecord[]) => rows.some((r) => (r.draws ?? 0) > 0);

/**
 * The Q marker: only for a season that is over (a team "qualified" mid-season is still playing for
 * position) and only when the feed flagged at least one team; a league whose feed has no such
 * stat shows nothing. A season is over once its Final has been played.
 */
export const showQualifiers = (rows: CricketRecord[], seasonFinished: boolean) => seasonFinished && rows.some((r) => r.qualified === true);

/** The season's Final is among the completed games that carry a round. */
export const seasonHasFinal = (games: { round: string | null }[]) => games.some((g) => /^final$/i.test((g.round ?? "").trim()));

const WORLD_CUPS: League[] = ["cwc", "t20wc", "wcwc", "wt20wc"];
/** The legend line printed under a table that carries Q markers. */
export const qualifierLegend = (league: League) => (WORLD_CUPS.includes(league) ? "Qualified for the next stage" : "Qualified for the playoffs");

/**
 * A cricket season record for a one-line summary: "9-4" (wins-losses), then any ties and no results in
 * words, so neither can be read as the other: "4-5, 1 tie, 1 NR". The table's W, L, T and NR columns
 * agree with it.
 */
export function cricketRecord(r: CricketRecord): string {
  const ties = r.draws ?? 0;
  const noResults = r.no_result ?? 0;
  return [`${r.wins}-${r.losses}`, ...(ties > 0 ? [`${ties} ${ties === 1 ? "tie" : "ties"}`] : []), ...(noResults > 0 ? [`${noResults} NR`] : [])].join(", ");
}
