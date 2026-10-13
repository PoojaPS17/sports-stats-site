// The same game page as ../../[id], for a game that is over with its report stored. The proxy
// rewrites /<league>/games/<id> here when the stored row says so (lib/gameCache.ts), so the public
// address never changes and this one is never linked; a direct request to it is redirected back.
// Such a render reads only the database, and nothing in a finished game moves, so it is kept for a
// day: at the origin by Next (the age cap in next.config.ts still re-renders a copy older than five
// minutes) and at the edge by Cloudflare, which follows the s-maxage this window becomes.
import type { Metadata } from "next";
import { generateMetadata as gameMetadata } from "../../[id]/page";
import { withShareImage } from "@/lib/gamePage";

export { default } from "../../[id]/page";

// The share image file lives beside the live route, so under this segment the page names it itself.
export async function generateMetadata(props: { params: Promise<{ league: string; id: string }> }): Promise<Metadata> {
  const { league, id } = await props.params;
  const meta = await gameMetadata(props);
  return withShareImage(meta, `/${league}/games/${id}/opengraph-image`, `${typeof meta.title === "string" ? meta.title : "Match page"} on SportsDB`);
}

export const revalidate = 86400;

// Without this export no render is cached (see static-params.test.ts); an empty array leaves every
// game to render on demand, and dynamicParams at its default.
export function generateStaticParams() {
  return [];
}
