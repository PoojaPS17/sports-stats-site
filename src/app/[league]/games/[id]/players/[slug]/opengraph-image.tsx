import { ImageResponse } from "next/og";
import { loadPerformanceCardData, buildPerformanceCardElement } from "@/lib/performanceCardData";
import { CARD_FONTS } from "@/lib/cardFont";

export const alt = "Player performance card";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
// A completed game's own performance card does not change like a live score does (unlike
// games/[id]/opengraph-image.tsx, which stays dynamic for that reason) — held to the site-wide
// five-minute cap (next.config.ts), not the card route's dynamic 2-hour cache-control logic.
export const revalidate = 300;

// An empty list, so nothing is built up front: each address is rendered on the first request and
// then served from the cache above until it goes stale. Without this export the page would be
// rendered again on every request and the revalidate above would never apply. Addresses that do
// not exist still render on demand (dynamicParams is left at its default).
export function generateStaticParams() {
  return [];
}

export default async function Image({ params }: { params: Promise<{ league: string; id: string; slug: string }> }) {
  const { league, id, slug } = await params;
  const data = await loadPerformanceCardData(league, id, slug);
  if (!data) {
    return new ImageResponse(<div style={{ width: "100%", height: "100%", background: "#0f2745", color: "#eef1f7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 64 }}>SportsDB</div>, size);
  }
  return new ImageResponse(buildPerformanceCardElement(data), { ...size, fonts: CARD_FONTS });
}
