// What the explainer modules read from stored data: the newest finished result (for the trust module's freshness line)
// and the example pages the showcase tiles link to. Every read fails soft: a missing value leaves the line or the
// example out rather than showing a stale or invented one.
import { unstable_cache } from "next/cache";
import { pool } from "./db";
import { getHomeData } from "./homeData";
import { pickRightNow } from "./rightNow";
import { getTryDefaults } from "./tryCardLoader";
import { isCricketLeague, isLeague, LEAGUE_LABEL } from "./leagues";
import { storyExampleHref, type ExplainerExamples } from "./homeExplainers";

export interface NewestResult {
  leagueLabel: string;
  /** ISO instant the match started (a result's stored date is its start, not its final ball). */
  startedIso: string;
}

export async function readNewestResult(): Promise<NewestResult | null> {
  const { rows } = await pool.query<{ league: string; date: Date }>(
    `select league, date from games where completed and date <= now() order by date desc limit 1`
  );
  const row = rows[0];
  if (!row || !isLeague(row.league)) return null;
  return { leagueLabel: LEAGUE_LABEL[row.league], startedIso: row.date.toISOString() };
}

const cachedNewest = unstable_cache(readNewestResult, ["home-newest-result"], { revalidate: 300 });

export async function getNewestResult(): Promise<NewestResult | null> {
  try {
    return await cachedNewest();
  } catch {
    return null;
  }
}

export async function getExplainerExamples(): Promise<ExplainerExamples> {
  const [home, tryDefaults] = await Promise.all([getHomeData().catch(() => null), getTryDefaults()]);
  const card = tryDefaults?.card ?? null;
  return {
    matchHref: home ? storyExampleHref(pickRightNow(home)) : null,
    cricketer: card && isLeague(card.league) && isCricketLeague(card.league) ? { name: card.name, href: card.href } : null,
    compareLeague: card && isLeague(card.league) ? card.league : "nba",
  };
}
