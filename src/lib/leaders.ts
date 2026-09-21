// The pure rules behind the league leader boards (the queries are in leaderQueries.ts): how equal figures are ordered
// and numbered, which players a top-N board lists when several are tied at the cutoff, the clubs a traded player is
// shown with, and which NBA figure (the box-score rows' or ESPN's own season row) a season's average is.
import type { EspnSeasonTotals } from "./espnSeason";
import { joinTeams } from "./teamName";

/** The most rows a board lists when a tie at the cutoff pulls extra players in. */
export const LEADER_CAP = 15;

export interface Rankable {
  player_espn_id: string;
  name: string;
  value: number;
  /** Breaks a tie in `value` (a scorer's assists, an average's unrounded figure); never changes the rank. */
  secondary?: number | null;
}

function compareLeaders(a: Rankable, b: Rankable): number {
  if (a.value !== b.value) return b.value - a.value;
  const sa = a.secondary ?? Number.NEGATIVE_INFINITY;
  const sb = b.secondary ?? Number.NEGATIVE_INFINITY;
  if (sa !== sb) return sb > sa ? 1 : -1;
  return a.name.localeCompare(b.name, "en") || (a.player_espn_id < b.player_espn_id ? -1 : a.player_espn_id > b.player_espn_id ? 1 : 0);
}

/** Best first: value, then the secondary figure, then name, then id, so no two runs order a tie differently. */
export function orderLeaders<T extends Rankable>(rows: readonly T[]): T[] {
  return [...rows].sort(compareLeaders);
}

/** Standard competition ranking of values already best first: equal values share a rank and the next rank skips
 * (1, 2, 2, 2, 5), the way the BBC and NBA.com number a tie. */
export function competitionRanks(values: readonly number[]): number[] {
  const ranks: number[] = [];
  values.forEach((v, i) => ranks.push(i > 0 && v === values[i - 1] ? ranks[i - 1] : i + 1));
  return ranks;
}

/** A board: the candidates ordered and ranked. With `ties`, every player whose rank is within `limit` is listed, so a
 * player tied with the last place is never dropped (a top ten can list eleven); the list is cut at `cap` (default
 * `LEADER_CAP`, never below `limit`) and `omitted` says how many tied players that left off. Without `ties` the list is
 * exactly `limit` rows. Players with no positive figure are never on a board. */
export function pickLeaders<T extends Rankable>(candidates: readonly T[], limit: number, opts: { ties?: boolean; cap?: number } = {}): { rows: (T & { rank: number })[]; omitted: number } {
  const ordered = orderLeaders(candidates.filter((c) => c.value > 0));
  const ranks = competitionRanks(ordered.map((r) => r.value));
  const ranked = ordered.map((r, i) => ({ ...r, rank: ranks[i] }));
  const eligible = opts.ties ? ranked.filter((r) => r.rank <= limit) : ranked.slice(0, limit);
  const cap = opts.ties ? Math.max(limit, opts.cap ?? LEADER_CAP) : limit;
  return { rows: eligible.slice(0, cap), omitted: Math.max(0, eligible.length - cap) };
}

export interface TeamStint {
  espn_id: string;
  name: string;
  slug: string;
  /** The date of the player's first counted game for this club in the season. */
  first_date: Date | string;
}

export interface SeasonTeam {
  espn_id: string;
  name: string;
  slug: string;
}

/** The clubs a player appeared for in a season, in the order he joined them (the order of the player page's season
 * table). One stint per club however many rows the club has; none for a player with no rows. */
export function seasonTeams(stints: readonly TeamStint[]): SeasonTeam[] {
  const first = new Map<string, TeamStint & { at: number }>();
  for (const s of stints) {
    const at = new Date(s.first_date).getTime();
    const seen = first.get(s.espn_id);
    if (!seen || at < seen.at) first.set(s.espn_id, { ...s, at });
  }
  return [...first.values()]
    .sort((a, b) => a.at - b.at || (a.espn_id < b.espn_id ? -1 : 1))
    .map(({ espn_id, name, slug }) => ({ espn_id, name, slug }));
}

/** "Boston Celtics / Philadelphia 76ers" for a traded player, the club's name for one club, null for none. */
export function teamsLabel(teams: readonly { name: string }[]): string | null {
  return teams.length > 0 ? joinTeams(teams) : null;
}

// ---------------------------------------------------------------------------
// NBA
// ---------------------------------------------------------------------------

/** One player's NBA season as the leader query counts it, from the box-score rows plus ESPN's stored season row. */
export interface NbaSeasonInputs {
  /** Rows with a stat line (the profile's `played`: a numeric MIN, or points above zero). */
  logged: number;
  /** Rows in games ESPN published no box score for (no player in the game has a stat line). */
  unrecorded: number;
  /** Points over the logged rows. */
  recordedPoints: number;
  /** Clubs the player has a logged or listed row for. */
  teams: number;
  /** ESPN's games played from the stored row (player_season_stats.games_played), when above zero. */
  storedGames: number | null;
  /** ESPN's stored season line when it is a whole readable row (`espnSeasonTotals`), else null. */
  espn: EspnSeasonTotals | null;
}

/** Whether the season's per-game figure is ESPN's own season row rather than an average of the box-score rows: ESPN
 * counts more games than are logged (its box scores are blank for some games, see the audit notes) and the row
 * passes the three guards the player page applies. This is the twin of `useEspn` in `buildProfile`
 * (playerProfile.ts): the leaders and the player page must always choose alike, and tests/leaders-db.test.ts holds them to it. */
export function usesEspnSeasonLine(i: NbaSeasonInputs): boolean {
  const { espn } = i;
  if (espn === null) return false;
  const rowCoversSeason = i.storedGames === null || espn.games >= i.storedGames;
  return rowCoversSeason && espn.games > i.logged && espn.pts >= i.recordedPoints && (i.teams <= 1 || espn.games >= i.logged + i.unrecorded);
}

export type NbaStat = "pts" | "reb" | "ast";

/** A season's per-game figure and games played for one stat, the way the player page builds the season line: ESPN's
 * total over ESPN's games when `usesEspnSeasonLine`, else the box rows' sum over the rows with a figure (`sum`, `n`).
 * Games: ESPN's when its row is used; otherwise the logged rows plus the games with no box score, or ESPN's stored
 * figure when there are such games (never below the logged rows). `exact` is unrounded; null when nothing averages. */
export function nbaPerGame(stat: NbaStat, i: NbaSeasonInputs & { sum: number; n: number }): { exact: number | null; games: number; source: "espn" | "box" } {
  if (i.espn !== null && usesEspnSeasonLine(i)) return { exact: i.espn[stat] / i.espn.games, games: i.espn.games, source: "espn" };
  const stored = i.unrecorded === 0 ? null : i.storedGames;
  return { exact: i.n > 0 ? i.sum / i.n : null, games: stored === null ? i.logged + i.unrecorded : Math.max(stored, i.logged), source: "box" };
}

/** Games a player needs for a per-game board: the NBA's 70% rule over the most games anyone has played so far. Integer
 * arithmetic on purpose: 0.7 x 10 is 7.000000000000001 in floating point and would ask for 8. */
export function nbaQualifyingGames(mostGames: number): number {
  return Math.ceil((7 * mostGames) / 10);
}

/** A per-game average to one decimal, rounded exactly as the player page's cell is (`formatStat`), so a board and a
 * page never show 27.6 against 27.7. */
export function roundLeaderAverage(v: number): number {
  return Number(v.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1, useGrouping: false }));
}
