import type { Metadata } from "next";
import { SITE_NAME, absoluteUrl } from "./site";

// Every page ships a distinct <title> and description (the root layout's title
// template appends " | SportsDB"). Pass `path` to emit a canonical URL, which matters
// for pages reachable under more than one address (the /week rewrite, query-string
// variants of compare pages) so search engines index one copy.
export function pageMeta(title: string, description: string, path?: string, options: { noindex?: boolean } = {}): Metadata {
  const canonical = path ? absoluteUrl(path) : undefined;
  return {
    title,
    description,
    alternates: canonical ? { canonical } : undefined,
    robots: options.noindex ? { index: false, follow: true } : undefined,
    openGraph: { title, description, siteName: SITE_NAME, type: "website", url: canonical },
    twitter: { card: "summary_large_image", title, description },
  };
}
