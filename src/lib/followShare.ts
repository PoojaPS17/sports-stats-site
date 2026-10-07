// A follow list as a link, so it can be sent to a friend or restored on another phone with no account.
// The list is packed into the `f` query parameter (compact JSON, base64url). Anything arriving through the
// link is untrusted, so decoding keeps only well-formed rows with an on-site path and re-caps the list.
import { FOLLOW_KINDS, type FollowItem, type FollowKind } from "./follow";

/** A shared link carries at most this many follows, which keeps the address under about 4 KB. */
export const MAX_SHARED = 30;

type Shared = Omit<FollowItem, "addedAt">;

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): string {
  const bin = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

const KIND_SET = new Set<string>(FOLLOW_KINDS);

/** True for a path on this site: one leading slash, never a protocol-relative or backslash trick. */
function isSitePath(href: string): boolean {
  return /^\/(?![/\\])/.test(href) && href.length <= 200;
}

export function encodeFollows(items: Shared[]): string {
  const rows = items.slice(0, MAX_SHARED).map((i) => [i.kind, i.league, i.refId, i.label, i.sublabel ?? "", i.href]);
  return toBase64Url(JSON.stringify(rows));
}

/** The follows a link carries, or an empty list for a missing or damaged parameter. */
export function decodeFollows(param: string | null | undefined): Shared[] {
  if (!param) return [];
  let rows: unknown;
  try {
    rows = JSON.parse(fromBase64Url(param));
  } catch {
    return [];
  }
  if (!Array.isArray(rows)) return [];
  const out: Shared[] = [];
  for (const row of rows.slice(0, MAX_SHARED)) {
    if (!Array.isArray(row) || row.length !== 6 || !row.every((v) => typeof v === "string")) continue;
    const [kind, league, refId, label, sublabel, href] = row as string[];
    if (!KIND_SET.has(kind) || !league || !refId || !label || !isSitePath(href)) continue;
    out.push({ kind: kind as FollowKind, league: league.slice(0, 40), refId: refId.slice(0, 80), label: label.slice(0, 120), sublabel: sublabel ? sublabel.slice(0, 80) : undefined, href });
  }
  return out;
}
