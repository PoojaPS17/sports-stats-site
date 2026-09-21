// How a standings table is ordered. Pure (no database), so the order can be tested on its own and
// shared by the standings pages, the team-history finishes and the compare page.
//
// The three families of competition order differently:
//   - Soccer and cricket: ESPN's own `rank` is the source of truth (it applies head-to-head and the
//     other tie-breaks a points table cannot see). Rows without a rank fall back to points,
//     goal difference, goals scored, net run rate, wins, fewer losses.
//   - NFL and NBA: win percentage (ESPN's figure already counts a tie as half a win), then playoff
//     seed, then wins. ESPN sends the NFL no `points` stat, so a points-first sort silently
//     becomes a point-differential sort and puts 8-9 Baltimore above 10-7 Pittsburgh.
//   - Anything else keeps the old keys.
// A rank is only ever compared between rows of the same table (same conference/group), never across.
import { isCricketLeague, isSoccerLeague, type League } from "./leagues";

/** The columns a position is worked out from; a StandingRow has all of them. */
export interface RankableStanding {
  team_espn_id: string;
  conference: string | null;
  wins: number;
  losses: number;
  draws: number | null;
  no_result: number | null;
  win_percent: string | number | null;
  playoff_seed: number | null;
  points: number | null;
  goals_for: number | null;
  goals_against: number | null;
  net_run_rate: string | number | null;
  rank: number | null;
}

/** What sortStandings needs: the name breaks a full tie so the order is always the same. */
export interface OrderableStanding extends RankableStanding {
  name: string;
  /** Set by sortStandings on every row of a table nobody has played in yet. */
  unranked?: boolean;
}

const usesEspnRank = (league: League) => isSoccerLeague(league) || isCricketLeague(league);
export const usesRecordOrder = (league: League) => league === "nfl" || league === "nba";

const num = (v: string | number | null | undefined): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// Compare two possibly-missing numbers; a missing one is always last, whichever way the rest goes.
function byNumber(a: number | null, b: number | null, dir: "asc" | "desc"): number {
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
  return dir === "asc" ? a - b : b - a;
}

const goalDifference = (r: RankableStanding) => (r.goals_for !== null && r.goals_against !== null ? r.goals_for - r.goals_against : null);

type Compare<T> = (a: T, b: T) => number;

/**
 * The order of two rows of one table, before any name tie-break. Zero means level on every key, which
 * is what a shared position means.
 * `scope: "league"` ranks across conferences (a team's league-wide finish), where playoff seeds from
 * different conferences are not comparable, so point differential takes their place.
 */
export function standingsComparator<T extends RankableStanding>(league: League, scope: "table" | "league" = "table"): Compare<T> {
  if (usesRecordOrder(league)) {
    return scope === "league"
      ? (a, b) => byNumber(num(a.win_percent), num(b.win_percent), "desc") || byNumber(goalDifference(a), goalDifference(b), "desc") || b.wins - a.wins
      : (a, b) => byNumber(num(a.win_percent), num(b.win_percent), "desc") || byNumber(a.playoff_seed, b.playoff_seed, "asc") || b.wins - a.wins;
  }
  const useRank = usesEspnRank(league);
  return (a, b) =>
    (useRank ? byNumber(a.rank, b.rank, "asc") : 0) ||
    byNumber(a.points, b.points, "desc") ||
    byNumber(goalDifference(a), goalDifference(b), "desc") ||
    byNumber(a.goals_for, b.goals_for, "desc") ||
    byNumber(num(a.net_run_rate), num(b.net_run_rate), "desc") ||
    b.wins - a.wins ||
    a.losses - b.losses;
}

const isLaterStage = (conference: string | null) => /super|second round/i.test(conference ?? "");
// A row shows no play at all only when every figure that could show it is zero or missing. Wins,
// losses and draws alone are not enough for soccer and cricket: a finished table whose feed sent no
// record stats still has points, goals or a run rate, and must be ordered on them, not sorted by name
// as "not started". The NFL and NBA are judged on their record alone: their feeds can put an unrelated
// non-integer `points` stat in that slot (scripts/lib/standings.ts), and a stray value at 0-0 must not
// make a new season look played.
const hasPlayed = (league: League, r: RankableStanding) =>
  (usesRecordOrder(league)
    ? [r.wins, r.losses, r.draws]
    : [r.wins, r.losses, r.draws, r.no_result, r.points, r.goals_for, r.goals_against, num(r.net_run_rate), num(r.win_percent)]
  ).some((v) => (v ?? 0) !== 0);
const byName = (a: OrderableStanding, b: OrderableStanding) => a.name.localeCompare(b.name);

/**
 * Sort standings rows into their tables and each table into its order.
 * A tournament with two stages keeps a table per stage, the later stage first ("Super Eights"
 * before "Group A"); then the tables in name order. A table in which nobody has played yet (a new
 * season, every team 0-0) has no order to speak of: it is sorted by name and its rows are flagged
 * `unranked` so the page prints a dash instead of 1..N.
 * Returns new rows; the input is left alone.
 */
export function sortStandings<T extends OrderableStanding>(league: League, rows: T[]): T[] {
  const tables = new Map<string, T[]>();
  for (const r of rows) {
    const key = r.conference ?? "";
    const list = tables.get(key);
    if (list) list.push(r);
    else tables.set(key, [r]);
  }
  const keys = [...tables.keys()].sort((a, b) => {
    const stage = Number(isLaterStage(b || null)) - Number(isLaterStage(a || null));
    if (stage) return stage;
    if (a === "" || b === "") return a === b ? 0 : a === "" ? 1 : -1; // no conference (a single table) last, as a null sorts last
    return a.localeCompare(b);
  });
  const cmp = standingsComparator<T>(league);
  const out: T[] = [];
  for (const key of keys) {
    const table = tables.get(key)!;
    if (!table.some((r) => hasPlayed(league, r))) {
      out.push(...[...table].sort(byName).map((r) => ({ ...r, unranked: true })));
    } else {
      out.push(...[...table].sort((a, b) => cmp(a, b) || byName(a, b)));
    }
  }
  return out;
}

/**
 * Each team's finishing position in one table (one season, or one group of a cup), by the same
 * order the table itself uses; teams level on every key share a position (1, 1, 3). NFL and NBA
 * rank league-wide, across their conferences, by win percentage then point differential.
 */
export function leagueWideRank<T extends RankableStanding>(league: League, rows: T[]): Map<string, number> {
  const cmp = standingsComparator<T>(league, "league");
  const out = new Map<string, number>();
  for (const r of rows) out.set(r.team_espn_id, 1 + rows.filter((o) => cmp(o, r) < 0).length);
  return out;
}

/** A table in which nobody has played yet has no positions to show (sortStandings flags its rows). */
export const notStarted = (rows: { unranked?: boolean }[]) => rows.length > 0 && rows.every((r) => r.unranked);

const gamesPlayed = (r: { wins: number; losses: number; draws: number | null; no_result: number | null }) => r.wins + r.losses + (r.draws ?? 0) + (r.no_result ?? 0);

/**
 * The one definition of a finished league table, used by the offseason recap, the season summary and
 * the qualification bands: every team has played its full double round robin. Before that the top of
 * the table is only a leader and the bottom only the current bottom.
 */
export function tableComplete(standings: { wins: number; losses: number; draws: number | null; no_result: number | null }[]): boolean {
  if (standings.length < 2) return false;
  const expected = (standings.length - 1) * 2;
  return standings.every((r) => gamesPlayed(r) >= expected);
}
