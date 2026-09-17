import type { MetadataRoute } from "next";
import { SITEMAP_IDS, sitemapEntries } from "@/lib/sitemap";

// One sitemap per id (see SITEMAP_IDS), served at /sitemap/<id>.xml and listed in
// robots.txt. Regenerated daily.
export const revalidate = 86400;

export async function generateSitemaps() {
  return SITEMAP_IDS.map((id) => ({ id }));
}

export default async function sitemap(props: { id: Promise<string> }): Promise<MetadataRoute.Sitemap> {
  const id = await props.id;
  return sitemapEntries(String(id));
}
