import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site";
import { SITEMAP_IDS } from "@/lib/sitemap";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Internal JSON endpoints, calendar feeds and free-text search results are
        // not pages worth indexing.
        disallow: ["/api/", "/calendar/", "/search"],
      },
    ],
    sitemap: SITEMAP_IDS.map((id) => absoluteUrl(`/sitemap/${id}.xml`)),
  };
}
