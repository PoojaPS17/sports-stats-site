// Side-by-side comparisons of two teams or two players, assembled from the
// standings, computed tables, Elo ratings, head-to-head history and season stats
// that already exist. Nothing here fetches from ESPN.
import { pool } from "./db";
import { hasTies, isCricketLeague, type League } from "./leagues";
import { countRegularGames } from "./compareGames";
import { trunc2 } from "./cricketFormat";
import { playerSport } from "./playerProfile";
import { notPseudoAthleteSql } from "./pseudoAthlete";
import {
  getComputedTable,
  getCurrentSeason,
  getHeadToHead,
  getPowerRankings,
  getTeamHistory,
  isSoccer,
  supportsScoreAnalytics,
  type ComputedTableRow,
  type HeadToHead,
  type TeamRef,
} from "./analytics";
import { getPlayerCricketCareer, getStandings, type CricketCareerStats } from "./queries";
import { leagueWideRank, usesRecordOrder } from "./standingsOrder";

/* ------------------------------------------------------------------------ */
/* Shared metric shape                                                       */
/* ------------------------------------------------------------------------ */

export interface Metric {
  label: string;
  a: number | null;
  b: number | null;
  /** Pre-formatted display strings (so "62.7%" or "7.9-15.3" survive). */
  aText: string;
  bText: string;
  /** When true a smaller number is the better one (goals conceded, turnovers...). */
  lowerIsBetter?: boolean;
  /** Skip the proportional bar (positions, ranks, seasons). */
  noBar?: boolean;
}

export interface MetricGroup {
  title: string;
  note?: string;
  metrics: Metric[];
}

function num(v: number | null | undefined, digits = 0): string {
  if (v == null || Number.isNaN(v)) return "—";
  return digits ? v.toFixed(digits) : String(Math.round(v));
}

function metric(label: string, a: number | null, b: number | null, opts: { digits?: number; lowerIsBetter?: boolean; noBar?: boolean; suffix?: string; truncate?: boolean } = {}): Metric {
  // `truncate`: a cricket rate, cut at its last decimal the way Statsguru writes it rather than rounded.
  const fmt = (v: number | null) => (v == null ? "—" : `${opts.truncate ? trunc2(v, opts.digits, "—") : num(v, opts.digits)}${opts.suffix ?? ""}`);
  return { label, a, b, aText: fmt(a), bText: fmt(b), lowerIsBetter: opts.lowerIsBetter, noBar: opts.noBar };
}

/* ------------------------------------------------------------------------ */
/* Teams                                                                     */
/* ------------------------------------------------------------------------ */

export interface TeamCompareSide {
  team: TeamRef;
  position: number | null;
  /** In the current table, but the season has not started, so there is no position to show. */
  notStarted: boolean;
  teamsInTable: number;
  form: ("W" | "D" | "L")[];
  eloRank: number | null;
  eloRating: number | null;
  overall: ComputedTableRow | null;
  home: ComputedTableRow | null;
  away: ComputedTableRow | null;
}

export interface TeamComparison {
  league: League;
  season: number | null;
  a: TeamCompareSide;
  b: TeamCompareSide;
  groups: MetricGroup[];
  h2h: HeadToHead | null;
}

async function getTeamRef(league: League, slug: string): Promise<TeamRef | null> {
  const { rows } = await pool.query(`select espn_id, name, slug, abbreviation, logo_url, color from teams where league = $1 and slug = $2`, [league, slug]);
  return rows[0] ?? null;
}

