import { pool } from "./lib/db";

// Fills `players.photo_*` for players ESPN has no headshot for — most footballers
// (its soccer roster feed carries a headshot for roughly one player in twenty) and
// the odd NBA/NFL rookie — from Wikimedia Commons.
//
// Matching is by id, never by name: Wikidata stores the ESPN player id for each
// sport (P3681 ESPN FC, P3685 NBA, P3686 NFL) next to the item's image (P18), so a
// player gets a photo only when Wikidata says that exact ESPN id is that person.
// Commons then supplies a sized thumbnail plus the photographer and licence, which
// the site credits on the player page (Creative Commons attribution).
//
// Usage: fetch-player-photos.ts [--all] [--file <wikidata dump.json>]
//   default: only players with neither an ESPN headshot nor a stored photo
//   --all:   refresh every matched player (photos on Wikidata do change)
//   --file:  reuse a saved SPARQL result ([{sport, espn, img}]) instead of querying

const SPORT_LEAGUES: Record<string, string[]> = {
  soccer: ["epl", "laliga", "bundesliga", "seriea", "ucl"],
  nba: ["nba"],
  nfl: ["nfl"],
};

const USER_AGENT = "SportsDB/1.0 (https://sports-stats-site.vercel.app; player photo import)";
const SPARQL = `SELECT ?sport ?espn ?img WHERE {
  VALUES (?prop ?sport) { (wdt:P3681 "soccer") (wdt:P3685 "nba") (wdt:P3686 "nfl") }
  ?item ?prop ?espn ; wdt:P18 ?img .
}`;

interface WikidataRow {
  sport: string;
  espn: string;
  img: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// The query service rate-limits hard during incidents (observed: "1 req / min"), so
// back off generously rather than fail the run.
async function fetchWikidata(): Promise<WikidataRow[]> {
  const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(SPARQL)}`;
  for (let attempt = 1; attempt <= 6; attempt++) {
    const res = await fetch(url, { headers: { "user-agent": USER_AGENT, accept: "application/sparql-results+json" }, signal: AbortSignal.timeout(300_000) });
    if (res.ok) {
      // Some labels carry raw control characters, which strict JSON parsing rejects.
      const data = JSON.parse((await res.text()).replace(/[\u0000-\u001f]/g, " "));
      return data.results.bindings.map((b: any) => ({ sport: b.sport.value, espn: b.espn.value, img: b.img.value }));
    }
    console.warn(`[fetch-player-photos] wikidata ${res.status} (attempt ${attempt}); waiting 75s`);
    await sleep(75_000);
  }
  throw new Error("wikidata query kept failing");
}

// P18 values look like http://commons.wikimedia.org/wiki/Special:FilePath/Erling%20Haaland%202023.jpg
function fileTitle(imgUrl: string): string {
  const name = decodeURIComponent(imgUrl.split("/").pop() ?? "").replace(/_/g, " ");
  return `File:${name}`;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

interface PhotoInfo {
  url: string;
  credit: string;
  license: string;
  sourceUrl: string;
}

// One request per 50 titles: sized thumbnail plus the attribution fields Commons
// extracts from the file page.
async function fetchCommons(titles: string[]): Promise<Map<string, PhotoInfo>> {
  const out = new Map<string, PhotoInfo>();
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const params = new URLSearchParams({
      action: "query",
      format: "json",
      formatversion: "2",
      prop: "imageinfo",
      iiprop: "url|extmetadata",
      iiurlwidth: "400",
      iiextmetadatafilter: "Artist|Credit|LicenseShortName|LicenseUrl",
      titles: batch.join("|"),
    });
    const res = await fetch("https://commons.wikimedia.org/w/api.php", {
      method: "POST",
      headers: { "user-agent": USER_AGENT, "content-type": "application/x-www-form-urlencoded" },
      body: params.toString(),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      console.warn(`[fetch-player-photos] commons ${res.status} for a batch of ${batch.length}; skipping it`);
      continue;
    }
    const data = await res.json();
    // Commons may canonicalise a title (first letter case, spacing); map back to ours.
    const canonical = new Map<string, string>();
    for (const n of data.query?.normalized ?? []) canonical.set(n.to, n.from);
    for (const page of data.query?.pages ?? []) {
      const info = page.imageinfo?.[0];
      if (!info?.thumburl) continue;
      const meta = info.extmetadata ?? {};
      const artist = stripHtml(meta.Artist?.value ?? "") || stripHtml(meta.Credit?.value ?? "");
      const license = stripHtml(meta.LicenseShortName?.value ?? "");
      out.set(canonical.get(page.title) ?? page.title, {
        // Unscaled originals come back with tracking params appended; the bare URL serves the same file.
        url: String(info.thumburl).split("?")[0],
        credit: (artist || "Wikimedia Commons contributor").slice(0, 120),
        license: license || "see source",
        sourceUrl: info.descriptionurl ?? `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title)}`,
      });
    }
    await sleep(500);
  }
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const all = args.includes("--all");
  const fileArg = args.indexOf("--file");
  const rows: WikidataRow[] = fileArg >= 0 ? JSON.parse(await (await import("node:fs/promises")).readFile(args[fileArg + 1], "utf8")) : await fetchWikidata();
  console.log(`[fetch-player-photos] wikidata: ${rows.length} players with an ESPN id and an image`);

  for (const [sport, leagues] of Object.entries(SPORT_LEAGUES)) {
    const wanted = new Map<string, string>(); // espn id -> file title
    for (const r of rows) if (r.sport === sport) wanted.set(r.espn, fileTitle(r.img));

    const { rows: candidates } = await pool.query(
      `select distinct espn_id from players
       where league = any($1) ${all ? "" : "and headshot_url is null and photo_url is null"}`,
      [leagues]
    );
    const ids = candidates.map((c) => c.espn_id as string).filter((id) => wanted.has(id));
    const titles = [...new Set(ids.map((id) => wanted.get(id)!))];
    console.log(`[fetch-player-photos] ${sport}: ${candidates.length} candidates, ${ids.length} matched on Wikidata`);
    if (ids.length === 0) continue;

    const photos = await fetchCommons(titles);
    const found = ids.filter((id) => photos.has(wanted.get(id)!));
    const { rowCount } = await pool.query(
      `update players p set photo_url = v.url, photo_credit = v.credit, photo_license = v.license, photo_source_url = v.source_url
       from unnest($2::text[], $3::text[], $4::text[], $5::text[], $6::text[]) as v(espn_id, url, credit, license, source_url)
       where p.league = any($1) and p.espn_id = v.espn_id`,
      [
        leagues,
        found,
        found.map((id) => photos.get(wanted.get(id)!)!.url),
        found.map((id) => photos.get(wanted.get(id)!)!.credit),
        found.map((id) => photos.get(wanted.get(id)!)!.license),
        found.map((id) => photos.get(wanted.get(id)!)!.sourceUrl),
      ]
    );
    console.log(`[fetch-player-photos] ${sport}: ${found.length} photos stored across ${rowCount} player rows`);
  }
  await pool.end();
}

main().catch((err) => {
  console.error("[fetch-player-photos] failed:", err);
  process.exit(1);
});
