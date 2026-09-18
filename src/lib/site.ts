// Absolute site origin for canonical URLs, sitemaps, structured data and share
// images. NEXT_PUBLIC_SITE_URL overrides it (preview deployments, a future move).
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://sports-db.live").replace(/\/$/, "");
export const SITE_NAME = "ScoreDB";

export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
