import { cache } from "react";
import { unstable_cache } from "next/cache";
import { SOCCER_LEAGUES } from "@/lib/leagues";
import { LEAGUES, type League, getRecentAndUpcoming, getFeaturedGames, getNextFixtureDate, type GameRow } from "@/lib/queries";
import { getLiveGames, getUpcomingGames, getNextF1Event } from "@/lib/homeFeed";
import { byPriority, getLiveCricketMatches, getUpcomingCricketMatches, type CricketSeriesMatch } from "@/lib/cricketSeries";
import { getTennisDay, type TennisMatch } from "@/lib/tennis";
import { easternDay } from "@/lib/tennisFeed";
import { overlayLiveGames } from "@/lib/gamesLive";
import { overlayLiveCricket } from "@/lib/cricketLive";
import { isFeaturedCricket, isFeaturedSeriesId } from "@/lib/cricketFeatured";
import { overlayLiveTennis } from "@/lib/tennisLive";
import { tennisMatchStatus } from "@/lib/tennisDisplay";
import type { F1EventRow } from "@/lib/f1";

// Everything the homepage shows, read once per request and cached in tiers by how
// often the underlying data can actually change. The page itself regenerates every
// 10 seconds so that in-play scores stay current, but only the ESPN live overlays
// (10-second fetch cache, and only for matches that could be in play) run at that
// cadence; the stored lists behind them are re-read at the tier below.
//
//   What                                   Re-read   Why
//   ESPN in-play overlays (scores, states)  10 s     the only thing that moves by the second
//   Which stored matches are live / today   30 s     the scrapers land every 15 minutes
//   Fixtures, results, section lists        60 s     same; a minute's lag on a fixture list is invisible
//   Next F1 round                            1 h     a calendar fact that changes a few times a year
const TIER = { LIVE_LIST: 30, FIXTURES: 60, NEWS: 900, SEASON: 3600 } as const;

// Leagues with a homepage block of their own; cricket has one block for the whole sport.
export const SECTION_LEAGUES: League[] = LEAGUES.filter((l) => l !== "ipl");

const readLiveLists = unstable_cache(
  async () => {
    const [games, cricket] = await Promise.all([getLiveGames(), getLiveCricketMatches(true)]);
    return { games, cricket };
  },
  ["home-live-lists"],
  { revalidate: TIER.LIVE_LIST }
);

const readTennisDay = unstable_cache(async (day: string) => getTennisDay(day), ["home-tennis-day"], { revalidate: TIER.LIVE_LIST });

const readFixtures = unstable_cache(
  async () => {
    const [upcoming, cricketUpcoming, featured, sections] = await Promise.all([
      getUpcomingGames(6, 2),
      // A busy week (multiple concurrent bilateral tours plus a tournament like the
      // Asian Games) regularly schedules 30+ featured internationals in 7 days; a
      // small pool ordered by date alone fills up with whatever starts soonest and
      // cuts the rest before the importance ranking below ever runs on them. 60 gives
      // that ranking a pool wide enough to actually choose from.
      getUpcomingCricketMatches(60, 7, true),
      Promise.all([...LEAGUES, "ucl" as const].map((l) => getFeaturedGames(l, 3))).then((x) => x.flat()),
      Promise.all(SECTION_LEAGUES.map(async (league) => ({ league, games: (await getRecentAndUpcoming(league, 2, 5)).slice(0, 8) }))),
    ]);
    return { upcoming, cricketUpcoming, featured, sections };
  },
  ["home-fixtures"],
  { revalidate: TIER.FIXTURES }
);

// The next stored fixture for every league behind a sport tile in the picker (all football competitions, NFL, NBA,
// MLB), for the tile's status line. Cricket, tennis and F1 read their own lists above. A short tier: the line says
// "in 5 hours", and a fixture moved or added should not take an hour to show.
const NEXT_FIXTURE_LEAGUES: League[] = [...SOCCER_LEAGUES, "nfl", "nba", "mlb"];
const readNextFixtures = unstable_cache(
  async () => Object.fromEntries(await Promise.all(NEXT_FIXTURE_LEAGUES.map(async (l) => [l, await getNextFixtureDate(l)] as const))) as Partial<Record<League, string | null>>,
  ["home-next-fixtures"],
  { revalidate: 300 }
);

