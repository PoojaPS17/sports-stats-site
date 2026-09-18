// Absolute site origin for canonical URLs, sitemaps, structured data and share
// images. At launch set NEXT_PUBLIC_SITE_URL=https://sports-db.live in Vercel (see src/proxy.ts).
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://sports-stats-site.vercel.app").replace(/\/$/, "");
export const SITE_NAME = "ScoreDB";

export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
