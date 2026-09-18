import { appendFileSync } from "node:fs";
import { pool } from "./lib/db";
import { fetchScoreboard, type League } from "./lib/espn";

// The scheduled 15-minute tick starts here. Most of the day nothing is in progress, so
// this cheap check (two scoreboard requests per league) decides whether the real fetch
// pipeline runs at all — and, when it does, which leagues it touches. A league needs
// an update while one of its games is in progress, or once a game has finished on
// ESPN but is still open in our database, so the final score and box score land even
// when nothing is live any more at the next tick. The once-daily / manually-triggered
// run always does a full update of every league regardless.
const LEAGUES: League[] = ["nba", "nfl", "epl", "laliga", "bundesliga", "seriea", "ucl", "ipl", "bbl", "cwc", "t20wc", "wpl", "wbbl", "wcwc", "wt20wc"];

function toYYYYMMDD(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

// ESPN's `dates=` filter works on the US day, so early in the UTC morning the UTC date
// already misses an NBA or NFL game still in progress from the previous evening.
function datesToCheck(): string[] {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  return [toYYYYMMDD(yesterday), toYYYYMMDD(today)];
}

// Same finished rule as the games writer (cricket's status has no `completed` flag),
// so a game ESPN reports as finished is stored as completed after one fetch and never
// keeps a league "live" (a postponed game is state "post" but not completed).
function isFinished(ev: any): boolean {
  const type = ev.competitions?.[0]?.status?.type;
  return Boolean(type?.completed ?? type?.state === "post");
}

async function needsUpdate(league: League): Promise<{ live: number; pending: number }> {
  const events = new Map<string, any>();
  for (const date of datesToCheck()) {
    const data = await fetchScoreboard(league, date);
    for (const ev of data.events ?? []) events.set(String(ev.id), ev);
  }
  let live = 0;
  const finished: string[] = [];
  for (const [id, ev] of events) {
    if (ev.competitions?.[0]?.status?.type?.state === "in") live++;
    else if (isFinished(ev)) finished.push(id);
  }
  let pending = 0;
  if (finished.length > 0) {
    const { rows } = await pool.query(`select espn_id from games where league = $1 and espn_id = any($2) and completed = true`, [league, finished]);
    const stored = new Set(rows.map((r) => r.espn_id as string));
    pending = finished.filter((id) => !stored.has(id)).length;
  }
  return { live, pending };
}

async function main() {
  const forced = process.env.FORCE_SCRAPE === "true";
  const leagues: League[] = [];

  if (!forced) {
    for (const league of LEAGUES) {
      try {
        const { live, pending } = await needsUpdate(league);
        if (live > 0 || pending > 0) {
          leagues.push(league);
          console.log(`[check-live] ${league}: ${live} in progress, ${pending} finished but not yet stored`);
        }
      } catch (err) {
        console.error(`[check-live] ${league} failed:`, err instanceof Error ? err.message : err);
      }
    }
  }

  const shouldScrape = forced || leagues.length > 0;
  const mode = forced ? "full" : "live";
  console.log(`[check-live] forced=${forced} leagues=${leagues.join(",") || "none"} -> should_scrape=${shouldScrape} mode=${mode}`);

  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `should_scrape=${shouldScrape}\nmode=${mode}\nleagues=${leagues.join(",")}\n`);
  }
  await pool.end();
}

main().catch((err) => {
  console.error("[check-live] failed:", err);
  process.exit(1);
});
