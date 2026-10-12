// A stored image URL is not proof the image exists. Values that are plainly not a fetchable image
// (blank, the string "null", a bare host, a CDN's own "no photo" placeholder) render the initials or
// empty-disc fallback straight from the server instead of costing a request that is certain to fail.
// URLs that merely turn out to 404 (ESPN's cricket headshot path, for many players) are caught by
// SafeImg / TeamLogo's onError.
const PLACEHOLDER = /(?:^|\/)(?:no-?photo|no-?image|default[-_]?(?:image|headshot|logo|player)?|placeholder|missing)(?:[-_.\d]*\.(?:png|jpe?g|gif|webp|svg))?(?:[?#]|$)/i;

export function usableImageUrl(url: string | null | undefined): string | null {
  if (typeof url !== "string") return null;
  const u = url.trim();
  if (!u || /^(?:null|undefined|none|n\/a)$/i.test(u)) return null;
  if (u.startsWith("/")) return u.startsWith("//") ? usableImageUrl(`https:${u}`) : u;
  let parsed: URL;
  try {
    parsed = new URL(u);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  if (parsed.pathname === "/" || parsed.pathname === "") return null;
  if (PLACEHOLDER.test(parsed.pathname + parsed.search)) return null;
  return u;
}
