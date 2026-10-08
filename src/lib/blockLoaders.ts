// Server side of the homepage blocks: one loader per type, each reading through the
// existing query layer and shaping a small payload (lib/blockTypes.ts) that the client
// draws. Null means "this entity is gone", which the client shows as an empty block.
import type { BlockPayload, BlockType, BtsBlockData, F1DriversBlockData, FixtureLine, LiveBlockData, PlayerFormBlockData, StandingsBlockData, TeamNextBlockData, TeamSummary } from "./blockTypes";
import { getHomeData } from "./homeData";
import {
  getCricketRecentInnings,
  getPlayerBySlug,
  getPlayerLog,
  getStandings,
  getStandingsBySeason,
  getTeamBySlug,
  getTeamGamesBySeason,
  getTeamSeasons,
  type GameRow,
  type StandingRow,
} from "./queries";
import { getCricketSeries, getCricketSeriesMatches, getCricketSeriesWindow, type CricketSeriesMatch } from "./cricketSeries";
import { getF1Calendar, getF1DriverStandings, getF1Seasons } from "./f1";
import { f1RaceInstant } from "./f1Dates";
import { f1CircuitTimeZone } from "./f1Circuits";
import { listArticles } from "./beyondTheScoreline";
import { articleArt } from "./articleArt";
import { hasStandings, isCricketLeague, LEAGUE_LABEL, type League } from "./leagues";
import { topBands } from "./standingsZones";
import { usesRecordOrder } from "./standingsOrder";
import { groupStandings } from "@/components/StandingsTable";
import { playerSport, sportProfile } from "./playerProfile";
import { isGameCalledOff, isTimeTbd } from "./gameStatus";
import { formatGameDate } from "./gameDay";
import { teamDisplayName } from "./teamName";
import { loadMoments, parseTeams } from "./moments";

const NEXT = 3;
const TABLE_ROWS = 6;

export async function loadBlock(type: BlockType, params: Record<string, string>): Promise<BlockPayload | null> {
  switch (type) {
    case "live":
      return loadLive();
    case "team-next":
      return params.league === "cricket" ? loadCricketSide(params.team) : loadTeamNext(params.league as League, params.team);
    case "standings":
      return loadStandings(params.league as League, LEAGUE_LABEL[params.league as League], `/${params.league}/standings`);
    case "series-standings":
      return loadSeriesStandings(params.series);
    case "player-form":
      return loadPlayerForm(params.league as League, params.player);
    case "f1-drivers":
      return loadF1Drivers();
    case "bts":
      return loadBts();
    case "moments":
      return loadMoments(parseTeams(params.teams), Number(params.since));
  }
}

const LIVE_CARDS = 6;

// "Up to six live cards" total (spec), games first, then cricket, then tennis, each list capped
// by what's left in the budget rather than by its own fixed size.
async function loadLive(): Promise<LiveBlockData> {
  const home = await getHomeData();
  const games = home.liveGames.slice(0, LIVE_CARDS);
  const cricket = home.liveCricket.slice(0, Math.max(0, LIVE_CARDS - games.length));
  const tennis = home.liveTennis.slice(0, Math.max(0, LIVE_CARDS - games.length - cricket.length));
  return { games, cricket, tennis };
}

// pg hands back a Date for an uncast timestamp column (see memory: "pg dates are not strings"), so every
// date leaves here as an ISO string whatever the query did.
const iso = (d: string | Date) => new Date(d).toISOString();

function fixtureFromGame(league: League, g: GameRow, teamEspnId: string): FixtureLine {
  const home = g.home_team_espn_id === teamEspnId;
  const mine = home ? g.home_score : g.away_score;
  const theirs = home ? g.away_score : g.home_score;
  const played = g.completed && mine !== null && theirs !== null;
  return {
    id: g.espn_id,
    date: iso(g.date),
    opponent: teamDisplayName(home ? g.away_name : g.home_name),
    home,
    href: `/${league}/games/${g.espn_id}`,
    // The feed files a placeholder 0-0 on games not yet played: a score belongs only to a game that is over or in play.
    score: (g.completed || g.status_state === "in") && mine !== null && theirs !== null ? `${mine}-${theirs}` : null,
    result: played ? (mine! > theirs! ? "W" : mine! < theirs! ? "L" : "D") : null,
    live: g.status_state === "in",
    status: g.status_state === "in" ? g.status_detail : null,
    league,
    // A placeholder clock time would read as a real one: the day and "TBD" instead.
    ...(isTimeTbd(g, league) ? { tbd: `${formatGameDate(g.date, league, { weekday: "short", month: "short", day: "numeric" }, g.local_date)} · TBD` } : {}),
  };
}

