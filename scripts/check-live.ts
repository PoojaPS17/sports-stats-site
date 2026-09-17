import { appendFileSync } from "node:fs";
import { fetchScoreboard, type League } from "./lib/espn";

// Frequent updates are only useful while a game is actually in progress — most of the
// day there's nothing live, so the scheduled 15-min tick should do a cheap check here
// and skip the real fetch pipeline unless something's live (or this is the once-daily
// / manually-triggered run, which always does a full update regardless).
const LEAGUES: League[] = ["nba", "nfl", "epl", "laliga", "ipl", "bbl", "cwc", "t20wc"];

function toYYYYMMDD(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

async function hasLiveGameToday(league: League): Promise<boolean> {
  const data = await fetchScoreboard(league, toYYYYMMDD(new Date()));
  return (data.events ?? []).some((ev: any) => ev.competitions?.[0]?.status?.type?.state === "in");
}

async function main() {
  const forced = process.env.FORCE_SCRAPE === "true";
  let live = false;

  if (!forced) {
    for (const league of LEAGUES) {
      try {
        if (await hasLiveGameToday(league)) {
          live = true;
          break;
        }
      } catch (err) {
        console.error(`[check-live] ${league} failed:`, err instanceof Error ? err.message : err);
      }
    }
  }

  const shouldScrape = forced || live;
  console.log(`[check-live] forced=${forced} live=${live} -> should_scrape=${shouldScrape}`);

  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `should_scrape=${shouldScrape}\n`);
  }
}

main().catch((err) => {
  console.error("[check-live] failed:", err);
  process.exit(1);
});
