// Wikipedia pageviews aren't split by country, so language edition stands in as a
// rough regional proxy: en for a global/US-flavored view, plus a few editions matching
// where our covered leagues have the biggest fan bases (cricket in India, football in
// Spain and Brazil). Free, no key, no auth — Wikimedia only asks for an identifying
// User-Agent, which is set below.
import { pool } from "./lib/db";
import { loadEntityIndex, matchEntity } from "./lib/trending";

const EDITIONS: { country: string; project: string }[] = [
  { country: "global", project: "en.wikipedia" },
  { country: "IN", project: "hi.wikipedia" },
  { country: "ES", project: "es.wikipedia" },
  { country: "BR", project: "pt.wikipedia" },
];

const USER_AGENT = "SportsDB/1.0 (https://github.com/PoojaPS17/sports-stats-site)";
const MAX_MATCHES_PER_EDITION = 15;

interface WikiArticle {
  article: string;
  views: number;
}

// Pageviews for "today" are still accumulating, so the most recent complete day is
// yesterday (UTC).
function yesterdayUTC(): { year: string; month: string; day: string } {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return {
    year: String(d.getUTCFullYear()),
    month: String(d.getUTCMonth() + 1).padStart(2, "0"),
    day: String(d.getUTCDate()).padStart(2, "0"),
  };
}

function readableTitle(article: string): string {
  return article.replace(/_/g, " ").trim();
}

async function fetchTopArticles(project: string): Promise<WikiArticle[]> {
  const { year, month, day } = yesterdayUTC();
  const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/top/${project}/all-access/${year}/${month}/${day}`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`Wikimedia request failed (${res.status}): ${url}`);
  const data = await res.json();
  return data.items?.[0]?.articles ?? [];
}

function isMetaPage(title: string): boolean {
  return (
    title === "Main Page" ||
    title.startsWith("Special:") ||
    title.startsWith("Wikipedia:") ||
    title.startsWith("विकिपीडिया:") ||
    title.startsWith("Wikipedia,")
  );
}

async function processEdition(country: string, project: string, index: Awaited<ReturnType<typeof loadEntityIndex>>) {
  const articles = await fetchTopArticles(project);

  const matches: { label: string; detail: string; url: string; league: string; type: string; slug: string }[] = [];
  const seenEntities = new Set<string>(); // a team/player often has several separate trending pages (season pages, match reports); keep just the top one
  for (const a of articles) {
    const title = readableTitle(a.article);
    if (isMetaPage(title)) continue;
    const entity = matchEntity(title, index);
    if (!entity) continue;
    const entityKey = `${entity.league}:${entity.type}:${entity.slug}`;
    if (seenEntities.has(entityKey)) continue;
    seenEntities.add(entityKey);
    matches.push({
      label: entity.name,
      detail: `${a.views.toLocaleString()} Wikipedia views yesterday`,
      url: `https://${project}.org/wiki/${encodeURIComponent(a.article)}`,
      league: entity.league,
      type: entity.type,
      slug: entity.slug,
    });
    if (matches.length >= MAX_MATCHES_PER_EDITION) break;
  }

  await pool.query("delete from trending_topics where source = 'wikipedia' and country = $1", [country]);
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    await pool.query(
      `insert into trending_topics (source, country, rank, label, detail, url, matched_league, matched_type, matched_slug)
       values ('wikipedia', $1, $2, $3, $4, $5, $6, $7, $8)`,
      [country, i + 1, m.label, m.detail, m.url, m.league, m.type, m.slug]
    );
  }
  console.log(`[fetch-trending-wikipedia] ${country} (${project}): ${matches.length} matches from ${articles.length} articles`);
}

async function main() {
  const index = await loadEntityIndex(pool);
  for (const { country, project } of EDITIONS) {
    try {
      await processEdition(country, project, index);
    } catch (err) {
      console.error(`[fetch-trending-wikipedia] ${country} failed:`, err instanceof Error ? err.message : err);
    }
  }
  await pool.end();
}

main().catch((err) => {
  console.error("[fetch-trending-wikipedia] failed:", err);
  process.exit(1);
});