export async function getTeamComparison(league: League, slugA: string, slugB: string): Promise<TeamComparison | null> {
  if (!supportsScoreAnalytics(league)) return null;
  const [teamA, teamB] = await Promise.all([getTeamRef(league, slugA), getTeamRef(league, slugB)]);
  if (!teamA || !teamB || teamA.espn_id === teamB.espn_id) return null;

  const season = await getCurrentSeason(league);
  const [standings, overall, home, away, power, h2h, histA, histB] = await Promise.all([
    getStandings(league),
    season ? getComputedTable(league, season, "overall") : Promise.resolve([]),
    season ? getComputedTable(league, season, "home") : Promise.resolve([]),
    season ? getComputedTable(league, season, "away") : Promise.resolve([]),
    getPowerRankings(league, 0),
    getHeadToHead(league, slugA, slugB),
    getTeamHistory(league, teamA.espn_id),
    getTeamHistory(league, teamB.espn_id),
  ]);

  const soccer = isSoccer(league);
  const leagueRanks = usesRecordOrder(league) ? leagueWideRank(league, standings) : null;
  const find = (rows: ComputedTableRow[], id: string) => rows.find((r) => r.team.espn_id === id) ?? null;
  const side = (t: TeamRef): TeamCompareSide => {
    const posIdx = standings.findIndex((s) => s.team_espn_id === t.espn_id);
    // NFL and NBA tables are split by conference/division, so a league position is worked out across
    // the whole league, by the same order as a team's finishes on its history page.
    // A season nobody has played yet has no order, so no position either.
    const notStarted = posIdx >= 0 && Boolean(standings[posIdx].unranked);
    const position = notStarted ? null : leagueRanks ? leagueRanks.get(t.espn_id) ?? null : posIdx >= 0 ? posIdx + 1 : null;
    const eloIdx = power.rows.findIndex((r) => r.team.espn_id === t.espn_id);
    const ov = find(overall, t.espn_id);
    return {
      team: t,
      position,
      notStarted,
      teamsInTable: standings.length,
      form: ov?.form ?? [],
      eloRank: eloIdx >= 0 ? eloIdx + 1 : null,
      eloRating: eloIdx >= 0 ? power.rows[eloIdx].rating : null,
      overall: ov,
      home: find(home, t.espn_id),
      away: find(away, t.espn_id),
    };
  };
  const a = side(teamA);
  const b = side(teamB);

  const pg = (r: ComputedTableRow | null, v: (r: ComputedTableRow) => number) => (r && r.played ? v(r) / r.played : null);
  // A tie is half a win where games can tie (NFL).
  const creditedWins = (r: ComputedTableRow) => r.wins + (hasTies(league) ? r.draws / 2 : 0);
  const scoreWord = soccer ? "Goals" : "Points";

  const seasonGroup: MetricGroup = {
    title: "This season",
    metrics: [
      metric("League position", a.position, b.position, { lowerIsBetter: true, noBar: true }),
      metric(soccer ? "Points" : "Wins", a.overall?.points ?? null, b.overall?.points ?? null),
      metric("Played", a.overall?.played ?? null, b.overall?.played ?? null, { noBar: true }),
      metric("Wins", a.overall?.wins ?? null, b.overall?.wins ?? null),
      ...(soccer ? [metric("Draws", a.overall?.draws ?? null, b.overall?.draws ?? null, { noBar: true })] : []),
      ...(hasTies(league) ? [metric("Ties", a.overall?.draws ?? null, b.overall?.draws ?? null, { noBar: true })] : []),
      metric("Losses", a.overall?.losses ?? null, b.overall?.losses ?? null, { lowerIsBetter: true }),
      metric(`${scoreWord} for`, a.overall?.goalsFor ?? null, b.overall?.goalsFor ?? null),
      metric(`${scoreWord} against`, a.overall?.goalsAgainst ?? null, b.overall?.goalsAgainst ?? null, { lowerIsBetter: true }),
      metric(
        soccer ? "Goal difference" : "Point differential",
        a.overall ? a.overall.goalsFor - a.overall.goalsAgainst : null,
        b.overall ? b.overall.goalsFor - b.overall.goalsAgainst : null
      ),
      metric(`${scoreWord} per game`, pg(a.overall, (r) => r.goalsFor), pg(b.overall, (r) => r.goalsFor), { digits: soccer ? 2 : 1 }),
      metric(`${scoreWord} conceded per game`, pg(a.overall, (r) => r.goalsAgainst), pg(b.overall, (r) => r.goalsAgainst), { digits: soccer ? 2 : 1, lowerIsBetter: true }),
      soccer
        ? metric("Points per game", pg(a.overall, (r) => r.points), pg(b.overall, (r) => r.points), { digits: 2 })
        : metric("Win percentage", pg(a.overall, (r) => creditedWins(r) * 100), pg(b.overall, (r) => creditedWins(r) * 100), { digits: 1, suffix: "%" }),
    ],
  };

  const splitGroup: MetricGroup = {
    title: "Home and away",
    metrics: [
      metric("Home wins", a.home?.wins ?? null, b.home?.wins ?? null),
      metric("Home losses", a.home?.losses ?? null, b.home?.losses ?? null, { lowerIsBetter: true }),
      metric(`Home ${scoreWord.toLowerCase()} per game`, pg(a.home, (r) => r.goalsFor), pg(b.home, (r) => r.goalsFor), { digits: soccer ? 2 : 1 }),
      metric("Away wins", a.away?.wins ?? null, b.away?.wins ?? null),
      metric("Away losses", a.away?.losses ?? null, b.away?.losses ?? null, { lowerIsBetter: true }),
      metric(`Away ${scoreWord.toLowerCase()} per game`, pg(a.away, (r) => r.goalsFor), pg(b.away, (r) => r.goalsFor), { digits: soccer ? 2 : 1 }),
    ],
  };

  const strengthGroup: MetricGroup = {
    title: "Strength rating",
    note: "Elo rating computed from every result on record. See Power Rankings for the method.",
    metrics: [
      metric("Power ranking", a.eloRank, b.eloRank, { lowerIsBetter: true, noBar: true }),
      metric("Elo rating", a.eloRating, b.eloRating),
    ],
  };

  const playedA = histA.filter((h) => h.played);
  const playedB = histB.filter((h) => h.played);
  const best = (rows: typeof playedA) => (rows.length ? Math.min(...rows.map((r) => r.position)) : null);
  const avg = (rows: typeof playedA) => (rows.length ? rows.reduce((s, r) => s + r.position, 0) / rows.length : null);
  const historyGroup: MetricGroup = {
    title: "History on record",
    note: "Seasons in our archive, which starts around 2015.",
    metrics: [
      metric("Seasons in league", playedA.length, playedB.length, { noBar: true }),
      metric(soccer ? "Titles" : "First-place finishes", playedA.filter((r) => r.position === 1).length, playedB.filter((r) => r.position === 1).length),
      metric("Best finish", best(playedA), best(playedB), { lowerIsBetter: true, noBar: true }),
      metric("Average finish", avg(playedA), avg(playedB), { digits: 1, lowerIsBetter: true, noBar: true }),
    ],
  };

  return { league, season, a, b, groups: [seasonGroup, splitGroup, strengthGroup, historyGroup], h2h };
}

