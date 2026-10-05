// The same game page as ../../[id], for a game that is over with its report stored. The proxy
// rewrites /<league>/games/<id> here when the stored row says so (lib/gameCache.ts), so the public
// address never changes and this one is never linked; a direct request to it is redirected back.
// Such a render reads only the database, and nothing in a finished game moves, so it is kept for a
// day: at the origin by Next (the age cap in next.config.ts still re-renders a copy older than five
// minutes) and at the edge by Cloudflare, which follows the s-maxage this window becomes.
export { default, generateMetadata } from "../../[id]/page";

export const revalidate = 86400;

// Without this export no render is cached (see static-params.test.ts); an empty array leaves every
// game to render on demand, and dynamicParams at its default.
export function generateStaticParams() {
  return [];
}
