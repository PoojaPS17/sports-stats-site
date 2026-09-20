// Season projections: the remainder of the current season is simulated thousands of
// times from the Elo ratings, and each team's outcomes are counted. Everything comes
// from the fixtures and results already in the database.
import { pool } from "./db";
import { isSoccer, getEloRatings, homeWinProbability, type TeamRef } from "./analytics";
import { GAME_SELECT, isCupCompetition, isSoccerLeague, type GameRow, type League } from "./queries";
import { getSeasonsWithGames } from "./matchweeks";

export function supportsProjections(league: League): boolean {
  return isSoccerLeague(league) || league === "nfl" || league === "nba";
}

export interface OutcomeColumn {
  key: string;
  label: string;
  /** Short explanation for the column header tooltip. */
  title: string;
}

export interface TeamProjection {
  team: TeamRef;
  conference: string | null;
  division: string | null;
  /** Results so far. */
  played: number;
  wins: number;
  draws: number;
  losses: number;
  pointsNow: number;
  /** Current league position from results so far. */
  positionNow: number;
  /** Mean simulated final points (soccer) or wins (NFL/NBA). */
  expectedPoints: number;
  /** 5th and 95th percentile of simulated final points/wins. */
  pointsRange: [number, number];
  /** Mean simulated finishing position (league-wide). */
  expectedPosition: number;
  /** Probability (0-1) per outcome key. */
  outcomes: Record<string, number>;
}

export interface UpcomingProbability {
  game: GameRow;
  homeWin: number;
  draw: number;
  awayWin: number;
}

export interface SeasonProjection {
  league: League;
  season: number;
  simulations: number;
  remainingGames: number;
  playedGames: number;
  columns: OutcomeColumn[];
  teams: TeamProjection[];
  upcoming: UpcomingProbability[];
  ratingsAsOf: string | null;
  /** True when every scheduled game is complete. */
  finished: boolean;
  /** True when no game has been played yet. */
  preseason: boolean;
}

// Soccer draw share. At even ratings roughly a quarter of games are drawn; the more
// lopsided the matchup, the fewer.
function drawProbability(homeWinIfDecided: number): number {
  return 0.27 * (1 - Math.abs(homeWinIfDecided - 0.5) * 1.4);
}

export function matchProbabilities(league: League, homeRating: number, awayRating: number): { homeWin: number; draw: number; awayWin: number } {
  const p = homeWinProbability(league, homeRating, awayRating);
  if (!isSoccer(league)) return { homeWin: p, draw: 0, awayWin: 1 - p };
  const draw = drawProbability(p);
  return { homeWin: (1 - draw) * p, draw, awayWin: (1 - draw) * (1 - p) };
}

interface TeamState {
  idx: number;
  team: TeamRef;
  conference: string | null;
  division: string | null;
  wins: number;
  draws: number;
  losses: number;
  gd: number;
  rating: number;
}

// Deterministic, fast PRNG so a cached page is reproducible.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function columnsFor(league: League): OutcomeColumn[] {
  if (league === "ucl") {
    return [
      { key: "first", label: "1st", title: "Finish first in the league phase" },
      { key: "top8", label: "Top 8", title: "Finish in the top eight (straight into the round of 16)" },
      { key: "playoff", label: "Playoffs", title: "Finish ninth to 24th (knockout-round playoffs)" },
      { key: "out", label: "Eliminated", title: "Finish 25th or lower" },
    ];
  }
  if (isSoccer(league)) {
    return [
      { key: "title", label: "Title", title: "Finish first" },
      { key: "top4", label: "Top 4", title: "Finish in the top four (Champions League places)" },
      { key: "top6", label: "Top 6", title: "Finish in the top six" },
      { key: "relegation", label: "Relegation", title: "Finish in the bottom three" },
    ];
  }
  if (league === "nfl") {
    return [
      { key: "division", label: "Win division", title: "Finish first in the division" },
      { key: "playoffs", label: "Playoffs", title: "Reach the postseason (division winner or one of three wild cards per conference)" },
      { key: "seed1", label: "No. 1 seed", title: "Best record in the conference (first-round bye)" },
      { key: "best", label: "Best record", title: "Best regular-season record in the league" },
    ];
  }
  return [
    { key: "playoffs", label: "Top 6", title: "Finish in the top six of the conference (direct playoff place)" },
    { key: "playin", label: "Play-in", title: "Finish seventh to tenth in the conference" },
    { key: "seed1", label: "No. 1 seed", title: "Best record in the conference" },
    { key: "best", label: "Best record", title: "Best regular-season record in the league" },
  ];
}

