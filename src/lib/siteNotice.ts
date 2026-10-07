// One dated notice shown above every page, for a known data gap visitors would otherwise read as a bug
// ("Soccer scores are paused for the international break"). Set it, merge, and the auto-deploy puts it
// live; set it back to null when the gap closes. `until` hides it on its own after that day (UTC).
export interface SiteNotice {
  text: string;
  /** ISO date the notice was written; shown with it so a stale notice is obvious. */
  since: string;
  /** ISO date after which the notice is no longer shown. */
  until?: string;
  /** Optional page that explains more, e.g. "/methodology#gaps". */
  href?: string;
}

export const SITE_NOTICE: SiteNotice | null = null;

export function activeNotice(notice: SiteNotice | null, now: Date = new Date()): SiteNotice | null {
  if (!notice) return null;
  if (notice.until && now.getTime() > Date.parse(`${notice.until}T23:59:59Z`)) return null;
  return notice;
}