// The table a team sits in: its division (NFL, MLB) or conference, the same grouping the standings
// page prints, so "2nd" here is the "2" on that page. Soccer and cricket are one table.
function tableOf(league: League, rows: StandingRow[], teamEspnId: string): { rows: StandingRow[]; name: string | null } {
  const { mode, sections } = groupStandings(league, rows);
  const section = sections.find(([, list]) => list.some((r) => r.team_espn_id === teamEspnId));
  if (!section) return { rows: [], name: null };
  return { rows: section[1], name: mode === "default" && sections.length > 1 ? section[0] : null };
}

const DIFFERENCE_WORD = (league: League) => (league === "mlb" ? "run" : usesRecordOrder(league) ? "point" : "goal");

async function teamSummary(league: League, teamEspnId: string, games: GameRow[]): Promise<TeamSummary> {
  const table = tableOf(league, await getStandings(league), teamEspnId);
  const i = table.rows.findIndex((r) => r.team_espn_id === teamEspnId);
  const row = i === -1 ? null : table.rows[i];
  // A table nobody has played in is listed by name: no position to report yet.
  const record = usesRecordOrder(league);
  const played = row ? row.wins + row.losses + (row.draws ?? 0) + (row.no_result ?? 0) : 0;
  // A team that has not played yet sits in the table only by its name's tie-break, so it has no position either.
  const ranked = row !== null && !row.unranked && played > 0;
  const diff = row && row.goals_for !== null && row.goals_against !== null ? row.goals_for - row.goals_against : null;
  const form = games
    .filter((g) => g.completed)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5)
    .map((g) => fixtureFromGame(league, g, teamEspnId).result)
    .filter((r): r is "W" | "L" | "D" => r !== null)
    .reverse();
  return {
    leagueLabel: table.name ? `${LEAGUE_LABEL[league]} · ${table.name}` : LEAGUE_LABEL[league],
    position: ranked ? (row.rank !== null && !record ? row.rank : i + 1) : null,
    figure: ranked ? (record ? `${row.wins}-${row.losses}` : `${row.points ?? 0} pts`) : null,
    record: ranked ? `${played} played${diff !== null ? ` · ${diff > 0 ? "+" : ""}${diff} ${DIFFERENCE_WORD(league)} difference` : ""}` : null,
    form,
  };
}

async function loadTeamNext(league: League, slug: string): Promise<TeamNextBlockData | null> {
  const team = await getTeamBySlug(league, slug);
  if (!team) return null;
  const seasons = await getTeamSeasons(league, team.espn_id);
  const games = seasons.length ? await getTeamGamesBySeason(league, team.espn_id, seasons[0]) : [];
  const last = games.find((g) => g.completed);
  const next = games
    .filter((g) => !g.completed && !isGameCalledOff(g))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, NEXT);
  return {
    team: { name: teamDisplayName(team.name), href: `/${league}/teams/${team.slug}`, color: team.color },
    summary: await teamSummary(league, team.espn_id, games),
    last: last ? fixtureFromGame(league, last, team.espn_id) : null,
    next: next.map((g) => fixtureFromGame(league, g, team.espn_id)),
  };
}

function fixtureFromCricket(m: CricketSeriesMatch, sideId: string): FixtureLine {
  const home = m.home?.id === sideId;
  const mine = home ? m.home : m.away;
  const theirs = home ? m.away : m.home;
  return {
    id: m.espn_id,
    date: iso(m.date),
    opponent: theirs?.name ?? "TBC",
    home,
    href: m.scorecard_league ? `/${m.scorecard_league}/games/${m.espn_id}` : `/cricket/series/${m.series_espn_id}`,
    score: (m.status_state ?? "pre") === "pre" ? null : (mine?.score ?? null),
    result: m.status_state === "post" ? (mine?.winner ? "W" : theirs?.winner ? "L" : "D") : null,
    live: m.status_state === "in",
    status: m.status_state === "in" ? m.status_summary : null,
    league: "cricket",
  };
}

async function loadCricketSide(sideId: string): Promise<TeamNextBlockData | null> {
  const series = (await getCricketSeriesWindow(14, 60)).filter((s) => s.teams.some((t) => t.id === sideId)).slice(0, 4);
  if (series.length === 0) return null;
  const side = series.flatMap((s) => s.teams).find((t) => t.id === sideId)!;
  const matches = (await Promise.all(series.map((s) => getCricketSeriesMatches(s.espn_id))))
    .flat()
    .filter((m) => m.home?.id === sideId || m.away?.id === sideId)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const played = matches.filter((m) => m.status_state === "post");
  const coming = matches.filter((m) => m.status_state !== "post").slice(0, NEXT);
  return {
    team: { name: side.name, href: `/cricket/series/${series[0].espn_id}`, color: null },
    last: played.length ? fixtureFromCricket(played[played.length - 1], sideId) : null,
    next: coming.map((m) => fixtureFromCricket(m, sideId)),
  };
}

