// The cricket "Series" directory: every series ESPN lists on its daily cricket
// listing — bilateral tours, ICC tournaments, domestic leagues, women's, youth and
// A-team — with each one's fixtures and results. One request per calendar day; the
// same feed scripts/import-cricket-espn.ts reads for the men's and women's
// internationals, so the listing's series ids and match ids line up with the
// scorecards SportsDB already stores under its own competitions.
//
//   npx tsx --env-file=.env.local scripts/fetch-cricket-series.ts                    # last 3 days + next 10
//   npx tsx --env-file=.env.local scripts/fetch-cricket-series.ts --days 10 --ahead 90
//   npx tsx --env-file=.env.local scripts/fetch-cricket-series.ts --since 2024-01-01 # backfill
//
// A recurring tournament (BBL, WBBL, IPL, ...) keeps one ESPN league id for every season, so its matches are filed
// per edition, `<league id>-<season>` ("8044-2025-26"), see src/lib/cricketSeriesKey.ts; a bilateral tour keeps its own id.
import { pool } from "./lib/db";
import { ingestDay, storeMatches, storeSeries, type SeriesMap } from "./lib/cricket-series-ingest";

const HEADER_URL = "https://site.web.api.espn.com/apis/v2/scoreboard/header?sport=cricket&dates=";
const REQUEST_DELAY_MS = 120;
const RETRIES = 4;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getJson(url: string): Promise<any> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    try {
      const res = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
      const data = JSON.parse(await res.text());
      if (!Array.isArray(data?.sports)) throw new Error(`no sports list (${JSON.stringify(data).slice(0, 100)})`);
      return data;
    } catch (err) {
      lastErr = err;
      await sleep(1200 * (attempt + 1));
    }
  }
  throw lastErr;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const opt = (name: string): string | undefined => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const today = new Date();
  const days = Number(opt("days") ?? 3);
  const ahead = Number(opt("ahead") ?? 10);
  const since = opt("since") ? new Date(`${opt("since")}T12:00:00Z`) : new Date(today.getTime() - days * 86_400_000);
  const until = opt("until") ? new Date(`${opt("until")}T12:00:00Z`) : new Date(today.getTime() + ahead * 86_400_000);
  if (Number.isNaN(since.getTime()) || Number.isNaN(until.getTime()) || since > until) {
    console.error("usage: fetch-cricket-series.ts [--days N] [--ahead M] | [--since YYYY-MM-DD [--until YYYY-MM-DD]]");
    process.exit(1);
  }
  return { since, until };
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

/* ------------------------------------------------------------------------ */
/* Main                                                                      */
/* ------------------------------------------------------------------------ */

async function main() {
  const { since, until } = parseArgs();
  console.log(`[fetch-cricket-series] ${since.toISOString().slice(0, 10)} → ${until.toISOString().slice(0, 10)}`);
  const seriesMeta: SeriesMap = new Map();
  let days = 0;
  let matches = 0;

  for (let d = new Date(since); d <= until; d = new Date(d.getTime() + 86_400_000)) {
    days++;
    let data: any;
    try {
      data = await getJson(HEADER_URL + ymd(d));
    } catch (err) {
      console.error(`[fetch-cricket-series] ${ymd(d)} failed: ${err instanceof Error ? err.message : err}`);
      continue;
    }
    const rows = ingestDay(data, seriesMeta);
    await storeMatches(rows);
    matches += rows.length;
    if (days % 50 === 0) console.log(`[fetch-cricket-series] ${days} days, ${matches} match rows`);
    await sleep(REQUEST_DELAY_MS);
  }

  await storeSeries(seriesMeta);
  console.log(`[fetch-cricket-series] ${days} days: ${matches} match rows across ${seriesMeta.size} series`);
  await pool.end();
}

main().catch((err) => {
  console.error("[fetch-cricket-series] failed:", err);
  process.exit(1);
});
