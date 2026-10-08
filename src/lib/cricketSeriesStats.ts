// A series' leaders, summed from the per-match figures stored for it (cricket_series_player_stats, written
// by scripts/topup-cricket-series-stats.ts for the series SportsDB does not archive under a competition).
// Pure: no database import, so the component and its tests can use it; the read is in cricketSeriesStatsData.ts.
//
// Search Console, 2026-10-06: the series pages of small competitions are the pages that earn clicks, and
// "most runs" / "most wickets" are the tabs Cricinfo keeps for them and the aggregators do not have.
import { cricketMatchName } from "./cricketMatchStatus";

export interface SeriesBatting {
  runs: number;
  /** Null when the scorecard does not record balls faced. */
  ballsFaced: number | null;
  fours: number | null;
  sixes: number | null;
  notOut: boolean;
}
export interface SeriesBowling {
  /** Written "12.3": 12 overs and 3 balls. */
  overs: number;
  conceded: number;
  wickets: number;
  /** Balls per over when not six. */
  bpo?: number;
}

/** One player's figures in one match, as stored (the shape of extractCricketMatchStats in scripts/lib/cricket-career.ts). */
export interface SeriesStatRow {
  match_espn_id: string;
  /** The match's stage ("3rd Match", "Final"), for the highlights. */
  stage: string | null;
  player_espn_id: string;
  player_name: string;
  team_espn_id: string;
  stats: {
    /** Match totals. */
    batting?: SeriesBatting;
    bowling?: SeriesBowling;
    /** Per innings, first-class matches only; the totals above are read when it is absent. */
    innings?: { n: number; batting?: SeriesBatting; bowling?: SeriesBowling }[];
  };
}

export interface BattingLeader {
  playerId: string;
  name: string;
  teamId: string;
  innings: number;
  notOuts: number;
  runs: number;
  /** "86*" when not out. */
  highScore: string;
  /** Runs per dismissal; null while never dismissed. */
  average: number | null;
  /** Null when balls faced were not recorded. */
  strikeRate: number | null;
}

export interface BowlingLeader {
  playerId: string;
  name: string;
  teamId: string;
  innings: number;
  /** "7.3" or "8". */
  overs: string;
  conceded: number;
  wickets: number;
  /** "4/23": most wickets, then fewest runs. */
  best: string;
  economy: number | null;
}

export interface InningsHighlight {
  playerId: string;
  name: string;
  teamId: string;
  /** "120", "86*" or "4/23". */
  figure: string;
  matchId: string;
  stage: string | null;
}

export interface CricketSeriesStats {
  /** Completed matches with figures stored. */
  matches: number;
  /**
   * The figures cover the series' official internationals only: it also lists warm-ups against county, Lions or
   * invitation XIs, which are left out so a tour's leaders are its Tests, ODIs and T20Is. Stated beside the figures.
   */
  officialOnly?: boolean;
  batting: BattingLeader[];
  bowling: BowlingLeader[];
  highestScore: InningsHighlight | null;
  bestBowling: InningsHighlight | null;
  /** Summed over every stored row: runs off the bat (extras are not in the rows), boundaries and wickets taken. */
  totals: { runs: number; fours: number; sixes: number; wickets: number; hasBoundaries: boolean };
  /** The most sixes by one player, with the number; null when no row records sixes. */
  mostSixes: { name: string; teamId: string; sixes: number } | null;
}

// Overs are written "12.3" (12 overs and 3 balls), so they are summed as balls.
const ballsOf = (overs: number, bpo: number) => Math.floor(overs) * bpo + Math.round((overs - Math.floor(overs)) * 10);
const oversText = (balls: number, bpo: number) => (balls % bpo ? `${Math.floor(balls / bpo)}.${balls % bpo}` : `${Math.floor(balls / bpo)}`);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const round2 = (x: number) => Math.round(x * 100) / 100;
const score = (runs: number, notOut: boolean) => `${runs}${notOut ? "*" : ""}`;

interface BattingAcc extends Omit<BattingLeader, "highScore" | "average" | "strikeRate"> {
  balls: number | null;
  high: { runs: number; notOut: boolean };
}
interface BowlingAcc extends Omit<BowlingLeader, "overs" | "best" | "economy"> {
  balls: number;
  bpo: number;
  bestFigures: { wickets: number; conceded: number };
}

