import { cache } from "react";
import { unstable_cache } from "next/cache";
import { LEAGUES, type League, getRecentAndUpcoming, getFeaturedGames, getNews, getMostRecentPlayedSeason, type GameRow, type NewsArticle } from "@/lib/queries";
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
//   News                                    15 min   the news scraper runs at most every 15 minutes
//   Next F1 round, last played season        1 h     calendar facts that change a few times a year
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
      getUpcomingCricketMatches(16, 7, true),
      Promise.all([...LEAGUES, "ucl" as const].map((l) => getFeaturedGames(l, 3))).then((x) => x.flat()),
      Promise.all(SECTION_LEAGUES.map(async (league) => ({ league, games: (await getRecentAndUpcoming(league, 2, 5)).slice(0, 8) }))),
    ]);
    return { upcoming, cricketUpcoming, featured, sections };
  },
  ["home-fixtures"],
  { revalidate: TIER.FIXTURES }
);

const readNews = unstable_cache(
  async () =>
    (await Promise.all(LEAGUES.map((l) => getNews(l, 4))))
      .flat()
      .sort((a, b) => (b.published ? new Date(b.published).getTime() : 0) - (a.published ? new Date(a.published).getTime() : 0))
      .slice(0, 8),
  ["home-news"],
  { revalidate: TIER.NEWS }
);

const readSeasonFacts = unstable_cache(
  async () => {
    const [f1, seasons] = await Promise.all([getNextF1Event(7), Promise.all(SECTION_LEAGUES.map(async (l) => [l, await getMostRecentPlayedSeason(l)] as const))]);
    return { f1, lastSeason: Object.fromEntries(seasons) as Partial<Record<League, number | null>> };
  },
  ["home-season-facts"],
  { revalidate: TIER.SEASON }
);

// Only headline cricket (the featured competitions and official internationals, see
// cricketFeatured.ts) reaches the homepage; the stored lists are already filtered,
// this catches what the ESPN live overlay adds from other competitions.
export const importantCricket = isFeaturedCricket;

const FULL_MEMBERS = /^(India|Australia|England|Pakistan|South Africa|New Zealand|Sri Lanka|West Indies|Bangladesh|Afghanistan|Zimbabwe|Ireland)( Women)?$/;

// Full-member internationals before associate fixtures; the featured competitions
// (IPL, World Cups, the big franchise leagues) rank with them.
function cricketWeight(m: CricketSeriesMatch): number {
  if (m.scorecard_league || isFeaturedSeriesId(m.series_espn_id)) return 0;
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
  nextTennis: TennisMatch[];
  f1: F1EventRow | null;
  featured: GameRow[];
  /** League blocks with something on, most active first. */
  sections: HomeSection[];
  /** Leagues between seasons, with the last season that was played. */
  offSeason: { league: League; lastSeason: number | null }[];
  news: NewsArticle[];
}

const HOURS = 3600 * 1000;

export const getHomeData = cache(async (): Promise<HomeData> => {
  const today = easternDay(new Date().toISOString());
  const [liveLists, tennisRows, fixtures, news, facts] = await Promise.all([readLiveLists(), readTennisDay(today), readFixtures(), readNews(), readSeasonFacts()]);

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
  const offSeason: HomeData["offSeason"] = [];
  for (const s of fixtures.sections) {
    const games = refresh(s.games);
    if (games.length === 0) {
      offSeason.push({ league: s.league, lastSeason: facts.lastSeason[s.league] ?? null });
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
    f1: facts.f1,
    featured: refresh(fixtures.featured),
    sections,
    offSeason,
    news,
  };
});