// The next F1 round: the Coming up tab and the Formula 1 tile read it on every render.
const readF1 = unstable_cache(async () => getNextF1Event(7), ["home-next-f1"], { revalidate: TIER.SEASON });

// Only headline cricket (the featured competitions and official internationals, see
// cricketFeatured.ts) reaches the homepage; the stored lists are already filtered,
// this catches what the ESPN live overlay adds from other competitions.
export const importantCricket = isFeaturedCricket;

const FULL_MEMBERS = /^(India|Australia|England|Pakistan|South Africa|New Zealand|Sri Lanka|West Indies|Bangladesh|Afghanistan|Zimbabwe|Ireland)( Women)?$/;

// A multi-sport games' cricket competition (Asian Games, Commonwealth Games, an
// Olympics) is headline news even when the fixture on a given day is between two
// associate nations — unlike an ordinary bilateral tour, where an associate-only
// match really is the least interesting thing in the pool. Matched on the series
// name, not a stored edition id, so the next games (Asian Games 2030, etc.) rank
// the same way with no code change.
const MULTI_SPORT_GAMES = /\b(asian games|commonwealth games|olympic)/i;

// Full-member internationals, featured competitions (IPL, World Cups, the big
// franchise leagues) and multi-sport games cricket before ordinary associate
// fixtures.
export function cricketWeight(m: CricketSeriesMatch): number {
  if (m.scorecard_league || isFeaturedSeriesId(m.series_espn_id) || MULTI_SPORT_GAMES.test(m.series_name)) return 0;
  const full = [m.home, m.away].filter((s) => s && FULL_MEMBERS.test(s.name)).length;
  return 2 - full;
}

export function byCricketImportance(a: CricketSeriesMatch, b: CricketSeriesMatch): number {
  return cricketWeight(a) - cricketWeight(b) || byPriority(a, b);
}

export interface HomeSection {
  league: League;
  /** Recent results and next fixtures not already shown in Live now / Coming up. */
  games: GameRow[];
  liveCount: number;
  /** Games in the section's window before de-duplication: zero means between seasons. */
  windowCount: number;
}

export interface HomeData {
  today: string;
  anyLive: boolean;
  liveGames: GameRow[];
  /** Every cricket match in play (internationals first); the page shows the first few. */
  liveCricket: CricketSeriesMatch[];
  liveTennis: TennisMatch[];
  upcomingGames: GameRow[];
  /** Headline cricket fixtures for the Coming up block. */
  nextCricket: CricketSeriesMatch[];
  /** The rest of the week's cricket, for the Cricket block. */
  moreCricket: CricketSeriesMatch[];
  /** Series outside headline cricket with play in progress, linked from the Cricket block. */
  nextTennis: TennisMatch[];
  f1: F1EventRow | null;
  featured: GameRow[];
  /** League blocks with something on, most active first. */
  sections: HomeSection[];
  /** Leagues with nothing on this week: on a break (`resumesOn` is the next kickoff) or between seasons (null), with the last season played. */
  /** Next stored fixture per league behind a picker tile; null where none is left, absent where the read failed. */
  nextFixtures: Partial<Record<League, string | null>>;
}

const HOURS = 3600 * 1000;