const betterScore = (a: { runs: number; notOut: boolean }, b: { runs: number; notOut: boolean } | null) => !b || a.runs > b.runs || (a.runs === b.runs && a.notOut && !b.notOut);
const betterFigures = (a: { wickets: number; conceded: number }, b: { wickets: number; conceded: number } | null) => !b || a.wickets > b.wickets || (a.wickets === b.wickets && a.conceded < b.conceded);

/** The leaders of a series from its stored rows: `limit` batters by runs and bowlers by wickets, and the best innings of each kind. */
export function aggregateSeriesStats(rows: SeriesStatRow[], limit = 5): CricketSeriesStats {
  const matches = new Set<string>();
  const bats = new Map<string, BattingAcc>();
  const bowls = new Map<string, BowlingAcc>();
  let highestScore: (InningsHighlight & { runs: number; notOut: boolean }) | null = null;
  let bestBowling: (InningsHighlight & { wickets: number; conceded: number }) | null = null;
  const totals = { runs: 0, fours: 0, sixes: 0, wickets: 0, hasBoundaries: false };
  // Boundary totals are stated only when EVERY batting innings recorded them: a count over some innings, set beside
  // all the matches ("sixes a match"), or a "most sixes" over some of the players, would read as complete.
  let battingInnings = 0;
  let boundaryInnings = 0;
  const sixesBy = new Map<string, { name: string; teamId: string; sixes: number }>();

  for (const r of rows) {
    matches.add(r.match_espn_id);
    const who = { playerId: r.player_espn_id, name: r.player_name, teamId: r.team_espn_id };
    const innings = r.stats.innings?.length ? r.stats.innings : [{ n: 1, batting: r.stats.batting, bowling: r.stats.bowling }];
    for (const inn of innings) {
      const b = inn.batting;
      if (b) {
        const acc = bats.get(who.playerId) ?? { ...who, innings: 0, notOuts: 0, runs: 0, balls: 0, high: { runs: -1, notOut: false } };
        acc.innings++;
        acc.runs += b.runs;
        totals.runs += b.runs;
        battingInnings++;
        if (b.fours !== null && b.sixes !== null) {
          boundaryInnings++;
          totals.fours += b.fours;
          totals.sixes += b.sixes;
          const six = sixesBy.get(who.playerId) ?? { name: who.name, teamId: who.teamId, sixes: 0 };
          six.sixes += b.sixes;
          sixesBy.set(who.playerId, six);
        }
        if (b.notOut) acc.notOuts++;
        // Runs off no balls is an innings whose balls were not recorded (a lone gap inside a recorded card).
        acc.balls = acc.balls === null || b.ballsFaced === null || (b.ballsFaced === 0 && b.runs > 0) ? null : acc.balls + b.ballsFaced;
        if (betterScore(b, acc.high)) acc.high = { runs: b.runs, notOut: b.notOut };
        bats.set(who.playerId, acc);
        if (betterScore(b, highestScore)) highestScore = { ...who, figure: score(b.runs, b.notOut), matchId: r.match_espn_id, stage: r.stage, runs: b.runs, notOut: b.notOut };
      }
      const w = inn.bowling;
      if (w && w.overs > 0) {
        const bpo = w.bpo ?? 6;
        const acc = bowls.get(who.playerId) ?? { ...who, innings: 0, conceded: 0, wickets: 0, balls: 0, bpo, bestFigures: { wickets: -1, conceded: 0 } };
        acc.innings++;
        acc.conceded += w.conceded;
        acc.wickets += w.wickets;
        totals.wickets += w.wickets;
        acc.balls += ballsOf(w.overs, bpo);
        if (betterFigures(w, acc.bestFigures)) acc.bestFigures = { wickets: w.wickets, conceded: w.conceded };
        bowls.set(who.playerId, acc);
        if (betterFigures(w, bestBowling)) bestBowling = { ...who, figure: `${w.wickets}/${w.conceded}`, matchId: r.match_espn_id, stage: r.stage, wickets: w.wickets, conceded: w.conceded };
      }
    }
  }

  const batting: BattingLeader[] = [...bats.values()].map(({ balls, high, ...acc }) => {
    const outs = acc.innings - acc.notOuts;
    return { ...acc, highScore: score(high.runs, high.notOut), average: outs > 0 ? round2(acc.runs / outs) : null, strikeRate: balls ? round2((acc.runs * 100) / balls) : null };
  });
  batting.sort((a, b) => b.runs - a.runs || (b.average ?? -1) - (a.average ?? -1) || a.name.localeCompare(b.name));
  const bowling: BowlingLeader[] = [...bowls.values()].map(({ balls, bpo, bestFigures, ...acc }) => ({
    ...acc,
    overs: oversText(balls, bpo),
    best: `${bestFigures.wickets}/${bestFigures.conceded}`,
    economy: balls > 0 ? round2(acc.conceded / (balls / bpo)) : null,
  }));
  bowling.sort((a, b) => b.wickets - a.wickets || a.conceded - b.conceded || a.name.localeCompare(b.name));

  totals.hasBoundaries = boundaryInnings > 0 && boundaryInnings === battingInnings;

  const strip = <T extends InningsHighlight>(h: T | null): InningsHighlight | null => (h ? { playerId: h.playerId, name: h.name, teamId: h.teamId, figure: h.figure, matchId: h.matchId, stage: h.stage } : null);
  return { matches: matches.size, batting: batting.slice(0, limit), bowling: bowling.slice(0, limit), highestScore: strip(highestScore), bestBowling: strip(bestBowling), totals, mostSixes: !totals.hasBoundaries ? null : [...sixesBy.values()].filter((x) => x.sixes > 0).sort((a, b) => b.sixes - a.sixes || a.name.localeCompare(b.name))[0] ?? null };
}

