import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site";
import { SITEMAP_IDS } from "@/lib/sitemap";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Internal JSON endpoints are not pages worth indexing. /search (noindex meta)
        // and /calendar (X-Robots-Tag) are left crawlable on purpose: a robots-blocked URL
        // that is linked sitewide can still be indexed URL-only, and Google never sees the noindex.
        disallow: ["/api/"],
      },
    ],
    sitemap: SITEMAP_IDS.map((id) => absoluteUrl(`/sitemap/${id}.xml`)),
  };
}
