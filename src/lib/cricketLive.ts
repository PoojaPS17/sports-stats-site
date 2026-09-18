/* eslint-disable @typescript-eslint/no-explicit-any -- ESPN feed JSON has no published schema */
// Live cricket straight from ESPN at request time. The scrape writes every series
// match on a 15-minute tick, which is fine for fixtures and results but not for a
// match in play; pages that show live scores read the same daily listing here with
// a 30-second cache and overlay it on the stored rows.
import type { CricketSeriesMatch, SeriesSide } from "./cricketSeries";

const HEADER_URL = "https://site.web.api.espn.com/apis/v2/scoreboard/header?sport=cricket&dates=";
const LIVE_REVALIDATE = 30;

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

function side(c: any): SeriesSide | null {
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

async function fetchDay(ymd: string): Promise<any | null> {
  try {
    const res = await fetch(HEADER_URL + ymd, { next: { revalidate: LIVE_REVALIDATE } });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data?.sports) ? data : null;
  } catch {
    return null;
  }
}

/** Every cricket match ESPN lists as in play right now, in the stored-row shape. */
export async function fetchLiveCricketFromEspn(): Promise<CricketSeriesMatch[]> {
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86_400_000);
  const days = await Promise.all([today, yesterday].map((d) => fetchDay(d.toISOString().slice(0, 10).replace(/-/g, ""))));
  const out = new Map<string, CricketSeriesMatch>();
  for (const data of days) {
    for (const sport of data?.sports ?? []) {
      for (const lg of sport.leagues ?? []) {
        for (const ev of lg.events ?? []) {
          if (ev.status !== "in" || !ev.id || out.has(String(ev.id))) continue;
          const seriesId = String(lg.id ?? "");
          const league = LEAGUE_BY_SERIES[seriesId] ?? null;
          out.set(String(ev.id), {
            espn_id: String(ev.id),
            series_espn_id: seriesId,
            series_name: String(lg.name ?? ""),
            date: ev.date,
            name: String(ev.name ?? ""),
            short_name: ev.shortName ?? null,
            description: null,
            class_card: ev.class?.generalClassCard ?? null,
            status_state: "in",
            status_summary: ev.fullStatus?.longSummary ?? ev.summary ?? null,
            home: side((ev.competitors ?? []).find((c: any) => c.homeAway === "home") ?? ev.competitors?.[0]),
            away: side((ev.competitors ?? []).find((c: any) => c.homeAway === "away") ?? ev.competitors?.[1]),
            // Only competitions ScoreDB archives have their own match page; the live
            // page serves everything else (and a live match's stored page may not exist yet).
            scorecard_league: league as CricketSeriesMatch["scorecard_league"],
          });
        }
      }
    }
  }
  return [...out.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Stored rows with ESPN's current state laid over them: live scores replace stale ones, and a match that started since the last scrape is added. */
export async function overlayLiveCricket(rows: CricketSeriesMatch[], seriesEspnId?: string): Promise<CricketSeriesMatch[]> {
  const live = await fetchLiveCricketFromEspn();
  if (live.length === 0) return rows;
  const byId = new Map(rows.map((r) => [r.espn_id, r]));
  for (const m of live) {
    if (seriesEspnId && m.series_espn_id !== seriesEspnId) continue;
    const stored = byId.get(m.espn_id);
    byId.set(m.espn_id, stored ? { ...stored, status_state: "in", status_summary: m.status_summary, home: m.home, away: m.away } : m);
  }
  return [...byId.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** One match's full summary (scorecard, officials, venue), fresh enough for a match in play. */
export async function fetchCricketSummaryLive(espnId: string, seriesId = "8048"): Promise<any | null> {
  try {
    const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/cricket/${seriesId}/summary?event=${espnId}`, { next: { revalidate: LIVE_REVALIDATE } });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.header?.competitions?.[0]?.competitors?.length ? data : null;
  } catch {
    return null;
  }
}
