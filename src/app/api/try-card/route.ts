// The "Try a name" card for one player page, as JSON: /api/try-card?league=odi&player=virat-kohli. The URL fully
// describes the card, so the edge keeps one copy per player for every visitor. Bad input is a 400; a player that does
// not exist is `{ card: null }` under a short cache; a read that fails is the same, so a database blip is not a storm of 500s.
import { NextResponse } from "next/server";
import { isLeague } from "@/lib/leagues";
import { loadTryCard } from "@/lib/tryCardLoader";

export const dynamic = "force-dynamic";

const SLUG = /^[a-z0-9][a-z0-9-]{0,80}$/;

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const league = params.get("league") ?? "";
  const player = params.get("player") ?? "";
  if (!isLeague(league)) return NextResponse.json({ error: "league must be a competition with player pages" }, { status: 400 });
  if (!SLUG.test(player)) return NextResponse.json({ error: "player must be a player slug" }, { status: 400 });
  try {
    const card = await loadTryCard(league, player);
    return NextResponse.json({ card }, { headers: { "Cache-Control": card ? "public, s-maxage=900, stale-while-revalidate=3600" : "public, s-maxage=60, stale-while-revalidate=240" } });
  } catch (err) {
    console.error("try-card route", err);
    return NextResponse.json({ card: null }, { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" } });
  }
}
