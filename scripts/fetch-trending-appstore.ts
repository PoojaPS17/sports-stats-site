// Apple's own iTunes RSS top-charts feed — free, no key, no auth, one predictable URL
// per country and genre. Genre 6004 is Sports. There's no equivalent free, official
// API for Google Play (only paid third-party scrapers offer Android top-charts data),
// so this covers iOS only — see fetch-trending-google.ts / fetch-trending-wikipedia.ts
// for the other two trending sources, which don't have that gap.
import { pool } from "./lib/db";
import { isBettingApp } from "../src/lib/betting";

const COUNTRIES = ["US", "GB", "IN", "AU", "ES", "BR"];
const SPORTS_GENRE_ID = "6004";
// Fetch well past the 15 we keep: in some countries half the chart is sportsbooks.
const FETCH_LIMIT = 50;
const LIMIT = 15;

interface AppEntry {
  name: string;
  artist: string;
  iconUrl: string | null;
  storeUrl: string;
}

function largestIcon(images: any[]): string | null {
  if (!Array.isArray(images) || images.length === 0) return null;
  return images[images.length - 1]?.label ?? images[0]?.label ?? null;
}

function storeLink(entry: any): string {
  const links = Array.isArray(entry.link) ? entry.link : [entry.link];
  const alt = links.find((l: any) => l?.attributes?.rel === "alternate");
  return alt?.attributes?.href ?? entry.id?.label ?? "";
}

async function fetchTopApps(country: string): Promise<AppEntry[]> {
  const url = `https://itunes.apple.com/${country.toLowerCase()}/rss/topfreeapplications/limit=${FETCH_LIMIT}/genre=${SPORTS_GENRE_ID}/json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Apple RSS request failed (${res.status}) for ${country}`);
  const data = await res.json();
  const entries = data.feed?.entry ?? [];
  return entries.map((e: any) => ({
    name: e["im:name"]?.label ?? "Unknown app",
    artist: e["im:artist"]?.label ?? "",
    iconUrl: largestIcon(e["im:image"]),
    storeUrl: storeLink(e),
  }));
}

async function processCountry(country: string) {
  // No betting content on the site: sportsbook and casino apps are dropped and the
  // rest ranked among themselves.
  const apps = (await fetchTopApps(country)).filter((a) => a.storeUrl && !isBettingApp(a.name, a.artist)).slice(0, LIMIT);

  await pool.query("delete from trending_topics where source = 'app_store_ios' and country = $1", [country]);
  for (let i = 0; i < apps.length; i++) {
    const a = apps[i];
    if (!a.storeUrl) continue;
    await pool.query(
      `insert into trending_topics (source, country, rank, label, detail, url, image_url)
       values ('app_store_ios', $1, $2, $3, $4, $5, $6)`,
      [country, i + 1, a.name, a.artist, a.storeUrl, a.iconUrl]
    );
  }
  console.log(`[fetch-trending-appstore] ${country}: ${apps.length} trending Sports apps`);
}

async function main() {
  for (const country of COUNTRIES) {
    try {
      await processCountry(country);
    } catch (err) {
      console.error(`[fetch-trending-appstore] ${country} failed:`, err instanceof Error ? err.message : err);
    }
  }
  await pool.end();
}

main().catch((err) => {
  console.error("[fetch-trending-appstore] failed:", err);
  process.exit(1);
});
