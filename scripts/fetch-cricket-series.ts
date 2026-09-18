// The cricket "Series" directory: every series ESPN lists on its daily cricket
// listing — bilateral tours, ICC tournaments, domestic leagues, women's, youth and
// A-team — with each one's fixtures and results. One request per calendar day; the
// same feed scripts/import-cricket-espn.ts reads for the men's and women's
// internationals, so the listing's series ids and match ids line up with the
// scorecards ScoreDB already stores under its own competitions.
//
//   npx tsx --env-file=.env.local scripts/fetch-cricket-series.ts                    # last 3 days + next 10
//   npx tsx --env-file=.env.local scripts/fetch-cricket-series.ts --days 10 --ahead 90
//   npx tsx --env-file=.env.local scripts/fetch-cricket-series.ts --since 2024-01-01 # backfill
import { pool } from "./lib/db";

const HEADER_URL = "https://site.web.api.espn.com/apis/v2/scoreboard/header?sport=cricket&dates=";
const REQUEST_DELAY_MS = 120;
const RETRIES = 4;

// ESPN series ids of the competitions ScoreDB keeps scorecards for, and the
// international class ids that route a match to the bilateral archives.
const LEAGUE_BY_SERIES: Record<string, string> = {
  "8048": "ipl",
  "8044": "bbl",
  "8039": "cwc",
  "8604": "t20wc",
  "21282": "wpl",
  "21284": "wbbl",
  "8584": "wcwc",
  "8634": "wt20wc",
};
const LEAGUE_BY_CLASS: Record<string, string> = { "2": "odi", "3": "t20i", "9": "wodi", "10": "wt20i" };

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
/* Classification                                                            */
/* ------------------------------------------------------------------------ */

const MENS_INTL = new Set(["1", "2", "3"]);
const WOMENS_INTL = new Set(["8", "9", "10"]);

function kindOf(events: any[], leagueName: string): string {
  const intl = new Set(events.map((e) => String(e.class?.internationalClassId ?? "0")));
  const cards = events.map((e) => `${e.class?.generalClassCard ?? ""} ${e.class?.name ?? ""}`).join(" ");
  const womens = /women/i.test(cards) || /women/i.test(leagueName);
  if ([...intl].some((c) => MENS_INTL.has(c))) return "international";
  if ([...intl].some((c) => WOMENS_INTL.has(c))) return "womens-international";
  if (/under-?\s?19|under-?\s?23|emerging|\bA\b (women|team)|\bA tour|tour of .* A\b| A v | A Women/i.test(leagueName) || /youth|under/i.test(cards)) return "other";
  return womens ? "womens-domestic" : "domestic";
}

// "…-vs-…-10th-match-…" / "…-final-…" in the match link slug, the only place the
// listing says which match of the series it is.
// ESPN flags a match "in" from the scheduled start even when its summary still reads
// "Match scheduled to begin at ..." (rain, a late toss); that is an upcoming match.
function matchState(ev: any): string | null {
  const state = ev.status ?? ev.fullStatus?.type?.state ?? null;
  const summary = String(ev.fullStatus?.longSummary ?? ev.summary ?? "");
  return state === "in" && /scheduled to begin/i.test(summary) ? "pre" : state;
}

function descriptionFromLink(link: unknown): string | null {
  if (typeof link !== "string") return null;
  const slug = link.split("/").pop() ?? "";
  const after = slug.split("-vs-")[1] ?? slug;
  const m = after.match(/\b(\d+)(st|nd|rd|th)-(match|odi|t20i|test|t20|semi-final|quarter-final|place|unofficial-odi|unofficial-test|youth-odi|youth-test)\b/);
  if (m) return `${m[1]}${m[2]} ${m[3].split("-").map((w) => (["odi", "t20i", "t20"].includes(w) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1))).join(" ")}`;
  const stage = after.match(/\b(final|semi-final|quarter-final|eliminator|qualifier-\d|super-over|3rd-place-play-off|play-off)\b/);
  return stage ? stage[1].split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ") : null;
}

function competitor(c: any) {
  if (!c) return null;
  return {
    id: String(c.id ?? ""),
    name: c.displayName ?? c.name ?? "",
    abbreviation: c.abbreviation ?? null,
    score: typeof c.score === "string" && c.score ? c.score : null,
    winner: c.winner === true,
    logo: c.logo ?? null,
  };
}

/* ------------------------------------------------------------------------ */
/* Main                                                                      */
/* ------------------------------------------------------------------------ */

