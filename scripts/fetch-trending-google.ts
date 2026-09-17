// Google's own daily-trending RSS feed (the "Trending Now" page's feed, not the
// gated Trends API alpha) — free, no key, geo-filterable by ISO country code. It only
// returns 10 items/day/country across every topic, so most days most countries will
// have zero sports-relevant items; that's an honest reflection of what's trending,
// not a bug.
import { pool } from "./lib/db";
import { loadEntityIndex, matchEntity, detectLeagueKeyword } from "./lib/trending";

const COUNTRIES = ["US", "GB", "IN", "AU", "ES", "BR"];

interface TrendItem {
  title: string;
  trafficLabel: string | null;
  link: string | null;
}

function extractTag(block: string, tag: string): string | null {
  const match = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  if (!match) return null;
  return match[1]
    .replace(/^<!\[CDATA\[|\]\]>$/g, "")
    .trim();
}

function parseRss(xml: string): TrendItem[] {
  const items: TrendItem[] = [];
  for (const block of xml.split("<item>").slice(1)) {
    const title = extractTag(block, "title");
    if (!title) continue;
    items.push({
      title,
      trafficLabel: extractTag(block, "ht:approx_traffic"),
      link: extractTag(block, "ht:news_item_url"),
    });
  }
  return items;
}

async function fetchTrends(country: string): Promise<TrendItem[]> {
  const url = `https://trends.google.com/trending/rss?geo=${country}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Google Trends request failed (${res.status}) for ${country}`);
  return parseRss(await res.text());
}

async function processCountry(country: string, index: Awaited<ReturnType<typeof loadEntityIndex>>) {
  const items = await fetchTrends(country);

  const matches: { label: string; detail: string | null; url: string; league: string | null; type: string | null; slug: string | null }[] = [];
  for (const item of items) {
    const entity = matchEntity(item.title, index, { allowNicknames: false });
    const leagueLabel = detectLeagueKeyword(item.title);
    if (!entity && !leagueLabel) continue;

    const parts = [item.trafficLabel ? `${item.trafficLabel} searches today` : null, leagueLabel].filter((p): p is string => Boolean(p));
    matches.push({
      label: item.title,
      detail: parts.length > 0 ? parts.join(" · ") : null,
      url: item.link ?? `https://trends.google.com/trending?geo=${country}`,
      league: entity?.league ?? null,
      type: entity?.type ?? null,
      slug: entity?.slug ?? null,
    });
  }

  await pool.query("delete from trending_topics where source = 'google_trends' and country = $1", [country]);
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    await pool.query(
      `insert into trending_topics (source, country, rank, label, detail, url, matched_league, matched_type, matched_slug)
       values ('google_trends', $1, $2, $3, $4, $5, $6, $7, $8)`,
      [country, i + 1, m.label, m.detail, m.url, m.league, m.type, m.slug]
    );
  }
  console.log(`[fetch-trending-google] ${country}: ${matches.length}/${items.length} sports-relevant trends`);
}

async function main() {
  const index = await loadEntityIndex(pool);
  for (const country of COUNTRIES) {
    try {
      await processCountry(country, index);
    } catch (err) {
      console.error(`[fetch-trending-google] ${country} failed:`, err instanceof Error ? err.message : err);
    }
  }
  await pool.end();
}

main().catch((err) => {
  console.error("[fetch-trending-google] failed:", err);
  process.exit(1);
});
