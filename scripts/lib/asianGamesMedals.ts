// Fetch and parse an Asian Games edition's medal table from Wikipedia, and upsert
// it into medal_tally. See docs/superpowers/specs/2026-09-23-asian-games-medal-tally-design.md
// for why Wikipedia (not the Games' own bot-protected results backend) and why the
// MediaWiki REST API's rendered HTML (not raw wikitext, which is template markup we
// would have to re-expand ourselves).
import * as cheerio from "cheerio";
import { pool } from "./db";
import { slugify } from "./espn";
import { sortMedalTally, medalRanks } from "../../src/lib/medalTallyOrder";
import { wikipediaMedalTableTitle } from "../../src/lib/asianGamesEditions";

const USER_AGENT = "SportsDB/1.0 (https://github.com/PoojaPS17/sports-stats-site)";

export interface MedalTallyRow {
  nation_slug: string;
  nation_name: string;
  gold: number;
  silver: number;
  bronze: number;
}

interface RawCell {
  text: string;
  rowspan: number;
  colspan: number;
}

// cheerio's element type isn't worth chasing across versions here
function readCells($: cheerio.CheerioAPI, tr: any): RawCell[] {
  return $(tr)
    .children("td, th")
    .map((_, td) => {
      const $td = $(td);
      return {
        text: $td.text().replace(/\s+/g, " ").trim(),
        rowspan: Number($td.attr("rowspan")) || 1,
        colspan: Number($td.attr("colspan")) || 1,
      };
    })
    .get();
}

/**
 * Realigns each row's cells to a fixed column count, filling in cells that a
 * previous row's rowspan covers so a column never silently shifts. Generic HTML
 * table walk: works whichever column(s) carry the rowspan (usually just Rank, but
 * this does not assume that), which varies across 20 editions' worth of markup
 * written by different Wikipedia editors over 70+ years.
 */
function walkRows(rows: RawCell[][], columnCount: number): string[][] {
  const pending: { text: string; rowsLeft: number }[] = Array.from({ length: columnCount }, () => ({ text: "", rowsLeft: 0 }));
  return rows.map((raw) => {
    const line: string[] = new Array(columnCount).fill("");
    let rawIdx = 0;
    for (let col = 0; col < columnCount; col++) {
      if (pending[col].rowsLeft > 0) {
        line[col] = pending[col].text;
        pending[col].rowsLeft--;
        continue;
      }
      const cell = raw[rawIdx++];
      if (!cell) continue;
      for (let c = 0; c < cell.colspan && col + c < columnCount; c++) {
        line[col + c] = cell.text;
        if (cell.rowspan > 1) pending[col + c] = { text: cell.text, rowsLeft: cell.rowspan - 1 };
      }
      col += cell.colspan - 1;
    }
    return line;
  });
}

function cleanNationName(raw: string): string {
  return raw
    .replace(/\[.*?\]/g, "") // footnote markers, e.g. "China[a]"
    .replace(/[*†‡]+\s*$/, "") // host-nation asterisk / footnote symbols
    .replace(/\s+/g, " ")
    .trim();
}

