import { pool } from "./lib/db";
import { fetchNews, type League } from "./lib/espn";
import { scopedLeagues } from "./lib/scope";
import { isBettingText } from "../src/lib/betting";

const LEAGUES: League[] = ["nba", "nfl", "epl", "laliga", "bundesliga", "seriea", "ucl", "ipl", "bbl", "cwc", "t20wc", "wpl", "wbbl", "wcwc", "wt20wc"];

async function processLeague(league: League) {
  const data = await fetchNews(league, 15);
  const articles = data.articles ?? [];

  for (const a of articles) {
    // No betting content on the site: odds round-ups and betting guides are not stored.
    if (isBettingText(a.headline, a.description)) continue;
    const image = a.images?.[0]?.url ?? null;
    await pool.query(
      `insert into news_articles (league, article_id, headline, description, image_url, link, published)
       values ($1,$2,$3,$4,$5,$6,$7)
       on conflict (league, article_id) do update set
         headline = excluded.headline, description = excluded.description,
         image_url = excluded.image_url, link = excluded.link, published = excluded.published`,
      [
        league,
        String(a.id),
        a.headline,
        a.description ?? null,
        image,
        a.links?.web?.href ?? null,
        a.published ?? null,
      ]
    );
  }
  console.log(`[fetch-news] ${league}: upserted ${articles.length} articles`);
}

async function main() {
  const target = process.argv[2] as League | undefined;
  for (const league of target ? [target] : scopedLeagues(LEAGUES)) {
    try {
      await processLeague(league);
    } catch (err) {
      console.error(`[fetch-news] ${league} failed:`, err instanceof Error ? err.message : err);
    }
  }
  await pool.end();
}

main().catch((err) => {
  console.error("[fetch-news] failed:", err);
  process.exit(1);
});
