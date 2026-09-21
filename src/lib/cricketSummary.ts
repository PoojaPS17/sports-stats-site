/* eslint-disable @typescript-eslint/no-explicit-any -- raw ESPN JSON, same as the scrapers */
// Reading one cricket match summary from ESPN robustly. Shared by the scraper scripts and
// the match page's live fallback, so both survive the same two ESPN failure modes:
//
//  - Its edge answers a slice of requests with a 502/504 whose body is still parseable JSON:
//    {"code":2502,"detail":"http error: bad gateway"}. A caller that trusts any parseable
//    body (scripts/lib/espn.ts getJson does, on purpose, for other sports) reads that as a
//    summary with no players and, for a backfill, counts the match done and writes nothing.
//  - A summary for a past match is served half-hydrated (header without a scorecard) or
//    with no competitors under one competition id and complete under another; ESPN's IPL id
//    (8048) resolves any cricket event.
//
// Pure: no database, no network of its own. The caller supplies `fetchJson`.

/** Competition path that serves every cricket event's summary in full (the IPL's). */
export const CRICKET_FALLBACK_PATH = "cricket/8048";

/** A body is a match summary when it carries the match header or the squads; an error body carries neither. */
export function isCricketSummary(body: unknown): boolean {
  if (body == null || typeof body !== "object") return false;
  const b = body as any;
  return Boolean(b.header && typeof b.header === "object") || Array.isArray(b.rosters);
}

/** Why a body is not a summary, for the log line. */
export function whyNotCricketSummary(body: unknown): string {
  if (body == null || typeof body !== "object") return "response is not a JSON object";
  const b = body as any;
  if (b.code != null || b.detail != null) return `ESPN error body (code ${b.code ?? "?"}: ${String(b.detail ?? "no detail").slice(0, 120)})`;
  return `no match header or rosters in response (${JSON.stringify(body).slice(0, 100)})`;
}

export interface CricketSummaryOptions {
  /** Retries per path after the first attempt (default 2). */
  retries?: number;
  /** First backoff in ms, doubling each retry (default 500). */
  backoffMs?: number;
  /** A body that is structurally a summary but not good enough (e.g. no scorecard) is tried on the next path; the best such body is returned when no path does better. */
  accept?: (summary: any) => boolean;
  /** Where the final failure is logged (default console.error). */
  log?: (message: string) => void;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The paths to try, in order: the competition's own, then the IPL's, without repeats. */
export function cricketSummaryPaths(primary: string | undefined): string[] {
  return [...new Set([primary, CRICKET_FALLBACK_PATH].filter((p): p is string => Boolean(p)))];
}

/**
 * Fetches a cricket summary, trying each path (`retries` retries each, with backoff) until
 * one returns a real summary. An error-shaped body is a failure, never a summary. Throws,
 * after logging the event id and the last reason, when no path gives one.
 */
export async function fetchCricketSummaryVia(
  fetchJson: (path: string) => Promise<unknown>,
  eventId: string,
  paths: string[],
  options: CricketSummaryOptions = {}
): Promise<any> {
  const retries = options.retries ?? 2;
  const backoffMs = options.backoffMs ?? 500;
  const log = options.log ?? ((m: string) => console.error(m));
  let lastReason = "no path tried";
  let bestStructural: any = null;
  for (const path of paths) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (attempt > 0) await sleep(backoffMs * 2 ** (attempt - 1));
      try {
        const body = await fetchJson(path);
        if (!isCricketSummary(body)) {
          lastReason = `${path}: ${whyNotCricketSummary(body)}`;
          continue;
        }
        if (!options.accept || options.accept(body)) return body;
        // A real summary that lacks what the caller needs: the same path will not change its mind soon; try the next path.
        bestStructural ??= body;
        lastReason = `${path}: summary has no usable scorecard`;
        break;
      } catch (err) {
        lastReason = `${path}: ${err instanceof Error ? err.message : String(err)}`;
      }
    }
  }
  if (bestStructural) return bestStructural;
  log(`[espn] cricket summary ${eventId} failed after ${paths.length} path(s): ${lastReason}`);
  throw new Error(`cricket summary ${eventId} unavailable: ${lastReason}`);
}
