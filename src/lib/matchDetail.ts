/* eslint-disable @typescript-eslint/no-explicit-any -- parsing loosely-typed raw ESPN
   JSON, same justification the scraper scripts use for the same API responses */
import type { League } from "./queries";

const SPORT_PATH: Record<League, string> = {
  nba: "basketball/nba",
  nfl: "football/nfl",
  epl: "soccer/eng.1",
  ipl: "cricket/8048",
  bbl: "cricket/8044",
  cwc: "cricket/8039",
  t20wc: "cricket/8604",
  laliga: "soccer/esp.1",
  bundesliga: "soccer/ger.1",
  seriea: "soccer/ita.1",
  ucl: "soccer/uefa.champions",
};

// Live fallback for games not yet in game_details: matches in progress, upcoming
// ones (whose "box score" is each side's season averages), and completed games the
// backfill hasn't reached. Everything stored comes through extractGameDetails below,
// so the page renders the same shape either way.
export async function fetchMatchSummary(league: League, espnId: string): Promise<any | null> {
  try {
    const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${SPORT_PATH[league]}/summary?event=${espnId}`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export interface TeamStatGroup {
  teamId: string;
  teamName: string;
  stats: { label: string; value: string }[];
}

// NBA/NFL/EPL all expose boxscore.teams[] with the same {team, statistics[]} shape.
export function parseTeamStats(data: any): TeamStatGroup[] {
  return (data.boxscore?.teams ?? []).map((t: any) => ({
    teamId: t.team?.id,
    teamName: t.team?.displayName ?? t.team?.name,
    stats: (t.statistics ?? []).map((s: any) => ({ label: s.label ?? s.displayName ?? s.name, value: s.displayValue })),
  }));
}

export interface PlayerStatCategory {
  name: string;
  labels: string[];
  rows: { athleteId: string; name: string; stats: string[] }[];
}

export interface TeamPlayerBox {
  teamId: string;
  teamName: string;
  categories: PlayerStatCategory[];
}

// NBA/NFL: boxscore.players[team].statistics[category].athletes[] (parallel to category.labels[])
export function parseAmericanPlayerBox(data: any): TeamPlayerBox[] {
  return (data.boxscore?.players ?? []).map((group: any) => ({
    teamId: group.team?.id,
    teamName: group.team?.displayName ?? group.team?.name,
    categories: (group.statistics ?? []).map((cat: any) => ({
      name: cat.text ?? cat.name,
      labels: cat.labels ?? [],
      rows: (cat.athletes ?? [])
        .filter((a: any) => a.athlete)
        .map((a: any) => ({ athleteId: a.athlete.id, name: a.athlete.displayName, stats: a.stats ?? [] })),
    })),
  }));
}

// Soccer: rosters[team].roster[] carries a flat named stat list per player instead of
// category/label pairs — bundle it into one synthetic "Match" category so the same
// table shape works for both American-sports and soccer box scores.
export function parseSoccerPlayerBox(data: any): TeamPlayerBox[] {
  return (data.rosters ?? []).map((r: any) => {
    const players = (r.roster ?? []).filter((p: any) => p.active && (p.stats ?? []).length > 0);
    const labels = players[0]?.stats?.map((s: any) => s.shortDisplayName ?? s.name) ?? [];
    return {
      teamId: r.team?.id,
      teamName: r.team?.displayName ?? r.team?.name,
      categories:
        players.length === 0
          ? []
          : [
              {
                name: "Match",
                labels,
                rows: players.map((p: any) => ({
                  athleteId: p.athlete.id,
                  name: p.athlete.displayName,
                  stats: (p.stats ?? []).map((s: any) => s.displayValue),
                })),
              },
            ],
    };
  });
}

export interface CricketInningsRow {
  name: string;
  athleteId: string;
  stats: string[];
}

export interface CricketTeamScorecard {
  teamId: string;
  teamName: string;
  battingLabels: string[];
  battingRows: CricketInningsRow[];
  bowlingLabels: string[];
  bowlingRows: CricketInningsRow[];
}

const BATTING_FIELDS: [string, string][] = [
  ["runs", "R"],
  ["ballsFaced", "B"],
  ["fours", "4s"],
  ["sixes", "6s"],
  ["strikeRate", "SR"],
];
const BOWLING_FIELDS: [string, string][] = [
  ["overs", "O"],
  ["maidens", "M"],
  ["conceded", "R"],
  ["wickets", "W"],
  ["economyRate", "Econ"],
];

// Cricket has no boxscore/rosters-with-flat-stats shape like the other sports — each
// player's batting and bowling figures live inside rosters[].roster[].linescores[],
// one entry per innings they took part in, with the underlying stat names differing
// depending on whether that entry represents a batting or a bowling contribution.
export function parseCricketScorecard(data: any): CricketTeamScorecard[] {
  return (data.rosters ?? []).map((r: any) => {
    const battingRows: CricketInningsRow[] = [];
    const bowlingRows: CricketInningsRow[] = [];

    for (const p of r.roster ?? []) {
      for (const period of p.linescores ?? []) {
        const stats: any[] = period.statistics?.categories?.[0]?.stats ?? [];
        if (stats.length === 0) continue;
        const get = (name: string) => stats.find((s) => s.name === name)?.displayValue;
        const isBatting = stats.some((s) => s.name === "ballsFaced");
        const isBowling = stats.some((s) => s.name === "overs");

        if (isBatting && Number(get("ballsFaced") ?? 0) > 0) {
          battingRows.push({
            athleteId: p.athlete.id,
            name: p.athlete.displayName,
            stats: BATTING_FIELDS.map(([key]) => get(key) ?? "-"),
          });
        }
        if (isBowling && Number(get("overs") ?? 0) > 0) {
          bowlingRows.push({
            athleteId: p.athlete.id,
            name: p.athlete.displayName,
            stats: BOWLING_FIELDS.map(([key]) => get(key) ?? "-"),
          });
        }
      }
    }

    return {
      teamId: r.team?.id,
      teamName: r.team?.displayName ?? r.team?.name,
      battingLabels: BATTING_FIELDS.map(([, label]) => label),
      battingRows,
      bowlingLabels: BOWLING_FIELDS.map(([, label]) => label),
      bowlingRows,
    };
  });
}

/* ------------------------------------------------------------------------ */
/* Stored match report                                                       */
/* ------------------------------------------------------------------------ */

// Everything the match page shows beyond the score, in one document. The scraper
// extracts it from ESPN's summary once a game is complete and stores it in
// game_details; the page reads that row and only falls back to a live fetch for games
// that are still in progress or not yet stored. Older seasons carry less: ESPN has no
// formations before ~2020 and no scoring plays or win probability for old NFL games,
// so every field is optional and each section renders only when its data exists.

export type TimelineEventType = "goal" | "own-goal" | "penalty" | "penalty-missed" | "yellow" | "red" | "sub" | "shootout" | "score";

export interface TimelineEvent {
  period: number;
  clock: string;
  type: TimelineEventType;
  /** For a goal, the team credited; for an own goal, the team that benefits. */
  team_id: string | null;
  players: { id: string; name: string }[];
  text: string;
  /** NFL scoring plays carry the play type ("Rushing Touchdown", "Field Goal"). */
  label?: string;
  /** Running score after a scoring event. */
  home_score: number | null;
  away_score: number | null;
}

export interface LineupPlayer {
  id: string;
  name: string;
  jersey: string | null;
  position: string | null;
  /** Slot in the formation (1 = keeper), for ordering. */
  place: number | null;
  /** Minute the player came on (substitutes) or went off (starters). */
  minute: string | null;
  in_for: string | null;
}

export interface TeamLineup {
  team_id: string;
  formation: string | null;
  starters: LineupPlayer[];
  subs: LineupPlayer[];
}

export interface WinProbPoint {
  period: number;
  clock: string;
  /** Home win probability, 0-100. */
  home: number;
  home_score: number;
  away_score: number;
}

export interface MatchLeader {
  team_id: string;
  label: string;
  athlete_id: string;
  athlete: string;
  value: string;
}

export interface GameDetails {
  venue: string | null;
  city: string | null;
  attendance: number | null;
  officials: { name: string; role: string }[];
  /** Score per period for each side, when the feed has them. */
  linescores: { home: string[]; away: string[] } | null;
  events: TimelineEvent[];
  lineups: TeamLineup[];
  team_stats: TeamStatGroup[];
  player_box: TeamPlayerBox[];
  scorecard: CricketTeamScorecard[];
  leaders: MatchLeader[];
  win_probability: WinProbPoint[];
}

export type MatchSport = "soccer" | "cricket" | "american";

function clockValue(e: any): number {
  return typeof e.clock?.value === "number" ? e.clock.value : 0;
}

function soccerEvents(data: any, homeId: string, awayId: string): TimelineEvent[] {
  const raw: any[] = [...(data.keyEvents ?? [])].sort((a, b) => (a.period?.number ?? 0) - (b.period?.number ?? 0) || clockValue(a) - clockValue(b));
  let home = 0;
  let away = 0;
  const out: TimelineEvent[] = [];
  for (const e of raw) {
    const kind = String(e.type?.type ?? e.type?.text ?? "").toLowerCase();
    let type: TimelineEventType | null = null;
    if (e.shootout) type = e.scoringPlay ? "shootout" : null;
    else if (e.scoringPlay) type = kind.includes("own") ? "own-goal" : kind.includes("penalty") ? "penalty" : "goal";
    else if (kind.includes("penalty")) type = "penalty-missed";
    else if (kind.includes("yellow")) type = "yellow";
    else if (kind.includes("red")) type = "red";
    else if (kind.includes("substitution")) type = "sub";
    if (!type) continue;
    const teamId = e.team?.id != null ? String(e.team.id) : null;
    const counts = e.scoringPlay && !e.shootout;
    if (counts) {
      if (teamId === homeId) home++;
      else if (teamId === awayId) away++;
    }
    out.push({
      period: e.period?.number ?? 0,
      clock: e.clock?.displayValue ?? "",
      type,
      team_id: teamId,
      players: (e.participants ?? [])
        .map((p: any) => ({ id: p.athlete?.id != null ? String(p.athlete.id) : "", name: p.athlete?.displayName ?? "" }))
        .filter((p: { id: string; name: string }) => p.id && p.name),
      text: e.text ?? e.shortText ?? "",
      home_score: counts ? home : null,
      away_score: counts ? away : null,
    });
  }
  return out;
}

function scoringPlays(data: any): TimelineEvent[] {
  return (data.scoringPlays ?? []).map((p: any) => ({
    period: p.period?.number ?? 0,
    clock: p.clock?.displayValue ?? "",
    type: "score" as const,
    team_id: p.team?.id != null ? String(p.team.id) : null,
    players: [],
    text: p.text ?? "",
    label: p.type?.text ?? undefined,
    home_score: typeof p.homeScore === "number" ? p.homeScore : null,
    away_score: typeof p.awayScore === "number" ? p.awayScore : null,
  }));
}

function minuteNumber(m: string | null): number {
  const n = parseInt(m ?? "", 10);
  return Number.isFinite(n) ? n : 999;
}

function soccerLineups(data: any): TeamLineup[] {
  const subMinute = (p: any): string | null => (p.plays ?? []).find((x: any) => x.substitution)?.clock?.displayValue ?? null;
  const player = (p: any): LineupPlayer => ({
    id: String(p.athlete.id),
    name: p.athlete.displayName ?? p.athlete.fullName ?? "",
    jersey: p.jersey ?? null,
    position: p.position?.abbreviation ?? null,
    place: Number(p.formationPlace) || null,
    minute: null,
    in_for: null,
  });
  return (data.rosters ?? [])
    .map((r: any) => {
      const players = (r.roster ?? []).filter((p: any) => p.athlete?.id);
      const starters = players
        .filter((p: any) => p.starter)
        .map((p: any) => ({ ...player(p), minute: p.subbedOut ? subMinute(p) : null }))
        .sort((a: LineupPlayer, b: LineupPlayer) => (a.place ?? 99) - (b.place ?? 99));
      const subs = players
        .filter((p: any) => !p.starter && p.subbedIn)
        .map((p: any) => ({ ...player(p), minute: subMinute(p), in_for: p.subbedInFor?.athlete?.displayName ?? null }))
        .sort((a: LineupPlayer, b: LineupPlayer) => minuteNumber(a.minute) - minuteNumber(b.minute));
      return { team_id: String(r.team?.id ?? ""), formation: r.formation ?? null, starters, subs };
    })
    .filter((l: TeamLineup) => l.team_id && l.starters.length > 0);
}

const MAX_WIN_PROB_POINTS = 240;

function winProbability(data: any): WinProbPoint[] {
  const wp: any[] = data.winprobability ?? [];
  if (wp.length === 0) return [];
  const plays = new Map<string, any>();
  for (const p of data.plays ?? []) plays.set(String(p.id), p);
  for (const d of data.drives?.previous ?? []) for (const p of d.plays ?? []) plays.set(String(p.id), p);
  const pts: WinProbPoint[] = [];
  for (const w of wp) {
    const p = plays.get(String(w.playId));
    if (!p || typeof w.homeWinPercentage !== "number") continue;
    pts.push({
      period: p.period?.number ?? 0,
      clock: p.clock?.displayValue ?? "",
      home: Math.round(w.homeWinPercentage * 1000) / 10,
      home_score: p.homeScore ?? 0,
      away_score: p.awayScore ?? 0,
    });
  }
  if (pts.length <= MAX_WIN_PROB_POINTS) return pts;
  const step = pts.length / MAX_WIN_PROB_POINTS;
  const out: WinProbPoint[] = [];
  for (let i = 0; i < MAX_WIN_PROB_POINTS; i++) out.push(pts[Math.floor(i * step)]);
  out.push(pts[pts.length - 1]);
  return out;
}

function matchLeaders(data: any): MatchLeader[] {
  const out: MatchLeader[] = [];
  for (const t of data.leaders ?? []) {
    for (const cat of t.leaders ?? []) {
      const l = cat.leaders?.[0];
      if (!l?.athlete?.id || !l.displayValue) continue;
      out.push({ team_id: String(t.team?.id ?? ""), label: cat.displayName ?? cat.name ?? "", athlete_id: String(l.athlete.id), athlete: l.athlete.displayName ?? l.athlete.fullName ?? "", value: String(l.displayValue) });
    }
  }
  return out;
}

function linescores(data: any): GameDetails["linescores"] {
  const comps: any[] = data.header?.competitions?.[0]?.competitors ?? [];
  const side = (ha: string) => (comps.find((c) => c.homeAway === ha)?.linescores ?? []).map((l: any) => String(l.displayValue ?? "")).filter((v: string) => v !== "");
  const home = side("home");
  const away = side("away");
  return home.length > 0 && away.length > 0 ? { home, away } : null;
}

export function extractGameDetails(sport: MatchSport, data: any, homeId: string, awayId: string): GameDetails {
  const info = data.gameInfo ?? {};
  const attendance = Number(info.attendance);
  return {
    venue: info.venue?.fullName ?? null,
    city: info.venue?.address?.city ?? null,
    attendance: attendance > 0 ? attendance : null,
    officials: (info.officials ?? [])
      .map((o: any) => ({ name: o.displayName ?? o.fullName ?? "", role: o.position?.displayName ?? o.position?.name ?? "" }))
      .filter((o: { name: string }) => o.name),
    linescores: sport === "cricket" ? null : linescores(data),
    events: sport === "soccer" ? soccerEvents(data, homeId, awayId) : sport === "american" ? scoringPlays(data) : [],
    lineups: sport === "soccer" ? soccerLineups(data) : [],
    team_stats: parseTeamStats(data),
    player_box: sport === "cricket" ? [] : sport === "soccer" ? parseSoccerPlayerBox(data) : parseAmericanPlayerBox(data),
    scorecard: sport === "cricket" ? parseCricketScorecard(data) : [],
    leaders: sport === "american" ? matchLeaders(data) : [],
    win_probability: sport === "american" ? winProbability(data) : [],
  };
}
