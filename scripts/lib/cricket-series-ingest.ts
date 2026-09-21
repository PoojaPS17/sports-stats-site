/* eslint-disable @typescript-eslint/no-explicit-any -- ESPN feed JSON has no published schema */
// The steps of scripts/fetch-cricket-series.ts that read ESPN's daily cricket listing and write cricket_series /
// cricket_series_matches, kept apart from the script's fetch loop so a test can feed them saved listing days.
import { pool } from "./db";
import { resolveTeamLogo } from "../../src/lib/teamLogos";
import { baseSeriesId, isEditioned, seriesEdition, seriesTitle } from "../../src/lib/cricketSeriesKey";

// ESPN series ids of the competitions SportsDB keeps scorecards for, and the
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
const LEAGUE_BY_CLASS: Record<string, string> = { "1": "test", "2": "odi", "3": "t20i", "9": "wodi", "10": "wt20i" };

/* ------------------------------------------------------------------------ */
/* Classification                                                            */
/* ------------------------------------------------------------------------ */

const MENS_INTL = new Set(["1", "2", "3"]);
const WOMENS_INTL = new Set(["8", "9", "10"]);

export function kindOf(events: any[], leagueName: string): string {
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
    logo: resolveTeamLogo(c.id, c.logo ?? null),
  };
}

/* ------------------------------------------------------------------------ */
/* One listing day                                                           */
/* ------------------------------------------------------------------------ */

export type SeriesMeta = { name: string; short: string | null; abbr: string | null; slug: string | null; isTournament: boolean; events: any[] };
/** Series seen so far, by series id (an edition key for a tournament, ESPN's own id for a bilateral series). */
export type SeriesMap = Map<string, SeriesMeta>;

export interface MatchRow {
  id: string;
  series: string;
  date: string;
  name: string;
  short: string | null;
  description: string | null;
  card: string | null;
  className: string | null;
  intl: string;
  state: string | null;
  summary: string | null;
  home: ReturnType<typeof competitor>;
  away: ReturnType<typeof competitor>;
  candidates: string[];
}

/**
 * The matches of one daily listing, and the series they belong to (added to `seriesMeta`). A tournament's matches are
 * filed under the edition their own event names, so one league id can yield several series across days, or on one day.
 */
export function ingestDay(data: any, seriesMeta: SeriesMap): MatchRow[] {
  const rows: MatchRow[] = [];
  for (const sport of data.sports ?? []) {
    for (const lg of sport.leagues ?? []) {
      const leagueId = String(lg.id ?? "");
      if (!leagueId) continue;
      const metaFor = (seriesId: string, label: string | null): SeriesMeta => {
        let meta = seriesMeta.get(seriesId);
        if (!meta) {
          meta = { name: seriesTitle(String(lg.name ?? lg.shortName ?? leagueId), label), short: lg.shortName ?? null, abbr: lg.abbreviation ?? null, slug: lg.slug ?? null, isTournament: lg.isTournament === true, events: [] };
          seriesMeta.set(seriesId, meta);
        }
        return meta;
      };
      // A bilateral series with no match listed today is still a series; a tournament's edition is only known from a match.
      if ((lg.events ?? []).length === 0 && !isEditioned(lg)) metaFor(leagueId, null);
      for (const ev of lg.events ?? []) {
        if (!ev.id || !ev.date) continue;
        const { id: seriesId, label } = seriesEdition(lg, ev);
        metaFor(seriesId, label).events.push(ev);
        const home = competitor((ev.competitors ?? []).find((c: any) => c.homeAway === "home") ?? ev.competitors?.[0]);
        const away = competitor((ev.competitors ?? []).find((c: any) => c.homeAway === "away") ?? ev.competitors?.[1]);
        // The scorecard leagues are named by ESPN's own league id, not the edition key.
        const candidates = [LEAGUE_BY_SERIES[leagueId], LEAGUE_BY_CLASS[String(ev.class?.internationalClassId ?? "")]].filter(Boolean) as string[];
        rows.push({
          id: String(ev.id),
          series: seriesId,
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
    }
  }
  return rows;
}

/* ------------------------------------------------------------------------ */
/* Writes                                                                    */
/* ------------------------------------------------------------------------ */

export async function storeMatches(rows: MatchRow[]): Promise<void> {
  if (rows.length === 0) return;
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
}

/**
 * Series rows: identity from the listing; dates, counts, formats and teams from
 * every match stored for the series (older runs included), so a series first seen
 * mid-way still spans its full window once the earlier days have been swept.
 */
export async function storeSeries(seriesMeta: SeriesMap): Promise<void> {
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
  // Every tournament row of a league this run touched is recomputed, not just the ones it listed: a match that moved to
  // an edition leaves the old merged row (or another edition) holding fewer matches than its stored dates and count say.
  const bases = [...new Set([...seriesMeta.keys()].map(baseSeriesId))];
  const { rows: siblings } = await pool.query(`select espn_id from cricket_series where is_tournament and split_part(espn_id, '-', 1) = any($1::text[])`, [bases]);
  const ids = [...new Set([...seriesMeta.keys(), ...siblings.map((r) => r.espn_id as string)])];
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
  // A tournament row with no match left is an emptied one (the old merged row once its matches are refiled, or an edition a
  // match left when its label changed). It is deleted; it has no children. Bilateral series are not touched.
  await pool.query(
    `delete from cricket_series s
     where s.is_tournament and split_part(s.espn_id, '-', 1) = any($1::text[])
       and not exists (select 1 from cricket_series_matches m where m.series_espn_id = s.espn_id)`,
    [bases]
  );
}

/* ------------------------------------------------------------------------ */
/* Cleanup of the rows written before tournaments were keyed per edition      */
/* ------------------------------------------------------------------------ */

// Before editions, one row per tournament league id held every season's matches. Re-running the script over the
// matches' dates refiles them under their edition, and storeSeries recomputes that old row from what is left and deletes
// it once it is empty, so no owner cleanup is needed for correctness. The check below is read-only (it shows which old rows
// still hold matches, i.e. days a re-run has not reached); the delete is an optional final tidy for a row storeSeries
// did not get to (a league no run touched) and removes only such rows once nothing is filed under them.
export const LEGACY_MERGED_SERIES_CHECK_SQL = `
  select s.espn_id, s.name, s.start_date, s.end_date, s.match_count,
         (select count(*) from cricket_series_matches m where m.series_espn_id = s.espn_id)::int as matches
  from cricket_series s
  where s.is_tournament and s.espn_id !~ '-'
  order by s.espn_id`;

export const LEGACY_MERGED_SERIES_DELETE_SQL = `
  delete from cricket_series s
  where s.is_tournament and s.espn_id !~ '-'
    and not exists (select 1 from cricket_series_matches m where m.series_espn_id = s.espn_id)
  returning s.espn_id`;
