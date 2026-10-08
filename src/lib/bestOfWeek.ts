// "Best of this week" on the first-visit homepage: up to six standout performances from results stored in the last
// seven days, across sports, each linked to the page that shows the same figure. This file holds the rules that turn
// stored rows into facts and the facts into cards (pure: no database, no clock of its own); the reads are in
// bestOfWeekData.ts. Fact selection is the same as "Today in three lines" (threeLines.ts selectLines: strongest first,
// one per sport before any second, never two on the same page), over a longer window.
//
// What counts as standout is a fixed bar, not a ranking of everything: a hundred or a five-for in cricket, a hat-trick
// in football, 40 points in the NBA, 400 passing yards in the NFL, and a team's winning or unbeaten run (the claim
// printed in its page header). Anything that does not clear its bar is not here, so a quiet week is a short module or
// no module, never a padded one.
import { LEAGUE_LABEL, type League } from "./leagues";
import { factWeight, pickSportOf, selectLines, type FactFollow, type LineFact } from "./threeLines";
import { isSportPick, SPORT_PICKS, SPORT_PICK_LABEL } from "./sportPicks";
import { isLeague } from "./leagues";
import { teamDisplayName } from "./teamName";

export const WEEK_HOURS = 7 * 24;
export const BEST_MAX = 6;

export const HAT_TRICK = 3;
export const FORTY_POINTS = 40;
export const PASSING_BAR = 400;

/** A fact plus the line "not recorded" where the scorecard left a detail out. */
export type BestFact = LineFact & { note?: string };

/** One player's line in one finished game, as read from the stored box score. */
export interface PlayerGameRow {
  league: string;
  gameId: string;
  playerId: string;
  /** The player's page slug, for the card's Follow. */
  playerSlug?: string | null;
  playerName: string;
  teamName: string;
  opponentName: string;
  /** Goals / points / passing yards, per `kind`. */
  value: number;
  kind: "hat-trick" | "forty-points" | "passing-yards";
  at: Date;
}

export function playerGameFacts(rows: PlayerGameRow[]): BestFact[] {
  const out: BestFact[] = [];
  for (const r of rows) {
    if (!Number.isFinite(r.value)) continue;
    const side = `${teamDisplayName(r.teamName)} against ${teamDisplayName(r.opponentName)}`;
    const sportFamily = r.kind === "hat-trick" ? "soccer" : r.kind === "forty-points" ? "nba" : "nfl";
    const pick = pickSportOf(sportFamily);
    const follow: FactFollow | undefined = pick ? { sport: pick, ...(r.playerSlug && isLeague(r.league) ? { block: { type: "player-form" as const, params: { league: r.league, player: r.playerSlug }, label: `${r.playerName}: last five` } } : {}) } : undefined;
    const base = { league: r.league, href: `/${r.league}/games/${r.gameId}`, at: r.at.toISOString(), id: `${r.kind}:${r.league}:${r.gameId}:${r.playerId}`, ...(follow ? { follow } : {}) };
    if (r.kind === "hat-trick" && r.value >= HAT_TRICK) {
      const figure = `${r.value} goals`;
      out.push({ ...base, sport: "soccer", kind: r.kind, figure, text: `${r.playerName} scored ${figure} for ${side}.`, weight: factWeight("hat-trick", r.value) });
    } else if (r.kind === "forty-points" && r.value >= FORTY_POINTS) {
      const figure = `${r.value} points`;
      out.push({ ...base, sport: "nba", kind: r.kind, figure, text: `${r.playerName} scored ${figure} for ${side}.`, weight: factWeight("forty-points", r.value) });
    } else if (r.kind === "passing-yards" && r.value >= PASSING_BAR) {
      const figure = `${r.value} yards`;
      out.push({ ...base, sport: "nfl", kind: r.kind, figure, text: `${r.playerName} threw for ${figure} for ${side}.`, weight: factWeight("passing-yards", r.value) });
    }
  }
  return out;
}

/** The cards: the week's facts chosen by the three-lines rules over seven days. */
export function selectBest(facts: BestFact[], now: Date): BestFact[] {
  return selectLines(facts, now, { max: BEST_MAX, maxAgeHours: WEEK_HOURS });
}

/** How long ago, in elapsed time: never a calendar day the reader's clock could disagree about. */
export function ageLabel(at: string, now: Date): string {
  const hours = Math.max(0, (now.getTime() - new Date(at).getTime()) / 3_600_000);
  if (hours < 24) return "In the last 24 hours";
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}

/** The competition shown on a card: the league's name, "Cricket" for a series match outside the archived competitions. */
export function competitionLabel(fact: Pick<LineFact, "league" | "sport">): string {
  if (fact.league && fact.league in LEAGUE_LABEL) return LEAGUE_LABEL[fact.league as League];
  return fact.sport === "cricket" ? "Cricket" : fact.sport.toUpperCase();
}

/** The detail line for a cricket hundred whose balls faced were not recorded. */
export const BALLS_NOT_RECORDED = "Balls faced: not recorded";

/** The sport a card belongs to for the filter chips: its picker sport, else the family it came from. */
export function chipKey(fact: Pick<LineFact, "sport">): string {
  return pickSportOf(fact.sport) ?? fact.sport;
}

export interface BestChip {
  key: string;
  label: string;
}

/** "All" first, then one chip per sport that has a card, in the picker's order (sports outside it follow, alphabetically). Only sports that appear. */
export function bestChips(facts: Pick<LineFact, "sport">[]): BestChip[] {
  const present = new Set(facts.map(chipKey));
  const known = SPORT_PICKS.filter((s) => present.has(s)).map((s) => ({ key: s as string, label: SPORT_PICK_LABEL[s] }));
  const other = [...present].filter((k) => !isSportPick(k)).sort().map((k) => ({ key: k, label: k.toUpperCase() }));
  return [{ key: "all", label: "All" }, ...known, ...other];
}

/** Whether a card shows under the chosen chip. "all" shows everything. */
export function chipShows(fact: Pick<LineFact, "sport">, chip: string): boolean {
  return chip === "all" || chipKey(fact) === chip;
}
