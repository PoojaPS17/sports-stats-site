import type { Metadata } from "next";
import { CricketMatchPage, cricketMatchMetadata } from "@/lib/cricketMatchPage";

// The same match page as ../../[id], for a match that is over. The proxy rewrites
// /cricket/matches/<id> here when the stored row says the match is final (lib/cricketMatchCache.ts),
// so the public address never changes and this one is never linked; a direct request to it is
// redirected back. Nothing in a finished match moves, so the render is kept for a day: at the
// origin by Next (the age cap in next.config.ts still re-renders a copy older than five minutes)
// and at the edge by Cloudflare, which follows the s-maxage this window becomes. Search Console put
// the average crawl response at 1.24 s with finished matches most of the crawl.
export const revalidate = 86400;

// Without this export no render is cached (see static-params.test.ts); an empty array leaves every
// match to render on demand, and dynamicParams at its default.
export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return cricketMatchMetadata(id);
}

export default async function CricketFinalMatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CricketMatchPage id={id} mode="final" />;
}
