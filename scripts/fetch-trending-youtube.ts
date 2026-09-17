// YouTube's official Data API v3, videos.list with chart=mostPopular and
// videoCategoryId=17 (Sports) — free self-serve API key (10,000 units/day, this script
// uses ~6 units total), no approval wait, unlike Twitter/X (paid-only) or a Google Play
// top-charts API (no free official one exists). These are real sports videos already
// filtered to the category, so unlike the other two trending sources this one doesn't
// need matching against our own players/teams — every result is relevant by construction.
import { pool } from "./lib/db";

const COUNTRIES = ["US", "GB", "IN", "AU", "ES", "BR"];
const SPORTS_CATEGORY_ID = "17";
const MAX_RESULTS = 15;

interface YouTubeVideo {
  id: string;
  snippet: {
    title: string;
    channelTitle: string;
    thumbnails?: { medium?: { url: string }; high?: { url: string }; default?: { url: string } };
  };
}

async function fetchTrending(country: string, apiKey: string): Promise<YouTubeVideo[]> {
  const url =
    `https://www.googleapis.com/youtube/v3/videos?part=snippet&chart=mostPopular` +
    `&videoCategoryId=${SPORTS_CATEGORY_ID}&regionCode=${country}&maxResults=${MAX_RESULTS}&key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`YouTube API request failed (${res.status}) for ${country}: ${body}`);
  }
  const data = await res.json();
  return data.items ?? [];
}

async function processCountry(country: string, apiKey: string) {
  const videos = await fetchTrending(country, apiKey);

  await pool.query("delete from trending_topics where source = 'youtube' and country = $1", [country]);
  let rank = 0;
  for (const v of videos) {
    if (!v.id) continue;
    rank++;
    const thumb = v.snippet.thumbnails?.medium?.url ?? v.snippet.thumbnails?.high?.url ?? v.snippet.thumbnails?.default?.url ?? null;
    await pool.query(
      `insert into trending_topics (source, country, rank, label, detail, url, image_url)
       values ('youtube', $1, $2, $3, $4, $5, $6)`,
      [country, rank, v.snippet.title, v.snippet.channelTitle, `https://www.youtube.com/watch?v=${v.id}`, thumb]
    );
  }
  console.log(`[fetch-trending-youtube] ${country}: ${rank} trending sports videos`);
}

async function main() {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    console.log(
      "[fetch-trending-youtube] YOUTUBE_API_KEY not set in .env.local — skipping. " +
        "Create a free key at console.cloud.google.com (enable \"YouTube Data API v3\", create an API key, no approval needed)."
    );
    await pool.end();
    return;
  }

  for (const country of COUNTRIES) {
    try {
      await processCountry(country, apiKey);
    } catch (err) {
      console.error(`[fetch-trending-youtube] ${country} failed:`, err instanceof Error ? err.message : err);
    }
  }
  await pool.end();
}

main().catch((err) => {
  console.error("[fetch-trending-youtube] failed:", err);
  process.exit(1);
});