export async function getSeasonProjection(league: League): Promise<SeasonProjection | null> {
  if (!supportsProjections(league)) return null;
  const seasons = await getSeasonsWithGames(league);
  const season = seasons[0];
  if (!season) return null;

  const [{ rows: games }, { ratings, teams: teamMap, lastResult }, { rows: groups }] = await Promise.all([
    pool.query<GameRow>(`${GAME_SELECT} where g.league = $1 and g.season_year = $2 and g.stage = 'regular' order by g.date asc`, [league, season]),
    getEloRatings(league),
    pool.query(
      `select team_espn_id, conference, division from standings
       where league = $1 and season = (select max(season) from standings where league = $1)`,
      [league]
    ),
  ]);
  if (games.length === 0) return null;

  const grouping = new Map(groups.map((g) => [g.team_espn_id as string, { conference: g.conference as string | null, division: g.division as string | null }]));
  const soccer = isSoccer(league);

  // Teams in this season's fixtures.
  const states: TeamState[] = [];
  const index = new Map<string, number>();
  for (const g of games) {
    for (const id of [g.home_team_espn_id, g.away_team_espn_id]) {
      if (index.has(id)) continue;
      const team = teamMap.get(id);
      if (!team) continue;
      index.set(id, states.length);
      states.push({
        idx: states.length,
        team,
        conference: grouping.get(id)?.conference ?? null,
        division: grouping.get(id)?.division ?? null,
        wins: 0,
        draws: 0,
        losses: 0,
        gd: 0,
        rating: ratings.get(id) ?? 1500,
      });
    }
  }

  // Results so far.
  const played = games.filter((g) => g.completed && g.home_score != null && g.away_score != null);
  const remaining = games.filter((g) => !g.completed);
  for (const g of played) {
    const h = states[index.get(g.home_team_espn_id)!];
    const a = states[index.get(g.away_team_espn_id)!];
    if (!h || !a) continue;
    const diff = g.home_score! - g.away_score!;
    h.gd += diff;
    a.gd -= diff;
    if (diff > 0) {
      h.wins++;
      a.losses++;
    } else if (diff < 0) {
      a.wins++;
      h.losses++;
    } else {
      h.draws++;
      a.draws++;
    }
  }

  const points = (s: { wins: number; draws: number }) => (soccer ? s.wins * 3 + s.draws : s.wins);
  const rankNow = [...states].sort((x, y) => points(y) - points(x) || y.gd - x.gd || y.rating - x.rating);
  const positionNow = new Map(rankNow.map((s, i) => [s.idx, i + 1]));

  // Pre-compute each remaining game's probabilities.
  const fixtures = remaining
    .map((g) => {
      const hi = index.get(g.home_team_espn_id);
      const ai = index.get(g.away_team_espn_id);
      if (hi === undefined || ai === undefined) return null;
      const p = matchProbabilities(league, states[hi].rating, states[ai].rating);
      return { hi, ai, ...p };
    })
    .filter((f): f is NonNullable<typeof f> => f !== null);

  const columns = columnsFor(league);
  const simulations = league === "nba" ? 3000 : 5000;
  const n = states.length;
  const counts = states.map(() => Object.fromEntries(columns.map((c) => [c.key, 0])) as Record<string, number>);
  const pointsSamples: number[][] = states.map(() => []);
  const positionSum = new Array<number>(n).fill(0);
  const rand = mulberry32(season * 7919 + games.length);

  const simWins = new Array<number>(n);
  const simDraws = new Array<number>(n);
  const simGd = new Array<number>(n);

  for (let s = 0; s < simulations; s++) {
    for (let i = 0; i < n; i++) {
      simWins[i] = states[i].wins;
      simDraws[i] = states[i].draws;
      simGd[i] = states[i].gd;
    }
    for (const f of fixtures) {
      const r = rand();
      if (r < f.homeWin) {
        simWins[f.hi]++;
        simGd[f.hi] += 1;
        simGd[f.ai] -= 1;
      } else if (r < f.homeWin + f.draw) {
        simDraws[f.hi]++;
        simDraws[f.ai]++;
      } else {
        simWins[f.ai]++;
        simGd[f.ai] += 1;
        simGd[f.hi] -= 1;
      }
    }
    const pts = (i: number) => (soccer ? simWins[i] * 3 + simDraws[i] : simWins[i]);
    // Tiebreak: points, goal difference (soccer), then a coin flip so ties don't
    // systematically favour one side.
    const order = states.map((_, i) => i).sort((a, b) => pts(b) - pts(a) || (soccer ? simGd[b] - simGd[a] : 0) || rand() - 0.5);
    const leaguePos = new Array<number>(n);
    order.forEach((i, pos) => (leaguePos[i] = pos + 1));

    for (let i = 0; i < n; i++) {
      pointsSamples[i].push(pts(i));
      positionSum[i] += leaguePos[i];
    }

    if (isCupCompetition(league)) {
      order.forEach((i, pos) => {
        if (pos === 0) counts[i].first++;
        if (pos < 8) counts[i].top8++;
        else if (pos < 24) counts[i].playoff++;
        else counts[i].out++;
      });
    } else if (soccer) {
      order.forEach((i, pos) => {
        if (pos === 0) counts[i].title++;
        if (pos < 4) counts[i].top4++;
        if (pos < 6) counts[i].top6++;
        if (pos >= n - 3) counts[i].relegation++;
      });
    } else if (league === "nfl") {
      counts[order[0]].best++;
      const byConf = new Map<string, number[]>();
      for (const i of order) {
        const c = states[i].conference ?? "?";
        if (!byConf.has(c)) byConf.set(c, []);
        byConf.get(c)!.push(i);
      }
      for (const confOrder of byConf.values()) {
        const divisionWinners: number[] = [];
        const seenDivisions = new Set<string>();
        for (const i of confOrder) {
          const d = states[i].division ?? "?";
          if (seenDivisions.has(d)) continue;
          seenDivisions.add(d);
          divisionWinners.push(i);
        }
        const wildcards = confOrder.filter((i) => !divisionWinners.includes(i)).slice(0, 3);
        for (const i of divisionWinners) {
          counts[i].division++;
          counts[i].playoffs++;
        }
        for (const i of wildcards) counts[i].playoffs++;
        if (divisionWinners.length) counts[divisionWinners[0]].seed1++;
      }
    } else {
      counts[order[0]].best++;
      const byConf = new Map<string, number[]>();
      for (const i of order) {
        const c = states[i].conference ?? "?";
        if (!byConf.has(c)) byConf.set(c, []);
        byConf.get(c)!.push(i);
      }
      for (const confOrder of byConf.values()) {
        confOrder.forEach((i, pos) => {
          if (pos === 0) counts[i].seed1++;
          if (pos < 6) counts[i].playoffs++;
          else if (pos < 10) counts[i].playin++;
        });
      }
    }
  }

  const teamsOut: TeamProjection[] = states.map((st, i) => {
    const samples = pointsSamples[i].sort((a, b) => a - b);
    const q = (p: number) => samples[Math.min(samples.length - 1, Math.floor(p * samples.length))];
    return {
      team: st.team,
      conference: st.conference,
      division: st.division,
      played: st.wins + st.draws + st.losses,
      wins: st.wins,
      draws: st.draws,
      losses: st.losses,
      pointsNow: points(st),
      positionNow: positionNow.get(st.idx)!,
      expectedPoints: samples.reduce((a, b) => a + b, 0) / samples.length,
      pointsRange: [q(0.05), q(0.95)],
      expectedPosition: positionSum[i] / simulations,
      outcomes: Object.fromEntries(columns.map((c) => [c.key, counts[i][c.key] / simulations])),
    };
  });
  teamsOut.sort((a, b) => a.expectedPosition - b.expectedPosition);

  // Win probabilities for the next week of fixtures.
  const horizon = Date.now() + 7 * 86_400_000;
  const upcoming: UpcomingProbability[] = remaining
    .filter((g) => new Date(g.date).getTime() <= horizon)
    .slice(0, 24)
    .map((g) => {
      const hr = ratings.get(g.home_team_espn_id) ?? 1500;
      const ar = ratings.get(g.away_team_espn_id) ?? 1500;
      return { game: g, ...matchProbabilities(league, hr, ar) };
    });

  return {
    league,
    season,
    simulations,
    remainingGames: fixtures.length,
    playedGames: played.length,
    columns,
    teams: teamsOut,
    upcoming,
    ratingsAsOf: lastResult,
    finished: fixtures.length === 0,
    preseason: played.length === 0,
  };
}