function parseCount(raw: string): number {
  const n = parseInt(raw.replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Parses every real nation row out of the first `table.wikitable` whose header
 * row has Nation/Gold/Silver/Bronze columns — found by header content, not table
 * index or section heading, so it doesn't matter whether the page has other
 * tables above it or which section the medal table sits in. Returns [] when no
 * such table is found.
 */
export function parseMedalTableHtml(html: string): MedalTallyRow[] {
  const $ = cheerio.load(html);
  const tables = $("table.wikitable").toArray();

  for (const table of tables) {
    const headerRow = $(table).find("tr").first();
    const headers = headerRow
      .children("th, td")
      .map((_, th) => $(th).text().trim().toLowerCase())
      .get();
    const nationCol = headers.findIndex((h) => /nation|noc|country|team/.test(h));
    const goldCol = headers.findIndex((h) => /gold/.test(h));
    const silverCol = headers.findIndex((h) => /silver/.test(h));
    const bronzeCol = headers.findIndex((h) => /bronze/.test(h));
    if (nationCol === -1 || goldCol === -1 || silverCol === -1 || bronzeCol === -1) continue;

    const bodyRows = $(table)
      .find("tr")
      .toArray()
      .slice(1) // drop the header row
      .filter((tr) => !$(tr).hasClass("sortbottom"))
      .map((tr) => readCells($, tr));
    const aligned = walkRows(bodyRows, headers.length);

    const out: MedalTallyRow[] = [];
    for (const line of aligned) {
      const nationName = cleanNationName(line[nationCol] ?? "");
      if (!nationName || /^totals?$/i.test(nationName)) continue;
      out.push({
        nation_slug: slugify(nationName),
        nation_name: nationName,
        gold: parseCount(line[goldCol] ?? ""),
        silver: parseCount(line[silverCol] ?? ""),
        bronze: parseCount(line[bronzeCol] ?? ""),
      });
    }
    if (out.length > 0) return out;
  }
  return [];
}

async function fetchWikipediaHtml(title: string): Promise<string | null> {
  const url = `https://en.wikipedia.org/w/rest.php/v1/page/${encodeURIComponent(title.replace(/ /g, "_"))}/html`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Wikipedia request failed (${res.status}): ${url}`);
  return res.text();
}

/**
 * Fetches and parses one edition's medal table. Tries the standalone
 * "{year} Asian Games medal table" article first (every edition from 1954
 * onward), then falls back to the main "{year} Asian Games" article (needed
 * only for 1951, which has no standalone medal-table page) — the same
 * header-content table search works on either page, so no section-heading
 * logic is needed for the fallback.
 */
export async function fetchMedalTable(editionYear: number): Promise<{ rows: MedalTallyRow[]; sourceUrl: string; sourceTitle: string }> {
  const standaloneTitle = wikipediaMedalTableTitle(editionYear);
  let html = await fetchWikipediaHtml(standaloneTitle);
  let title = standaloneTitle;
  if (html === null) {
    title = `${editionYear} Asian Games`;
    html = await fetchWikipediaHtml(title);
  }
  if (html === null) throw new Error(`No Wikipedia page found for ${editionYear} Asian Games (tried "${standaloneTitle}" and "${title}")`);
  const rows = parseMedalTableHtml(html);
  if (rows.length === 0) throw new Error(`Parsed zero medal rows from "${title}" - table structure may have changed`);
  return { rows, sourceUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`, sourceTitle: title };
}

/**
 * Upserts one edition's medal tally, computing `rank` with the site's own
 * tie-aware order (medalTallyOrder.ts) rather than trusting Wikipedia's rank
 * column. Also deletes any stored row for this edition that the fresh fetch no
 * longer has (a rare source correction), so re-scrapes never accumulate stale
 * nations.
 */
export async function upsertMedalTally(editionYear: number, rows: MedalTallyRow[], sourceUrl: string): Promise<number> {
  const sorted = sortMedalTally(rows);
  const ranks = medalRanks(sorted);
  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i];
    await pool.query(
      `insert into medal_tally (edition_year, nation_slug, nation_name, gold, silver, bronze, rank, source_url, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, now())
       on conflict (edition_year, nation_slug) do update set
         nation_name = excluded.nation_name, gold = excluded.gold, silver = excluded.silver,
         bronze = excluded.bronze, rank = excluded.rank, source_url = excluded.source_url, updated_at = now()`,
      [editionYear, r.nation_slug, r.nation_name, r.gold, r.silver, r.bronze, ranks[i], sourceUrl]
    );
  }
  const keep = sorted.map((r) => r.nation_slug);
  await pool.query(`delete from medal_tally where edition_year = $1 and nation_slug <> all($2::text[])`, [editionYear, keep.length > 0 ? keep : [""]]);
  return sorted.length;
}
