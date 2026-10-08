// The last-visit clock behind "Moments you missed", and the request it makes. Pure apart from the
// storage it is handed, so every branch (first visit, a reload, storage that throws) is testable.
import type { HomeBlock } from "./blockTypes";
import { MAX_MOMENT_TEAMS } from "./blockParams";

/** localStorage: when the visitor last had the homepage up (epoch ms), written after the block has rendered. */
export const SEEN_KEY = "sportsdb-home-seen";
/** sessionStorage: the "since" this tab session started from, so a reload does not empty the block it just showed. */
export const SEEN_SESSION_KEY = "sportsdb-home-seen-since";

export type StoreLike = Pick<Storage, "getItem" | "setItem">;

function read(store: StoreLike | null, key: string): string | null {
  try {
    return store ? store.getItem(key) : null;
  } catch {
    return null;
  }
}

function write(store: StoreLike | null, key: string, value: string): void {
  try {
    store?.setItem(key, value);
  } catch {
    /* private mode or quota: the block still works for this page view */
  }
}

/** A stored instant: a positive whole number of epoch ms that is not in the future (a clock set back would otherwise hide results). */
function instant(raw: string | null, now: number): number | null {
  if (raw === null || !/^\d{1,15}$/.test(raw)) return null;
  const n = Number(raw);
  return n > 0 && n <= now ? n : null;
}

/** Storage that may be missing or throw on access (blocked cookies, some private windows). */
export function safeStorage(kind: "localStorage" | "sessionStorage"): StoreLike | null {
  try {
    return typeof window === "undefined" ? null : window[kind];
  } catch {
    return null;
  }
}

/** The instant (epoch ms) this visit should catch up from, or null on a first visit (or when nothing can be remembered). */
export function sinceForVisit(local: StoreLike | null, session: StoreLike | null, now: number): number | null {
  const fromSession = instant(read(session, SEEN_SESSION_KEY), now);
  const since = fromSession ?? instant(read(local, SEEN_KEY), now);
  // Pinned for the tab session so a reload keeps the same window.
  if (fromSession === null && since !== null) write(session, SEEN_SESSION_KEY, String(since));
  return since;
}

/** Records this visit: the next one catches up from `now`. On a first visit the session is pinned to `now`, so a reload shows nothing. */
export function markVisit(local: StoreLike | null, session: StoreLike | null, now: number): void {
  write(local, SEEN_KEY, String(now));
  if (read(session, SEEN_SESSION_KEY) === null) write(session, SEEN_SESSION_KEY, String(now));
}

/** The teams the setup follows, as the moments route reads them: "epl:arsenal,cricket:6". Empty when it has no team block. */
export function followedTeams(blocks: HomeBlock[]): string {
  return blocks
    .filter((b) => b.type === "team-next" && b.params.league && b.params.team)
    .slice(0, MAX_MOMENT_TEAMS)
    .map((b) => `${b.params.league}:${b.params.team}`)
    .join(",");
}

export function momentsUrl(teams: string, sinceMs: number): string {
  const qs = new URLSearchParams({ teams, since: String(Math.floor(sinceMs / 1000)) });
  return `/api/block/moments?${qs.toString()}`;
}
