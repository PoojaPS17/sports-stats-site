// Server side of the homepage blocks: one loader per type, each reading through the
// existing query layer and shaping a small payload (lib/blockTypes.ts) that the client
// draws. Null means "this entity is gone", which the client shows as an empty block.
import type { BlockPayload, BlockType, BtsBlockData, F1DriversBlockData, FixtureLine, LiveBlockData, PlayerFormBlockData, StandingsBlockData, TeamNextBlockData } from "./blockTypes";
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
import { zoneRules } from "./standingsZones";
import { usesRecordOrder } from "./standingsOrder";
import { playerSport, sportProfile } from "./playerProfile";
import { isGameCalledOff } from "./gameStatus";
import { teamDisplayName } from "./teamName";

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
  }
}

async function loadLive(): Promise<LiveBlockData> {
  const home = await getHomeData();
  return { games: home.liveGames.slice(0, 6), cricket: home.liveCricket.slice(0, 6), tennis: home.liveTennis.slice(0, 4) };
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
    score: mine !== null && theirs !== null ? `${mine}-${theirs}` : null,
    result: played ? (mine! > theirs! ? "W" : mine! < theirs! ? "L" : "D") : null,
    live: g.status_state === "in",
    status: g.status_state === "in" ? g.status_detail : null,
    league,
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
    score: mine?.score ?? null,
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
  const zone = zoneRules(league, rows.length);
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
        zone: zone?.(position)?.cls ?? null,
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
