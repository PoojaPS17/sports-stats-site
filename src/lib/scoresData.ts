import { unstable_cache } from "next/cache";
import { type League, getMostRecentPlayedSeason, getNextFixtureDate } from "@/lib/queries";
import { getOffseasonRecap } from "@/lib/offseason";
import { snapshotFromRecap, type LeagueSnapshotData } from "@/lib/leagueSnapshot";
import { getCricketSeriesInProgressOther } from "@/lib/cricketSeries";
import type { HomeOtherSeries } from "@/components/HomeCricket";
import { getHomeData, SECTION_LEAGUES, type HomeData } from "@/lib/homeData";

// The reads only /scores needs, kept out of getHomeData so the home page keeps its lighter query set.
// Same tiers as the home page: a table moves only when a game ends (60 s); the season facts are
// calendar facts (1 h).
const readExtras = unstable_cache(
  async () => {
    const [snapshots, otherSeries, seasons, resumes] = await Promise.all([
      Promise.all(
        SECTION_LEAGUES.map(async (league) => {
          const recap = await getOffseasonRecap(league).catch(() => null);
          return [league, recap ? snapshotFromRecap(recap, { tableRows: 5, boards: 1, leaderRows: 3 }) : null] as const;
        })
      ),
      // Domestic, women's and youth series in progress, for the Cricket block's "Also in progress" line.
      getCricketSeriesInProgressOther(6),
      Promise.all(SECTION_LEAGUES.map(async (l) => [l, await getMostRecentPlayedSeason(l)] as const)),
      Promise.all(SECTION_LEAGUES.map(async (l) => [l, await getNextFixtureDate(l)] as const)),
    ]);
    return {
      snapshots: Object.fromEntries(snapshots) as Partial<Record<League, LeagueSnapshotData | null>>,
      otherSeries: otherSeries.map((s) => ({ espn_id: s.espn_id, name: s.name, live: s.live_count > 0 })) as HomeOtherSeries[],
      lastSeason: Object.fromEntries(seasons) as Partial<Record<League, number | null>>,
      resumesOn: Object.fromEntries(resumes) as Partial<Record<League, string | null>>,
    };
  },
  ["scores-extras"],
  { revalidate: 60 }
);

export interface ScoresData {
  home: HomeData;
  snapshots: Partial<Record<League, LeagueSnapshotData | null>>;
  otherSeries: HomeOtherSeries[];
  /** Leagues with nothing on this week: on a break (`resumesOn` is the next kickoff) or between seasons (null), with the last season played. */
  offSeason: { league: League; lastSeason: number | null; resumesOn: string | null }[];
}

export async function getScoresData(): Promise<ScoresData> {
  const [home, extras] = await Promise.all([getHomeData(), readExtras()]);
  const active = new Set(home.sections.map((s) => s.league));
  const offSeason = SECTION_LEAGUES.filter((l) => !active.has(l)).map((league) => ({ league, lastSeason: extras.lastSeason[league] ?? null, resumesOn: extras.resumesOn[league] ?? null }));
  return { home, snapshots: extras.snapshots, otherSeries: extras.otherSeries, offSeason };
}