/* ------------------------------------------------------------------------ */
/* Players                                                                   */
/* ------------------------------------------------------------------------ */

export interface PlayerProfile {
  espn_id: string;
  name: string;
  slug: string;
  headshot_url: string | null;
  position: string | null;
  jersey: string | null;
  age: number | null;
  height: string | null;
  team_name: string | null;
  team_slug: string | null;
  team_color: string | null;
  team_logo: string | null;
}

export interface PlayerCompareSide {
  player: PlayerProfile;
  season: number | null;
  gamesLogged: number;
}

export interface PlayerComparison {
  league: League;
  a: PlayerCompareSide;
  b: PlayerCompareSide;
  groups: MetricGroup[];
}

// Stats where a smaller number is the better one. Matched against the label ESPN
// uses inside each category; "YDS" under a defensive category is ambiguous, so it is
// left neutral.
const LOWER_IS_BETTER = new Set(["INT", "FUM", "LST", "TO", "PF", "YC", "RC", "FC", "OF", "OG", "SACK", "DQ", "EJECT", "TECH", "FLAG", "GA"]);
// Interceptions thrown are bad for a passer, but interceptions made are good for a
// defender — decided per category.
const CATEGORY_OVERRIDES: Record<string, Record<string, boolean>> = {
  defensive: { INT: false, SACK: false, YDS: false },
  passing: { INT: true, SACK: true },
};