/** Everything the first-visit page draws: what is in play, what is coming, the finished games the "Right now" card can fall back on, and the next-fixture lines of the sport tiles. */
export const getHomeData = cache(async (): Promise<HomeData> => {
  const today = easternDay(new Date().toISOString());
  const [liveLists, tennisRows, fixtures, f1, nextFixtures] = await Promise.all([
    readLiveLists(),
    readTennisDay(today),
    readFixtures(),
    readF1(),
    readNextFixtures().catch(() => ({}) as Partial<Record<League, string | null>>),
  ]);

  // One ESPN pass for every league game that could be in play, whichever block shows it.
  const byId = new Map<string, GameRow>();
  for (const g of [...liveLists.games, ...fixtures.upcoming, ...fixtures.featured, ...fixtures.sections.flatMap((s) => s.games)]) byId.set(`${g.league}-${g.espn_id}`, g);
  const overlaid = await overlayLiveGames([...byId.values()]);
  const fresh = new Map(overlaid.map((g) => [`${g.league}-${g.espn_id}`, g]));
  const refresh = (rows: GameRow[]) => rows.map((g) => fresh.get(`${g.league}-${g.espn_id}`) ?? g);

  const [cricketLiveAll, tennis] = await Promise.all([overlayLiveCricket(liveLists.cricket), overlayLiveTennis(today, tennisRows)]);

  const liveGames = refresh(liveLists.games).filter((g) => g.status_state === "in");
  const liveGameIds = new Set(liveGames.map((g) => g.espn_id));
  // A live IPL or World Cup match is a league game above; the series feed carries the rest.
  const liveCricket = cricketLiveAll.filter((m) => m.status_state === "in" && importantCricket(m) && !liveGameIds.has(m.espn_id)).sort(byCricketImportance);
  const liveTennis = tennis.matches
    .filter((m) => m.status_state === "in")
    .sort((a, b) => Number(b.major) - Number(a.major) || (b.round_number ?? 0) - (a.round_number ?? 0))
    .slice(0, 4);
  const anyLive = liveGames.length > 0 || liveCricket.length > 0 || liveTennis.length > 0;

  const upcomingGames = refresh(fixtures.upcoming).filter((g) => g.status_state !== "in" && !liveGameIds.has(g.espn_id));
  const shownGameIds = new Set([...liveGames, ...upcomingGames].map((g) => `${g.league}-${g.espn_id}`));
  const liveCricketIds = new Set(liveCricket.map((m) => m.espn_id));
  const upcomingIds = new Set(upcomingGames.map((g) => g.espn_id));
  const cricketPool = fixtures.cricketUpcoming.filter((m) => !upcomingIds.has(m.espn_id) && !liveGameIds.has(m.espn_id) && !liveCricketIds.has(m.espn_id));
  const nextCricket = cricketPool.sort(byCricketImportance).slice(0, 3);
  const nextCricketIds = new Set(nextCricket.map((m) => m.espn_id));
  const moreCricket = cricketPool
    .filter((m) => !nextCricketIds.has(m.espn_id))
    .sort(byPriority)
    .slice(0, 4);
  // Still to be played: not finished, not in play, and not called off (a postponed match is not "coming up").
  const nextTennis = tennis.matches.filter((m) => tennisMatchStatus(m).kind === "upcoming" && m.major).slice(0, 2);

  const now = Date.now();
  const sections: HomeSection[] = [];
  for (const s of fixtures.sections) {
    const games = refresh(s.games);
    if (games.length === 0) {
      continue;
    }
    const liveCount = games.filter((g) => g.status_state === "in").length;
    const rest = games.filter((g) => !shownGameIds.has(`${g.league}-${g.espn_id}`)).slice(0, 4);
    sections.push({ league: s.league, games: rest, liveCount, windowCount: games.length });
  }
  // Most active first: anything in play, then whoever plays soonest.
  const soonest = (s: HomeSection) => {
    const next = fixtures.sections
      .find((x) => x.league === s.league)!
      .games.map((g) => new Date(g.date).getTime())
      .filter((t) => t > now - 3 * HOURS);
    return next.length ? Math.min(...next) : Number.POSITIVE_INFINITY;
  };
  sections.sort((a, b) => b.liveCount - a.liveCount || soonest(a) - soonest(b));

  return {
    today,
    anyLive,
    liveGames,
    liveCricket,
    liveTennis,
    upcomingGames,
    nextCricket,
    moreCricket,
    nextTennis,
    f1,
    featured: refresh(fixtures.featured),
    sections,
    nextFixtures,
  };
});
