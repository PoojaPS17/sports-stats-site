// The reads behind "Who leads" (rules in whoLeads.ts). The boards are the Leaders page's own: `loadLeaders` is the
// function that page and its share image call, so the leader named here is the player on rank 1 of the board the card
// links to. A competition is included only when its recap (offseason.ts) says its season is not over, that recap is for
// the same season the Leaders page shows, and it has a result in the last IN_SEASON_DAYS days.
import { unstable_cache } from "next/cache";
import { pool } from "./db";
import { ALL_LEAGUES, LEAGUE_LABEL, type League } from "./leagues";
import { loadLeaders } from "./leadersView";
import { getOffseasonRecap } from "./offseason";
import { IN_SEASON_DAYS, MAX_LEAGUE_CARDS, SIXES_UNIT, boardLeader, type LeaderEntry, type LeagueLeaders } from "./whoLeads";

const BOARDS_PER_LEAGUE = 3;

/** Competitions with a finished game in the window, newest result first. */
async function recentLeagues(): Promise<{ league: League; last: string }[]> {
  const { rows } = await pool.query(
    `select league, max(date) as last from games
     where league = any($1::text[]) and completed and date <= now() and date > now() - make_interval(days => $2)
     group by league order by last desc`,
    [ALL_LEAGUES, IN_SEASON_DAYS]
  );
  return rows.map((r) => ({ league: r.league as League, last: new Date(r.last).toISOString() }));
}

async function readOne(league: League, last: string): Promise<LeagueLeaders | null> {
  const recap = await getOffseasonRecap(league);
  if (!recap || recap.seasonOver) return null;
  const { boards, season } = await loadLeaders(league);
  // The recap and the Leaders page must be talking about the same season, or the card would not match its link.
  if (season === null || season !== recap.season) return null;
  const entries = boards
    .filter((b) => b.unit !== SIXES_UNIT)
    .map(boardLeader)
    .filter((e): e is LeaderEntry => e !== null)
    .slice(0, BOARDS_PER_LEAGUE);
  if (entries.length === 0) return null;
  return { league, leagueLabel: LEAGUE_LABEL[league], seasonLabel: recap.seasonLabel, lastResultOn: last, entries };
}

export async function readWhoLeads(): Promise<LeagueLeaders[]> {
  const candidates = await recentLeagues();
  const out = await Promise.all(candidates.map((c) => readOne(c.league, c.last).catch((e) => { console.error("who leads", c.league, e); return null; })));
  return out.filter((x): x is LeagueLeaders => x !== null).slice(0, MAX_LEAGUE_CARDS);
}

const cached = unstable_cache(readWhoLeads, ["home-who-leads"], { revalidate: 600 });

/** The cards: possibly none, in which case the module is left out. */
export async function getWhoLeads(): Promise<LeagueLeaders[]> {
  try {
    return await cached();
  } catch {
    return [];
  }
}
