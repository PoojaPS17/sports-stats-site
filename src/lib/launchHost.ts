// The one host that is ever indexable. src/proxy.ts serves the holding page and the noindex
// rules around it, and src/lib/site.ts refuses to build a launched site whose public URL is
// any other host. Kept in one place so the two can never disagree.
export const PRIMARY_HOST = "sports-db.live";
