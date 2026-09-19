// Client-side "follow" list for the personalized homepage. There is no login system
// on the site, so follows live in this browser's localStorage rather than an account —
// see MyFollows for the homepage section that reads this back.
export type FollowKind = "team" | "player" | "game" | "series" | "tournament";

export type FollowItem = {
  kind: FollowKind;
  league: string;
  /** The espn id / slug / series id that identifies the entity within (kind, league). */
  refId: string;
  label: string;
  sublabel?: string;
  href: string;
  addedAt: number;
};

const STORAGE_KEY = "sportsdb-follows";
// Fired on this tab whenever the list changes, so every FollowButton/MyFollows
// instance on the page updates without a shared React tree ("storage" alone only
// fires in *other* tabs).
export const FOLLOWS_EVENT = "sportsdb:follows-changed";
// Follows accumulate indefinitely otherwise (old games never get "unfollowed").
const MAX_FOLLOWS = 200;

export function followKey(kind: FollowKind, league: string, refId: string): string {
  return `${kind}:${league}:${refId}`;
}

function readAll(): FollowItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as FollowItem[]) : [];
  } catch {
    return [];
  }
}

function writeAll(items: FollowItem[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_FOLLOWS)));
  } catch {
    /* storage unavailable (private browsing quota, etc.) - the toggle just won't persist */
  }
  window.dispatchEvent(new Event(FOLLOWS_EVENT));
}

/** Most recently followed first, for the homepage list. */
export function getFollows(): FollowItem[] {
  return readAll().sort((a, b) => b.addedAt - a.addedAt);
}

export function isFollowing(kind: FollowKind, league: string, refId: string): boolean {
  const key = followKey(kind, league, refId);
  return readAll().some((f) => followKey(f.kind, f.league, f.refId) === key);
}

/** Adds or removes the item from the follow list; returns the resulting following state. */
export function toggleFollow(item: Omit<FollowItem, "addedAt">): boolean {
  const key = followKey(item.kind, item.league, item.refId);
  const all = readAll();
  const idx = all.findIndex((f) => followKey(f.kind, f.league, f.refId) === key);
  if (idx === -1) {
    writeAll([...all, { ...item, addedAt: Date.now() }]);
    return true;
  }
  all.splice(idx, 1);
  writeAll(all);
  return false;
}

export function removeFollow(kind: FollowKind, league: string, refId: string) {
  const key = followKey(kind, league, refId);
  writeAll(readAll().filter((f) => followKey(f.kind, f.league, f.refId) !== key));
}