function tableFrom(league: League, rows: StandingRow[], label: string, href: string): StandingsBlockData {
  // Bands read against the whole table: ESPN's notes for a finished season, position while it runs.
  const bands = topBands(league, rows, TABLE_ROWS);
  const record = usesRecordOrder(league);
  return {
    label,
    href,
    record,
    rows: rows.slice(0, TABLE_ROWS).map((r, i) => {
      const position = r.rank ?? i + 1;
      return {
        position,
        name: teamDisplayName(r.name),
        href: `/${league}/teams/${r.slug}`,
        played: r.wins + r.losses + (r.draws ?? 0) + (r.no_result ?? 0),
        figure: record ? `${r.wins}-${r.losses}` : String(r.points ?? 0),
        netRunRate: r.net_run_rate,
        zone: bands[i]?.cls ?? null,
        color: r.color,
      };
    }),
  };
}

async function loadStandings(league: League, label: string, href: string): Promise<StandingsBlockData | null> {
  const rows = await getStandings(league);
  return rows.length ? tableFrom(league, rows, label, href) : null;
}

async function loadSeriesStandings(seriesId: string): Promise<StandingsBlockData | null> {
  const series = await getCricketSeries(seriesId);
  if (!series?.league || !hasStandings(series.league)) return null;
  // A series carries its own season; use that season's table (not whatever is most recent on
  // file) so an ended series still shows the table it actually played.
  const rows = series.season !== null ? await getStandingsBySeason(series.league, series.season) : await getStandings(series.league);
  return rows.length ? tableFrom(series.league, rows, series.name, `/cricket/series/${seriesId}`) : null;
}

async function loadPlayerForm(league: League, slug: string): Promise<PlayerFormBlockData | null> {
  const player = await getPlayerBySlug(league, slug);
  if (!player) return null;
  const base = { player: { name: player.name, href: `/${league}/players/${player.slug}`, team: player.team_name }, games: [] as PlayerFormBlockData["games"] };
  if (isCricketLeague(league)) {
    const innings = await getCricketRecentInnings(league, player.espn_id, 5);
    const games = innings.map((r) => {
      const batted = r.runs !== null;
      const display = batted ? `${r.runs}${r.not_out ? "*" : ""}` : r.wickets !== null ? `${r.wickets}-${r.conceded ?? 0}` : "";
      return { id: r.game_espn_id, date: iso(r.date), opponent: teamDisplayName(r.opponent_name), value: r.runs, display, href: `/${league}/games/${r.game_espn_id}` };
    });
    const first = innings[0];
    return { ...base, statLabel: "Runs", verb: first && first.runs === null ? "took" : "made", games };
  }
  const sport = playerSport(league);
  if (!sport) return null;
  const log = await getPlayerLog(league, player.espn_id);
  const profile = sportProfile(sport, log);
  const rows = log.filter(profile.played).slice(0, 5);
  const label = profile.form.label;
  return {
    ...base,
    statLabel: label,
    verb: sport === "nba" ? "scored" : "had",
    games: rows.map((r) => {
      const value = profile.form.value(r);
      return {
        id: r.game_espn_id,
        date: iso(r.date),
        opponent: teamDisplayName(r.opponent_name),
        value,
        display: value === null ? "" : sport === "nba" ? String(value) : `${value} ${label.toLowerCase()}`,
        href: `/${league}/games/${r.game_espn_id}`,
      };
    }),
  };
}

async function loadF1Drivers(): Promise<F1DriversBlockData | null> {
  const [season] = await getF1Seasons();
  if (!season) return null;
  const [rows, calendar] = await Promise.all([getF1DriverStandings(season), getF1Calendar(season)]);
  const now = Date.now();
  const next = calendar.find((ev) => !ev.race_completed && f1RaceInstant(ev).getTime() > now) ?? null;
  return {
    season,
    rows: rows.slice(0, 5).map((r) => ({ position: r.position, name: r.name, href: `/f1/drivers/${r.slug}`, constructor: r.constructor_name, points: r.points })),
    nextRace: next
      ? { name: next.name, href: `/f1/events/${next.espn_id}`, raceIso: f1RaceInstant(next).toISOString(), circuitTimeZone: f1CircuitTimeZone(next.circuit_name, next.espn_id) }
      : null,
  };
}

function loadBts(): BtsBlockData {
  return {
    articles: listArticles()
      .slice(0, 3)
      .map((a) => {
        const art = articleArt(a);
        return { slug: a.slug, title: a.title, number: art.number, caption: art.caption, palette: art.palette, sport: art.sport, href: `/beyond-the-scoreline/${a.slug}` };
      }),
  };
}