/**
 * "Most runs: Eve Alpha (125); most wickets: Dee Bravo (7)." Null when there are no leaders yet. `scope` adds what the
 * figures cover when warm-ups are left out ("..., in the series' 3 international matches."), so the line is not read as
 * every match of the tour.
 */
export function seriesLeadersClause(stats: CricketSeriesStats | null, scope = false): string | null {
  if (!stats) return null;
  const parts: string[] = [];
  if (stats.batting[0]) parts.push(`Most runs: ${stats.batting[0].name} (${stats.batting[0].runs})`);
  if (stats.bowling[0]) parts.push(`most wickets: ${stats.bowling[0].name} (${stats.bowling[0].wickets})`);
  if (parts.length === 0) return null;
  const text = parts.join("; ") + (scope && stats.officialOnly && stats.matches > 0 ? `, in the series' ${plural(stats.matches, "international match", "international matches")}` : "");
  return `${text[0].toUpperCase()}${text.slice(1)}.`;
}

const dayOf = (date: string) => new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export interface SeriesSoFarInput {
  /** The top row of the points table. */
  leader: { team: string; points: number; played: number } | null;
  lastResult: { name: string; stage: string | null; summary: string | null } | null;
  nextFixture: { name: string; stage: string | null; date: string } | null;
  stats: CricketSeriesStats | null;
  /** The series is over: the leader finished top. */
  finished: boolean;
}

/** The series in a paragraph: the table leader, the latest result, the next fixture and the leaders. Empty when there is nothing to say. */
export function cricketSeriesSoFar({ leader, lastResult, nextFixture, stats, finished }: SeriesSoFarInput): string {
  const parts: string[] = [];
  // Before the first match ESPN's table has a top row with nothing played, which would read "lead ... with 0 points
  // from 0 matches": the leader waits for a result.
  if (leader && leader.played > 0) parts.push(`${leader.team} ${finished ? "finished top of" : "lead"} the points table with ${plural(leader.points, "point")} from ${plural(leader.played, "match", "matches")}.`);
  if (lastResult) {
    const summary = lastResult.summary?.trim().replace(/\.$/, "");
    parts.push(`Latest result: ${[cricketMatchName(lastResult.name), lastResult.stage].filter(Boolean).join(", ")}${summary ? `: ${summary}` : ""}.`);
  }
  if (nextFixture) parts.push(`Next: ${[cricketMatchName(nextFixture.name), nextFixture.stage, dayOf(nextFixture.date)].filter(Boolean).join(", ")}.`);
  const clause = seriesLeadersClause(stats, true);
  if (clause) parts.push(clause);
  return parts.join(" ");
}
