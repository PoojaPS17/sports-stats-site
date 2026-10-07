// Which cricket match pages may be cached, and for how long.
//
// A match in play, or still to come, is rendered per request (the page calls connection()), so the
// response says no-store and Cloudflare bypasses it. A match that is over never changes again, so its
// render is cached by Next and the edge is told to keep it for a day: Search Console put the average
// crawl response at 1.24 s with finished matches most of the crawl, and a day-old copy of a result
// is still the result.
//
// "Over" is decided by two independent sources agreeing. The stored row says post (the scrape saw the
// match final at least one tick ago), ESPN's summary says post now, and both sides carry their final
// total (or the match was closed without play, so there is none to wait for). A summary fetched mid-collapse
// of ESPN's feed (an error body, a result whose totals are not in yet) fails that test and the page
// stays dynamic rather than being frozen wrong for a day. Innings rows are not required: ESPN
// publishes some domestic results with totals and no card, and that page will not change either.
import { isNeverPlayed } from "./gameStatus";
import { pool } from "./db";

/** A closed match with no totals to wait for: postponed or cancelled (never played), abandoned without a ball bowled, or ended "No result" (rain can leave one side without a total). A suspended one may resume. */
const closedWithoutPlay = (text: string) => isNeverPlayed(text) || /abandon|no result/i.test(text);

/** How long a finished match's render and its ESPN summary are kept: a day (above the site cap on purpose, nothing in it moves). */
export const FINISHED_MATCH_REVALIDATE = 86400;

interface StoredStatus {
  status_state: string | null;
  status_summary: string | null;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- ESPN feed JSON has no published schema */
export function isSettledCricketMatch(stored: StoredStatus | null, summary: any | null): boolean {
  if (!stored || stored.status_state !== "post" || !summary) return false;
  const status = summary.header?.competitions?.[0]?.status;
  if (status?.type?.state !== "post") return false;
  const competitors: any[] = summary.header.competitions[0].competitors ?? [];
  const scored = competitors.length >= 2 && competitors.every((c) => typeof c.score === "string" && c.score.trim() !== "");
  return scored || closedWithoutPlay(String(status.summary ?? stored.status_summary ?? ""));
}

interface StoredSides {
  status_state: string | null;
  status_summary: string | null;
  home?: { score?: string | null } | null;
  away?: { score?: string | null } | null;
}

/**
 * The proxy's test, from the stored row alone (ESPN is not consulted per request): post, with both
 * sides' totals as the scrape stored them, or closed without play. The final route checks ESPN's
 * copy as well before it is kept for a day.
 */
export function isStoredFinalMatch(row: StoredSides | null): boolean {
  if (!row || row.status_state !== "post") return false;
  const total = (side: StoredSides["home"]) => typeof side?.score === "string" && side.score.trim() !== "";
  return (total(row.home) && total(row.away)) || closedWithoutPlay(row.status_summary ?? "");
}

/**
 * Whether /cricket/matches/<id> may be served by the day-cached final route: one indexed read. A
 * match SportsDB archives under a league has its own page and redirects there, so it never is. Any
 * database error says no, and the public route renders the match as usual.
 */
export async function storedMatchIsFinal(espnId: string): Promise<boolean> {
  try {
    const { rows } = await pool.query(
      `select m.status_state, m.status_summary, m.home, m.away
       from cricket_series_matches m
       where m.espn_id = $1
         and not exists (select 1 from games g where g.espn_id = m.espn_id and g.league = any(m.league_candidates))`,
      [espnId]
    );
    return isStoredFinalMatch(rows[0] ?? null);
  } catch (err) {
    console.warn(`[cricket] final-match lookup failed for ${espnId}: ${err instanceof Error ? err.message : err}`);
    return false;
  }
}