const NO_BAR = new Set(["GP", "GS", "STRT", "LNG", "LONG"]);

function parseNumber(text: string): number | null {
  // "473-919" style made/attempted pairs are compared on the made count.
  const first = text.split("-")[0];
  const n = Number(first.replace(/,/g, "").replace(/%$/, ""));
  return Number.isFinite(n) ? n : null;
}

async function getPlayerProfile(league: League, slug: string): Promise<PlayerProfile | null> {
  const { rows } = await pool.query(
    `select p.espn_id, p.name, p.slug, coalesce(p.headshot_url, p.photo_url) as headshot_url, p.position, p.jersey, p.age, p.height,
            t.name as team_name, t.slug as team_slug, t.color as team_color, t.logo_url as team_logo
     from players p
     left join teams t on t.league = p.league and t.espn_id = p.team_espn_id
     where p.league = $1 and p.slug = $2 and ${notPseudoAthleteSql()}`,
    [league, slug]
  );
  return rows[0] ?? null;
}

type SeasonStats = { season: number; categories: Record<string, { labels: string[]; values: string[] }> };

// The most recent season both players have stats for, so a 14-game line isn't set
// against a 1-game line just because one player's new season has started. Falls
// back to each player's own latest season when they never overlapped.
async function getComparableSeasonStats(league: League, idA: string, idB: string): Promise<[SeasonStats | null, SeasonStats | null]> {
  const { rows } = await pool.query(
    `select player_espn_id, season, categories from player_season_stats
     where league = $1 and player_espn_id = any($2) order by season desc`,
    [league, [idA, idB]]
  );
  const byPlayer = (id: string) => rows.filter((r) => r.player_espn_id === id) as (SeasonStats & { player_espn_id: string })[];
  const a = byPlayer(idA);
  const b = byPlayer(idB);
  const common = a.map((r) => r.season).find((s) => b.some((r) => r.season === s));
  if (common !== undefined) return [a.find((r) => r.season === common)!, b.find((r) => r.season === common)!];
  return [a[0] ?? null, b[0] ?? null];
}

// A left join, so every stored box-score row still comes back exactly as the old count(*) saw it;
// countRegularGames decides which of them count.
async function countGameLog(league: League, playerEspnId: string): Promise<number> {
  const { rows } = await pool.query(
    `select g.stage, g.round from player_game_stats pgs
     left join games g on g.league = pgs.league and g.espn_id = pgs.game_espn_id
     where pgs.league = $1 and pgs.player_espn_id = $2`,
    [league, playerEspnId]
  );
  return countRegularGames(rows, playerSport(league));
}

