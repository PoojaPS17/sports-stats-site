// Best-of playoff series, read from the game rows themselves.
//
// ESPN lists every game a series could need ("ALDS - Game 4 If Necessary", "NLDS - Game 5 If Necessary") the day the
// series is drawn up and does not remove the unneeded ones once a side has clinched; our scrapers never delete a row.
// A swept series therefore keeps Scheduled 0-0 rows that will never be played. This file is the one rule for them:
// pure functions over rows, no database, used by every surface that lists upcoming games.
//
// The rule: games are grouped into a series by league, season and the unordered pair of teams (two teams meet once in
// one postseason). The round's name gives the format (MLB: wild card best-of-3, division series best-of-5,
// championship series and World Series best-of-7; NBA: every round best-of-7). A series is decided when exactly one
// team has won the clinching number of its completed games. A game that is not finished and not in play, in a decided
// series, is "not needed". Nothing else is ever hidden: an unfinished series, a round whose format is not known, and
// a game in play or already played are all left alone.
import { normalizeStage } from "./stage";

/** The columns of a game the series rules read. */
export interface SeriesGame {
  league: string;
  espn_id: string;
  season_year: number | null;
  round: string | null;
  completed: boolean;
  status_state: string | null;
  home_team_espn_id: string;
  away_team_espn_id: string;
  home_winner: boolean | null;
  away_winner: boolean | null;
  home_score: number | null;
  away_score: number | null;
  /** Team abbreviations, used only to resolve a "CLE/CHW" placeholder side to the team that won that series. */
  home_abbr?: string | null;
  away_abbr?: string | null;
}

export interface ParsedRound {
  /** The round's full name as the site writes it ("AL Division Series"), the same whichever spelling ESPN used. */
  round: string;
  game: number;
  ifNecessary: boolean;
}

/** "ALDS - Game 4 If Necessary" -> AL Division Series, game 4, if necessary. Null for any round that is not one game of a series. */
export function parseSeriesRound(raw: string | null | undefined): ParsedRound | null {
  const m = /^(.*?)\s*[-–—]\s*game\s*(\d+)\b(.*)$/i.exec((raw ?? "").trim());
  if (!m || !m[1]) return null;
  const game = Number(m[2]);
  if (!Number.isInteger(game) || game < 1) return null;
  const prefix = m[1].trim();
  return { round: normalizeStage(prefix) ?? prefix, game, ifNecessary: /if\s+necessary/i.test(m[3]) };
}

/**
 * How many games a series is the best of, from the league and the round's name; null when it is not known (which
 * keeps every game of that round on show). Confirmed against the stored rounds 2023-2026: every MLB wild card series
 * ended with a side on 2 wins, every division series on 3, every championship series and World Series on 4; every
 * NBA series on 4.
 */
export function seriesLength(league: string, round: string): number | null {
  if (league === "mlb") {
    if (/wild\s*card/i.test(round)) return 3;
    if (/division\s+series/i.test(round)) return 5;
    if (/championship\s+series|world\s+series/i.test(round)) return 7;
    return null;
  }
  if (league === "nba") return 7;
  return null;
}

/** Wins that clinch a best-of-`length` series. */
export const winsNeeded = (length: number): number => Math.floor(length / 2) + 1;

export interface SeriesState {
  key: string;
  league: string;
  season_year: number;
  round: string;
  /** Best-of length. */
  length: number;
  needed: number;
  /** Team ids, in the order first seen. */
  teams: [string, string];
  wins: Record<string, number>;
  /** The team with the clinching wins, null while the series is open. */
  winner: string | null;
  loser: string | null;
  /** "3-0": the winner's wins first. Null while open. */
  score: string | null;
}

/** The series a game belongs to, or null for a game that is not one game of a known best-of series. */
export function seriesKeyOf(g: Pick<SeriesGame, "league" | "season_year" | "round" | "home_team_espn_id" | "away_team_espn_id">): string | null {
  if (g.season_year == null) return null;
  const parsed = parseSeriesRound(g.round);
  if (!parsed || seriesLength(g.league, parsed.round) == null) return null;
  const [a, b] = [g.home_team_espn_id, g.away_team_espn_id].sort();
  return `${g.league}|${g.season_year}|${a}|${b}`;
}

/** The team that won a finished game, null for a game not finished or with no winner. */
export function gameWinner(g: Pick<SeriesGame, "completed" | "home_team_espn_id" | "away_team_espn_id" | "home_winner" | "away_winner" | "home_score" | "away_score">): string | null {
  if (!g.completed) return null;
  if (g.home_winner === true && g.away_winner !== true) return g.home_team_espn_id;
  if (g.away_winner === true && g.home_winner !== true) return g.away_team_espn_id;
  if (g.home_winner == null && g.away_winner == null && g.home_score != null && g.away_score != null && g.home_score !== g.away_score) {
    return g.home_score > g.away_score ? g.home_team_espn_id : g.away_team_espn_id;
  }
  return null;
}

