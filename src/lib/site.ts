import { PRIMARY_HOST } from "./launchHost";

// Absolute site origin for canonical URLs, sitemaps, structured data and share images.
// NEXT_PUBLIC_SITE_URL is a build-time value: rebuild after changing it.
//
// Before launch it may be unset; the fallback is the vercel.app review copy, which
// src/proxy.ts marks noindex, so that host is never advertised as canonical by a launched site.
// Once SITE_LAUNCHED=1 (server side only: the client bundle never sees that variable, so
// nothing here throws in the browser) the build must say where the site lives: the URL
// has to be set and its host has to be the launch host src/proxy.ts serves (sports-db.live).
// Anything else would point every canonical, sitemap, robots and schema URL of the launched
// site at a noindexed host, so the build fails loudly instead.
const REVIEW_COPY_URL = "https://sports-stats-site.vercel.app";

export function resolveSiteUrl(env: { NEXT_PUBLIC_SITE_URL?: string; SITE_LAUNCHED?: string }): string {
  const configured = env.NEXT_PUBLIC_SITE_URL;
  if (env.SITE_LAUNCHED === "1") {
    if (!configured) {
      throw new Error(`SITE_LAUNCHED=1 but NEXT_PUBLIC_SITE_URL is not set; it must be https://${PRIMARY_HOST}`);
    }
    let url: URL;
    try {
      url = new URL(configured);
    } catch {
      throw new Error(`NEXT_PUBLIC_SITE_URL is not a valid URL ("${configured}"); it must be https://${PRIMARY_HOST}`);
    }
    if (url.host !== PRIMARY_HOST || url.protocol !== "https:") {
      throw new Error(`NEXT_PUBLIC_SITE_URL is "${configured}" but the launched site lives at https://${PRIMARY_HOST}; set NEXT_PUBLIC_SITE_URL=https://${PRIMARY_HOST}`);
    }
    // The validated origin, never the raw string: a typo'd path, port or case cannot reach a canonical.
    return `https://${PRIMARY_HOST}`;
  }
  return (configured ?? REVIEW_COPY_URL).replace(/\/$/, "");
}

// Each variable is read by its full name so the bundler can inline NEXT_PUBLIC_SITE_URL.
export const SITE_URL = resolveSiteUrl({
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  SITE_LAUNCHED: process.env.SITE_LAUNCHED,
});
export const SITE_NAME = "SportsDB";
// One public address for corrections, rights-holder requests and privacy questions.
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "sportsdblive@gmail.com";
// x.com handle, also linked from the header (see Nav.tsx) — shown on downloadable
// card images alongside the domain, the way ps-store-db.live signs its own exports.
export const X_HANDLE = "sportsdblive";

export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
