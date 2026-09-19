import type { Metadata } from "next";
import { SITE_NAME, absoluteUrl } from "./site";

// Every page ships a distinct <title> and description (the root layout's title
// template appends " | SportsDB"). Pass `path` to emit a canonical URL, which matters
// for pages reachable under more than one address (the /week rewrite, query-string
// variants of compare pages) so search engines index one copy.
// Setting `openGraph` here replaces the root layout's, share image included, so the
// default image is named again. Routes with their own opengraph-image file (teams,
// games) pass `ownImage`, because images named here would replace the file's.
const SHARE_IMAGE = { url: absoluteUrl("/opengraph-image"), width: 1200, height: 630, alt: `${SITE_NAME}: live scores, standings and stats` };

export function pageMeta(title: string, description: string, path?: string, options: { noindex?: boolean; ownImage?: boolean } = {}): Metadata {
  const canonical = path ? absoluteUrl(path) : undefined;
  return {
    title,
    description,
    alternates: canonical ? { canonical } : undefined,
    robots: options.noindex ? { index: false, follow: true } : undefined,
    openGraph: { title, description, siteName: SITE_NAME, type: "website", url: canonical, ...(options.ownImage ? {} : { images: [SHARE_IMAGE] }) },
    twitter: { card: "summary_large_image", title, description, ...(options.ownImage ? {} : { images: [SHARE_IMAGE.url] }) },
  };
}