/** Every series found in the rows, with its wins so far. A series whose rows disagree on the format is left out (nothing in it is ever hidden). */
export function seriesStates(games: readonly SeriesGame[]): Map<string, SeriesState> {
  const byKey = new Map<string, SeriesGame[]>();
  const seen = new Set<string>();
  for (const g of games) {
    const key = seriesKeyOf(g);
    if (!key) continue;
    const id = `${g.league}:${g.espn_id}`;
    if (seen.has(id)) continue;
    seen.add(id);
    (byKey.get(key) ?? byKey.set(key, []).get(key)!).push(g);
  }
  const out = new Map<string, SeriesState>();
  for (const [key, rows] of byKey) {
    const lengths = new Set(rows.map((g) => seriesLength(g.league, parseSeriesRound(g.round)!.round)));
    if (lengths.size !== 1) continue;
    const length = [...lengths][0]!;
    const needed = winsNeeded(length);
    const [league, season, a, b] = key.split("|");
    const wins: Record<string, number> = { [a]: 0, [b]: 0 };
    for (const g of rows) {
      const w = gameWinner(g);
      if (w && w in wins) wins[w] += 1;
    }
    // Exactly one side on the clinching count is a result; both is a data fault, and the series stays open.
    const clinched = [a, b].filter((t) => wins[t] >= needed);
    const winner = clinched.length === 1 ? clinched[0] : null;
    const loser = winner ? (winner === a ? b : a) : null;
    out.set(key, {
      key,
      league,
      season_year: Number(season),
      round: parseSeriesRound(rows[0].round)!.round,
      length,
      needed,
      teams: [a, b],
      wins,
      winner,
      loser,
      score: winner && loser ? `${wins[winner]}-${wins[loser]}` : null,
    });
  }
  return out;
}

export interface NotNeeded {
  series: SeriesState;
  /** The team that won the series. */
  winner: string;
  /** "3-0" */
  score: string;
}

/** True for a game that is still on the schedule: not finished, not in play. */
const isStillToPlay = (g: Pick<SeriesGame, "completed" | "status_state">): boolean => !g.completed && g.status_state !== "in";

/**
 * The games that will not be played because their series is already decided, keyed `league:espn_id`. `games` must
 * hold the whole series (its finished games as well), not just the upcoming ones.
 */
export function notNeededGames(games: readonly SeriesGame[]): Map<string, NotNeeded> {
  const states = seriesStates(games);
  const out = new Map<string, NotNeeded>();
  for (const g of games) {
    if (!isStillToPlay(g)) continue;
    const key = seriesKeyOf(g);
    const s = key ? states.get(key) : undefined;
    if (s?.winner && s.score) out.set(`${g.league}:${g.espn_id}`, { series: s, winner: s.winner, score: s.score });
  }
  return out;
}

/** The sentence a game page and a list note give for a game that will not be played. */
export const notPlayedText = (n: Pick<NotNeeded, "score">): string => `Not played: series decided ${n.score}`;

// ---------------------------------------------------------------- placeholder sides

/** ESPN's stand-in for a side whose series is still being played: a team named, abbreviated and slugged "CLE/CHW". */
const PLACEHOLDER = /^([A-Z]{2,4})\/([A-Z]{2,4})$/;

/**
 * SQL for "this team row is a placeholder": the same test as `placeholderParts`, for a query that has to leave such
 * rows out of a list of clubs (`not (...)`) or name them (see TEAM_NAME_SQL in lib/queries.ts).
 */
export const isPlaceholderTeamSql = (alias: string): string => `coalesce(${alias}.abbreviation, '') ~ '^[A-Z]{2,4}/[A-Z]{2,4}$'`;

/** The two abbreviations of a "CLE/CHW" placeholder, null for any real team. */
export function placeholderParts(abbreviation: string | null | undefined): [string, string] | null {
  const m = PLACEHOLDER.exec((abbreviation ?? "").trim());
  return m ? [m[1], m[2]] : null;
}

/** What the site calls a placeholder side: "Winner of CLE-CHW". The SQL in lib/queries.ts writes the same text. */
export function placeholderName(abbreviation: string | null | undefined): string | null {
  const p = placeholderParts(abbreviation);
  return p ? `Winner of ${p[0]}-${p[1]}` : null;
}

/** True for the display name placeholderName writes (the neutral logo keys off it). */
export const isPlaceholderName = (name: string | null | undefined): boolean => /^Winner of [A-Z]{2,4}-[A-Z]{2,4}$/.test(name ?? "");

/**
 * For each decided series in the rows, the winning team's id under both spellings of the placeholder ("CLE/CHW" and
 * "CHW/CLE"), so a round that is waiting on that series can show the team that came through.
 */
export function placeholderWinners(games: readonly SeriesGame[]): Map<string, string> {
  const abbr = new Map<string, string>();
  for (const g of games) {
    if (g.home_abbr) abbr.set(g.home_team_espn_id, g.home_abbr);
    if (g.away_abbr) abbr.set(g.away_team_espn_id, g.away_abbr);
  }
  const out = new Map<string, string>();
  for (const s of seriesStates(games).values()) {
    if (!s.winner) continue;
    const [x, y] = [abbr.get(s.teams[0]), abbr.get(s.teams[1])];
    if (!x || !y) continue;
    out.set(`${x}/${y}`, s.winner);
    out.set(`${y}/${x}`, s.winner);
  }
  return out;
}
