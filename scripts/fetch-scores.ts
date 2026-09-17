import { pool } from "./lib/db";
import { fetchScoreboard, type League } from "./lib/espn";
import { upsertEvent } from "./lib/games";

const LEAGUES: League[] = ["nba", "nfl", "epl", "ipl", "bbl", "cwc", "t20wc"];
const DAYS_BACK = 2;
const DAYS_FORWARD = 5;

function toYYYYMMDD(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

function datesToScan(): string[] {
  const dates: string[] = [];
  const today = new Date();
  for (let offset = -DAYS_BACK; offset <= DAYS_FORWARD; offset++) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() + offset);
    dates.push(toYYYYMMDD(d));
  }
  return dates;
}

async function main() {
  for (const league of LEAGUES) {
    const seen = new Set<string>();
    let count = 0;
    for (const date of datesToScan()) {
      try {
        const data = await fetchScoreboard(league, date);
        for (const ev of data.events ?? []) {
          if (seen.has(ev.id)) continue;
          seen.add(ev.id);
          await upsertEvent(league, ev);
          count++;
        }
      } catch (err) {
        console.error(`[fetch-scores] ${league} ${date} failed:`, err instanceof Error ? err.message : err);
      }
    }
    console.log(`[fetch-scores] ${league}: upserted ${count} games`);
  }
  await pool.end();
}

main().catch((err) => {
  console.error("[fetch-scores] failed:", err);
  process.exit(1);
});
