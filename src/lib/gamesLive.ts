/* eslint-disable @typescript-eslint/no-explicit-any -- ESPN feed JSON has no published schema */
// Live league games straight from ESPN at request time. The 15-minute scrape is
// fine for fixtures and results; a game in play reads ESPN's scoreboard for its
// league here with a 30-second cache, laid over the stored rows.
import type { GameRow, League } from "./queries";
import { isCricketLeague } from "./leagues";

const LIVE_REVALIDATE = 30;

const SCOREBOARD_PATH: Partial<Record<League, string>> = {
  nba: "basketball/nba",
  nfl: "football/nfl",
  epl: "soccer/eng.1",
  laliga: "soccer/esp.1",
  bundesliga: "soccer/ger.1",
  seriea: "soccer/ita.1",
  ucl: "soccer/uefa.champions",
  ipl: "cricket/8048",
  bbl: "cricket/8044",
  cwc: "cricket/8039",
  t20wc: "cricket/8604",
  wpl: "cricket/21282",
  wbbl: "cricket/21284",
  wcwc: "cricket/8584",
  wt20wc: "cricket/8634",
};

async function fetchScoreboard(league: League): Promise<Map<string, any>> {
  const out = new Map<string, any>();
  const path = SCOREBOARD_PATH[league];
  if (!path) return out;
  try {
    const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard`, { next: { revalidate: LIVE_REVALIDATE } });
    if (!res.ok) return out;
    const data = await res.json();
    for (const ev of data?.events ?? []) if (ev?.id) out.set(String(ev.id), ev);
  } catch {
    // The stored row stands.
  }
  return out;
}

/** True when a game could be in play now: kicked off within the last nine hours, or about to. */
function couldBeLive(g: GameRow, now: number): boolean {
  if (g.status_state === "in") return true;
  if (g.completed) return false;
  const t = new Date(g.date).getTime();
  return t <= now + 15 * 60_000 && t >= now - 9 * 3_600_000;
}

function applyEvent(g: GameRow, ev: any): GameRow {
  const comp = ev.competitions?.[0];
  const state: string | null = ev.status?.type?.state ?? comp?.status?.type?.state ?? g.status_state;
  const home = (comp?.competitors ?? []).find((c: any) => c.homeAway === "home");
  const away = (comp?.competitors ?? []).find((c: any) => c.homeAway === "away");
  if (!home || !away) return g;
  const cricket = isCricketLeague(g.league);
  const num = (s: unknown) => (typeof s === "string" && /^\d+$/.test(s) ? Number(s) : typeof s === "number" ? s : null);
  const completed = state === "post";
  return {
    ...g,
    status_state: state,
    status_detail: ev.status?.type?.shortDetail ?? g.status_detail,
    completed: completed || g.completed,
    home_score: cricket ? g.home_score : num(home.score) ?? g.home_score,
    away_score: cricket ? g.away_score : num(away.score) ?? g.away_score,
    home_score_display: cricket && typeof home.score === "string" && home.score ? home.score : g.home_score_display,
    away_score_display: cricket && typeof away.score === "string" && away.score ? away.score : g.away_score_display,
    home_winner: completed ? home.winner === true : g.home_winner,
    away_winner: completed ? away.winner === true : g.away_winner,
  };
}

/** Stored rows with ESPN's current state over any that could be in play right now. */
export async function overlayLiveGames(rows: GameRow[]): Promise<GameRow[]> {
  const now = Date.now();
  const leagues = [...new Set(rows.filter((g) => couldBeLive(g, now)).map((g) => g.league))];
  if (leagues.length === 0) return rows;
  const boards = new Map(await Promise.all(leagues.map(async (l) => [l, await fetchScoreboard(l)] as const)));
  return rows.map((g) => {
    const ev = boards.get(g.league)?.get(g.espn_id);
    return ev ? applyEvent(g, ev) : g;
  });
}
