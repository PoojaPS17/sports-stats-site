// Live tennis straight from ESPN at request time: the day's listing, read with a
// 10-second cache and laid over the stored rows so a match in play shows its
// current set score, and one that finished since the last scrape shows its result.
import { pool } from "./db";
import { easternDay, parseTennisEvent, TENNIS_HEADER_URL, type FeedMatch } from "./tennisFeed";
import type { TennisMatch, TennisSide } from "./tennis";
import { idsFollowingOnCourt, occupiesCourt } from "./tennisDisplay";

const LIVE_REVALIDATE = 10;

async function fetchDayFeed(day: string): Promise<FeedMatch[]> {
  try {
    const res = await fetch(TENNIS_HEADER_URL + day.replace(/-/g, ""), { next: { revalidate: LIVE_REVALIDATE } });
    if (!res.ok) return [];
    const data = await res.json();
    const out: FeedMatch[] = [];
    for (const sport of data?.sports ?? []) {
      for (const lg of sport.leagues ?? []) {
        for (const ev of lg.events ?? []) {
          const m = parseTennisEvent(String(lg.id), ev);
          if (m) out.push(m);
        }
      }
    }
    return out;
  } catch {
    return [];
  }
}

function toSide(s: FeedMatch["sides"][0], slugs: Map<string, string>): TennisSide {
  return { ...s, slugs: s.ids.map((id) => slugs.get(id) ?? null) };
}

/**
 * Stored rows for `day` with ESPN's current state over them. Only today's (US
 * Eastern) listing is read — any other day is settled and the stored rows stand.
 */
export async function overlayLiveTennis(day: string, rows: TennisMatch[], tour?: "atp" | "wta"): Promise<{ matches: TennisMatch[]; live: boolean }> {
  if (day !== easternDay(new Date().toISOString())) return { matches: rows, live: false };
  const dayFeed = (await fetchDayFeed(day)).filter((m) => m.day === day);
  // Judged over every match of the day, not just this tour's: a Slam's courts are shared by both tours.
  const following = idsFollowingOnCourt(dayFeed.map((m) => ({ id: m.id, tournament: m.tournamentId, court: m.court, day: m.day, date: m.date, occupies: occupiesCourt({ status_detail: m.statusDetail, completed: m.completed }) })));
  const feed = dayFeed.filter((m) => !tour || m.tour === tour);
  if (feed.length === 0) return { matches: rows, live: rows.some((r) => r.status_state === "in") };

  const ids = new Set(feed.flatMap((m) => [...m.sides[0].ids, ...m.sides[1].ids]));
  const { rows: players } = await pool.query(`select league, espn_id, slug from players where league in ('atp','wta') and espn_id = any($1::text[])`, [[...ids]]);
  const slugs = new Map<string, string>();
  for (const p of players) slugs.set(`${p.league}:${p.espn_id}`, p.slug);

  const byId = new Map(rows.map((r) => [r.espn_id, r]));
  for (const m of feed) {
    const tourSlugs = new Map<string, string>();
    for (const id of [...m.sides[0].ids, ...m.sides[1].ids]) {
      const s = slugs.get(`${m.tour}:${id}`);
      if (s) tourSlugs.set(id, s);
    }
    const stored = byId.get(m.id);
    const fresh: TennisMatch = {
      espn_id: m.id,
      tour: m.tour,
      tournament_espn_id: m.tournamentId,
      tournament_name: m.tournamentName,
      tournament_location: stored?.tournament_location ?? m.location,
      major: stored?.major ?? m.major,
      competition_type: m.type as TennisMatch["competition_type"],
      round: m.round,
      round_number: m.roundNumber,
      court: m.court ?? stored?.court ?? null,
      date: m.date,
      day: m.day,
      completed: m.completed,
      status_state: m.statusState,
      status_detail: m.statusDetail,
      winner_side: m.winnerSide,
      after_court_match: following.has(m.id),
      side1: toSide(m.sides[0], tourSlugs),
      side2: toSide(m.sides[1], tourSlugs),
    };
    // A stored row keeps its fuller names (the detail fetch) when the feed only
    // abbreviates; everything about the state of play comes from the feed.
    if (stored && stored.side1.names.length === fresh.side1.names.length && fresh.side1.names.some((n) => /^[A-Z]\.\s/.test(n))) fresh.side1.names = stored.side1.names;
    if (stored && stored.side2.names.length === fresh.side2.names.length && fresh.side2.names.some((n) => /^[A-Z]\.\s/.test(n))) fresh.side2.names = stored.side2.names;
    byId.set(m.id, fresh);
  }
  const matches = [...byId.values()];
  const order = ["mens-singles", "womens-singles", "mens-doubles", "womens-doubles", "mixed-doubles"];
  matches.sort(
    (a, b) =>
      Number(b.major) - Number(a.major) ||
      a.tournament_name.localeCompare(b.tournament_name) ||
      order.indexOf(a.competition_type ?? "") - order.indexOf(b.competition_type ?? "") ||
      (b.round_number ?? 0) - (a.round_number ?? 0) ||
      a.date.localeCompare(b.date)
  );
  return { matches, live: matches.some((r) => r.status_state === "in") };
}
