import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { isLeague } from "@/lib/queries";

// Vercel's edge/proxy layer injects this header with the visitor's real IP-geolocated
// country — nothing fetched from a third party at request time. Absent off-Vercel
// (e.g. local dev), which just means country stays untracked there.
function detectCountry(req: NextRequest): string | null {
  return req.headers.get("x-vercel-ip-country");
}

// Coarse device classification from the request's own User-Agent — not app-store data,
// just "was this visit from an iOS device, an Android device, or something else."
function detectPlatform(req: NextRequest): string | null {
  const ua = req.headers.get("user-agent") ?? "";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  if (ua) return "desktop";
  return null;
}

// Records one real view of a match-detail page — called client-side (see
// ViewTracker) so it reflects actual visits regardless of ISR caching. Deliberately
// minimal: no auth, no dedup beyond "one row per page load" — a handful of accidental
// double-counts from a fast refresh doesn't matter for a popularity ranking, and this
// endpoint has nothing worth attacking beyond a bit of junk data.
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const { league, gameId } = (body ?? {}) as { league?: unknown; gameId?: unknown };
  if (typeof league !== "string" || !isLeague(league) || typeof gameId !== "string" || !gameId) {
    return NextResponse.json({ error: "invalid league or gameId" }, { status: 400 });
  }

  await pool.query(`insert into game_views (league, game_espn_id, country, platform) values ($1, $2, $3, $4)`, [
    league,
    gameId,
    detectCountry(req),
    detectPlatform(req),
  ]);
  return NextResponse.json({ ok: true });
}