export function cricketGroups(a: CricketCareerStats | null, b: CricketCareerStats | null): MetricGroup[] {
  const g = (k: keyof CricketCareerStats) => [a?.[k] ?? null, b?.[k] ?? null] as [number | null, number | null];
  return [
    {
      title: "Career on record",
      note: "Every match in the competitions we track. International and other domestic cricket is not included.",
      metrics: [metric("Matches", ...g("matches"), { noBar: true }), metric("Catches", ...g("catches"))],
    },
    {
      title: "Batting",
      metrics: [
        metric("Innings", ...g("inningsBatted"), { noBar: true }),
        metric("Runs", ...g("runs")),
        metric("Average", ...g("average"), { digits: 2, truncate: true }),
        metric("Strike rate", ...g("strikeRate"), { digits: 2, truncate: true }),
        metric("Highest score", ...g("highestScore")),
        metric("Hundreds", ...g("hundreds")),
        metric("Fifties", ...g("fifties")),
        metric("Not outs", ...g("notOuts"), { noBar: true }),
      ],
    },
    {
      title: "Bowling",
      metrics: [
        metric("Innings bowled", ...g("inningsBowled"), { noBar: true }),
        metric("Wickets", ...g("wickets")),
        metric("Overs", ...g("overs"), { digits: 1, noBar: true }),
        metric("Runs conceded", ...g("runsConceded"), { lowerIsBetter: true }),
        metric("Economy", ...g("economy"), { digits: 2, lowerIsBetter: true, truncate: true }),
      ],
    },
  ];
}

export async function getPlayerComparison(league: League, slugA: string, slugB: string): Promise<PlayerComparison | null> {
  const [pa, pb] = await Promise.all([getPlayerProfile(league, slugA), getPlayerProfile(league, slugB)]);
  if (!pa || !pb || pa.espn_id === pb.espn_id) return null;

  const [gamesA, gamesB] = await Promise.all([countGameLog(league, pa.espn_id), countGameLog(league, pb.espn_id)]);

  if (isCricketLeague(league)) {
    const [ca, cb] = await Promise.all([getPlayerCricketCareer(league, pa.espn_id), getPlayerCricketCareer(league, pb.espn_id)]);
    return {
      league,
      a: { player: pa, season: null, gamesLogged: gamesA },
      b: { player: pb, season: null, gamesLogged: gamesB },
      groups: cricketGroups(ca, cb),
    };
  }

  const [sa, sb] = await getComparableSeasonStats(league, pa.espn_id, pb.espn_id);
  const groups: MetricGroup[] = [];
  const categories = [...new Set([...Object.keys(sa?.categories ?? {}), ...Object.keys(sb?.categories ?? {})])];
  for (const cat of categories) {
    const ca = sa?.categories[cat];
    const cb = sb?.categories[cat];
    const labels = [...new Set([...(ca?.labels ?? []), ...(cb?.labels ?? [])])];
    const metrics: Metric[] = [];
    for (const label of labels) {
      const ia = ca?.labels.indexOf(label) ?? -1;
      const ib = cb?.labels.indexOf(label) ?? -1;
      const aText = ia >= 0 ? ca!.values[ia] : "—";
      const bText = ib >= 0 ? cb!.values[ib] : "—";
      const a = ia >= 0 ? parseNumber(aText) : null;
      const b = ib >= 0 ? parseNumber(bText) : null;
      const override = CATEGORY_OVERRIDES[cat]?.[label];
      const lowerIsBetter = override ?? LOWER_IS_BETTER.has(label);
      metrics.push({ label, a, b, aText, bText, lowerIsBetter, noBar: NO_BAR.has(label) });
    }
    // Drop categories where both players are all zeros (a QB's "receiving" line).
    const meaningful = metrics.some((m) => (m.a ?? 0) !== 0 || (m.b ?? 0) !== 0);
    if (meaningful) groups.push({ title: cat.charAt(0).toUpperCase() + cat.slice(1), metrics });
  }

  return {
    league,
    a: { player: pa, season: sa?.season ?? null, gamesLogged: gamesA },
    b: { player: pb, season: sb?.season ?? null, gamesLogged: gamesB },
    groups,
  };
}

/** Name lookup so a half-filled picker (?a=slug with no b) still shows the chosen player. */
export async function getPlayerLabel(league: League, slug: string): Promise<{ slug: string; name: string } | null> {
  const { rows } = await pool.query(`select p.slug, p.name from players p where p.league = $1 and p.slug = $2 and ${notPseudoAthleteSql()}`, [league, slug]);
  return rows[0] ?? null;
}
