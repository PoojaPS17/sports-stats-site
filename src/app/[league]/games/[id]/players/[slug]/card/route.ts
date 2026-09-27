import { ImageResponse } from "next/og";
import { loadPerformanceCardData, buildPerformanceCardElement } from "@/lib/performanceCardData";
import { CARD_FONTS } from "@/lib/cardFont";

export const revalidate = 300;

const SIZES: Record<string, { width: number; height: number }> = {
  og: { width: 1200, height: 630 },
  portrait: { width: 1080, height: 1350 },
  story: { width: 1080, height: 1920 },
};

function notFound() {
  return new Response("Not found", { status: 404 });
}

export async function GET(request: Request, { params }: { params: Promise<{ league: string; id: string; slug: string }> }) {
  const { league, id, slug } = await params;
  const format = new URL(request.url).searchParams.get("format") ?? "og";
  const size = SIZES[format];
  if (!size) return new Response("Bad format", { status: 400 });

  const data = await loadPerformanceCardData(league, id, slug);
  if (!data) return notFound();

  const element = buildPerformanceCardElement(data);
  const png = new ImageResponse(element, { ...size, fonts: CARD_FONTS });

  // ESPN corrects box scores shortly after a game — a game final for more than 2 hours is
  // treated as settled (day-long cache); anything newer gets a 5-minute cache. Design doc §6.
  const finalOver2Hours = data.game.completed && Date.now() - new Date(data.game.date).getTime() > 2 * 60 * 60 * 1000;
  const cacheControl = finalOver2Hours ? "public, s-maxage=86400, stale-while-revalidate=604800" : "public, s-maxage=300";

  const headers = new Headers(png.headers);
  headers.set("cache-control", cacheControl);
  return new Response(png.body, { status: png.status, headers });
}