async function main() {
  const { since, until } = parseArgs();
  console.log(`[fetch-cricket-series] ${since.toISOString().slice(0, 10)} → ${until.toISOString().slice(0, 10)}`);
  type SeriesMeta = { name: string; short: string | null; abbr: string | null; slug: string | null; isTournament: boolean; events: any[] };
  const seriesMeta = new Map<string, SeriesMeta>();
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
    const rows: any[] = [];
    for (const sport of data.sports ?? []) {
      for (const lg of sport.leagues ?? []) {
        const id = String(lg.id ?? "");
        if (!id) continue;
        const meta: SeriesMeta = seriesMeta.get(id) ?? { name: String(lg.name ?? lg.shortName ?? id), short: lg.shortName ?? null, abbr: lg.abbreviation ?? null, slug: lg.slug ?? null, isTournament: lg.isTournament === true, events: [] };
        for (const ev of lg.events ?? []) {
          if (!ev.id || !ev.date) continue;
          meta.events.push(ev);
          const home = competitor((ev.competitors ?? []).find((c: any) => c.homeAway === "home") ?? ev.competitors?.[0]);
          const away = competitor((ev.competitors ?? []).find((c: any) => c.homeAway === "away") ?? ev.competitors?.[1]);
          const candidates = [LEAGUE_BY_SERIES[id], LEAGUE_BY_CLASS[String(ev.class?.internationalClassId ?? "")]].filter(Boolean) as string[];
          rows.push({
            id: String(ev.id),
            series: id,
            date: ev.date,
            name: String(ev.name ?? `${home?.name} v ${away?.name}`),
            short: ev.shortName ?? null,
            description: descriptionFromLink(ev.link),
            card: ev.class?.generalClassCard ?? null,
            className: ev.class?.name ?? null,
            intl: String(ev.class?.internationalClassId ?? "0"),
            state: matchState(ev),
            summary: ev.fullStatus?.longSummary ?? ev.summary ?? null,
            home,
            away,
            candidates,
          });
        }
        seriesMeta.set(id, meta);
      }
    }
    if (rows.length > 0) {
      await pool.query(
        `insert into cricket_series_matches (espn_id, series_espn_id, date, name, short_name, description, class_card, class_name, international_class_id,
                                             status_state, status_summary, home, away, league_candidates, updated_at)
         select r.id, r.series, r.date, r.name, r.short, r.description, r.card, r.class_name, r.intl, r.state, r.summary, r.home::jsonb, r.away::jsonb,
                coalesce(string_to_array(nullif(r.candidates, ''), ','), '{}'::text[]), now()
         from unnest($1::text[], $2::text[], $3::timestamptz[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[], $9::text[], $10::text[], $11::text[], $12::text[], $13::text[], $14::text[])
           as r(id, series, date, name, short, description, card, class_name, intl, state, summary, home, away, candidates)
         on conflict (espn_id) do update set
           series_espn_id = excluded.series_espn_id, date = excluded.date, name = excluded.name, short_name = excluded.short_name,
           description = coalesce(excluded.description, cricket_series_matches.description), class_card = excluded.class_card, class_name = excluded.class_name,
           international_class_id = excluded.international_class_id, status_state = excluded.status_state, status_summary = excluded.status_summary,
           home = excluded.home, away = excluded.away, league_candidates = excluded.league_candidates, updated_at = now()`,
        [
          rows.map((r) => r.id),
          rows.map((r) => r.series),
          rows.map((r) => r.date),
          rows.map((r) => r.name),
          rows.map((r) => r.short),
          rows.map((r) => r.description),
          rows.map((r) => r.card),
          rows.map((r) => r.className),
          rows.map((r) => r.intl),
          rows.map((r) => r.state),
          rows.map((r) => r.summary),
          rows.map((r) => JSON.stringify(r.home)),
          rows.map((r) => JSON.stringify(r.away)),
          rows.map((r) => r.candidates.join(",")),
        ]
      );
      matches += rows.length;
    }
    if (days % 50 === 0) console.log(`[fetch-cricket-series] ${days} days, ${matches} match rows`);
    await sleep(REQUEST_DELAY_MS);
  }

  // Series rows: identity from the listing; dates, counts, formats and teams from
  // every match stored for the series (older runs included), so a series first seen
  // mid-way still spans its full window once the earlier days have been swept.
  for (const [id, meta] of seriesMeta) {
    await pool.query(
      `insert into cricket_series (espn_id, name, short_name, abbreviation, slug, is_tournament, kind, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, now())
       on conflict (espn_id) do update set
         name = excluded.name, short_name = excluded.short_name, abbreviation = excluded.abbreviation, slug = excluded.slug,
         is_tournament = excluded.is_tournament, kind = excluded.kind, updated_at = now()`,
      [id, meta.name, meta.short, meta.abbr, meta.slug, meta.isTournament, kindOf(meta.events, meta.name)]
    );
  }
  const ids = [...seriesMeta.keys()];
  await pool.query(
    `update cricket_series s set
       start_date = a.start_date, end_date = a.end_date, match_count = a.n, completed_count = a.done, formats = a.formats,
       season = extract(year from a.start_date)::int, teams = a.teams
     from (
       select m.series_espn_id, min(m.date) as start_date, max(m.date) as end_date, count(*)::int as n,
              count(*) filter (where m.status_state = 'post')::int as done,
              array(select distinct x.class_card from cricket_series_matches x where x.series_espn_id = m.series_espn_id and x.class_card is not null order by 1) as formats,
              (select coalesce(jsonb_agg(t order by t ->> 'name'), '[]'::jsonb) from (
                 select distinct on (side ->> 'id') side as t from cricket_series_matches y, lateral (values (y.home), (y.away)) v(side)
                 where y.series_espn_id = m.series_espn_id and side ->> 'id' <> '' and side ->> 'name' !~* '^tb[ac]$'
                 order by side ->> 'id', y.date desc) q) as teams
       from cricket_series_matches m where m.series_espn_id = any($1::text[]) group by m.series_espn_id
     ) a where a.series_espn_id = s.espn_id`,
    [ids]
  );
  console.log(`[fetch-cricket-series] ${days} days: ${matches} match rows across ${seriesMeta.size} series`);
  await pool.end();
}

main().catch((err) => {
  console.error("[fetch-cricket-series] failed:", err);
  process.exit(1);
});
