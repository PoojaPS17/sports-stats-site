import { NextRequest, NextResponse } from "next/server";
import { getGameByEspnId, isLeague } from "@/lib/queries";

// Refreshes the score/status of games a visitor has followed (see lib/follow.ts) so
// MyFollows on the homepage shows live scores rather than whatever was stored in
// localStorage at follow-time. `ids` is a comma-separated list of "league:espnId"
// pairs; the response maps each back to its current GameRow (missing/invalid ids are
// dropped rather than erroring, since a stale follow shouldn't break the whole list).
const MAX_IDS = 25;

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("ids") ?? "";
  const pairs = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_IDS)
    .map((s) => {
      const i = s.indexOf(":");
      return i === -1 ? null : ([s.slice(0, i), s.slice(i + 1)] as const);
    })
    .filter((p): p is readonly [string, string] => p !== null && isLeague(p[0]) && p[1].length > 0);

  const results = await Promise.all(
    pairs.map(async ([league, espnId]) => {
      if (!isLeague(league)) return null;
      const game = await getGameByEspnId(league, espnId);
      return game ? ([`${league}:${espnId}`, game] as const) : null;
    })
  );

  const games: Record<string, Awaited<ReturnType<typeof getGameByEspnId>>> = {};
  for (const r of results) if (r) games[r[0]] = r[1];
  return NextResponse.json({ games });
}
