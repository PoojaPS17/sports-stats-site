// A stored logo URL can go dead without the database knowing (the source retires a path,
// a newly added team never had crest art) and @vercel/og's server-side <img> fetch throws
// rendering the share image if the response isn't a real image body ("Unsupported image
// type: unknown") — unlike a browser's <img onError>, which just falls back quietly. This
// checks a candidate URL is actually reachable and an image before it's handed to the
// renderer, so a dead URL degrades to the caller's fallback instead of crashing the route.
// It's a safety net on top of any curated substitute list (see teamLogos.ts): it catches
// ids nobody has curated yet, not just ones already known to be bad.
export async function verifyLogoUrl(url: string | null): Promise<string | null> {
  if (!url) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(url, { cache: "force-cache", next: { revalidate: 86400 }, signal: controller.signal });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "";
    return contentType.startsWith("image/") ? url : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
