import type { Metadata } from "next";
import { CricketMatchPage, cricketMatchMetadata } from "@/lib/cricketMatchPage";

// The live page for any cricket match ESPN lists, read straight from ESPN's summary with a
// 10-second cache and refreshed in the browser while the match is in play.
export const revalidate = 10;

// Dynamic on purpose: no generateStaticParams here, so the state of the match is read fresh each time.
// It renders on every request and answers no-store: a cached render is up to 5 minutes old
// (expireTime in next.config.ts), and a render made in the pre state ships no LiveRefresh timer,
// so it would not catch up on its own. The window above still sets the default for the cached
// fetches inside this render. A match that is over does not come here at all: the proxy rewrites
// it to ../final/[id], the same page cached for a day (see lib/cricketMatchCache.ts).

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return cricketMatchMetadata(id);
}

export default async function CricketLiveMatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CricketMatchPage id={id} mode="live" />;
}
