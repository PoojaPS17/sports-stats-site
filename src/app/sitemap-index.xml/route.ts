import { SITEMAP_IDS } from "@/lib/sitemap";
import { absoluteUrl } from "@/lib/site";

export const revalidate = 86400;

// The conventional address for a site's sitemap: an index pointing at the per-section
// sitemaps robots.txt already lists, so a crawler or Search Console submission of
// /sitemap.xml finds everything.
export function GET() {
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${SITEMAP_IDS.map((id) => `  <sitemap><loc>${absoluteUrl(`/sitemap/${id}.xml`)}</loc></sitemap>`).join("\n")}
</sitemapindex>
`;
  return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
