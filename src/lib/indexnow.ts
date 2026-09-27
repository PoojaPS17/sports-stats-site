import { PRIMARY_HOST } from "./launchHost";

// IndexNow notifies Bing, Yandex, Seznam and Naver that a page is new or has changed,
// instead of waiting for those crawlers to find it. Google does not take part, so this
// does nothing for Search Console.
//
// The key is public by design: ownership is proved by serving it back at /<key>.txt on
// this same host, so it belongs here rather than in the host's settings (the measurement
// id in consent.ts is public for the same reason). INDEXNOW_KEY overrides it, and the
// file in public/ has to be renamed to match when it does.
export const INDEXNOW_KEY = process.env.INDEXNOW_KEY || "9f70268fd8d11748d8fe5556147e53ff";
// The scrape scripts run outside the Next build, where SITE_URL falls back to the review
// copy; announcing that host would send Bing vercel.app URLs. IndexNow only ever has
// something to say about the one host that is indexable, so that host is the default.
export const INDEXNOW_ORIGIN = `https://${PRIMARY_HOST}`;
export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
// The protocol's cap. A request carrying more than this is rejected whole.
export const INDEXNOW_MAX_URLS = 10000;

export interface IndexNowBatch {
  host: string;
  key: string;
  keyLocation: string;
  urlList: string[];
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface SubmitOptions {
  origin?: string;
  key?: string;
  fetchImpl?: FetchLike;
  /** How many times a refused batch is re-sent before it is given up on. */
  retries?: number;
  sleepImpl?: (ms: number) => Promise<void>;
}

export interface SubmitResult {
  batches: number;
  submitted: number;
  failed: number;
  /** Why each given-up batch was refused (status code, or the transport error). */
  refusals: string[];
}

// The endpoint throttles a burst: the first bootstrap sent 15 requests back to back and
// had 7 refused. Pace them, and treat a refusal as worth retrying rather than lost.
const PACE_MS = 2000;
const BACKOFF_MS = 5000;

const wait = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

/**
 * Groups URLs into protocol-legal requests. A URL on another host would have the whole
 * request rejected, so it is dropped here rather than sent; duplicates are collapsed
 * because submitting the same page twice buys nothing and counts against the site.
 */
export function indexNowBatches(urls: string[], origin: string = INDEXNOW_ORIGIN, key: string = INDEXNOW_KEY): IndexNowBatch[] {
  const host = new URL(origin).host;
  const unique = new Set<string>();
  for (const raw of urls) {
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      continue;
    }
    if (parsed.host !== host) continue;
    unique.add(parsed.toString());
  }
  const all = [...unique];
  const batches: IndexNowBatch[] = [];
  for (let i = 0; i < all.length; i += INDEXNOW_MAX_URLS) {
    batches.push({ host, key, keyLocation: `${origin}/${key}.txt`, urlList: all.slice(i, i + INDEXNOW_MAX_URLS) });
  }
  return batches;
}

/**
 * Posts the batches and reports what happened. A scrape should not fail because a search
 * engine had a bad minute, so a refusal or a dead connection is counted, never thrown.
 */
export async function submitToIndexNow(urls: string[], opts: SubmitOptions = {}): Promise<SubmitResult> {
  const { origin = INDEXNOW_ORIGIN, key = INDEXNOW_KEY, fetchImpl = fetch as FetchLike, retries = 3, sleepImpl = wait } = opts;
  const batches = indexNowBatches(urls, origin, key);
  let submitted = 0;
  let failed = 0;
  const refusals: string[] = [];
  for (const [index, batch] of batches.entries()) {
    if (index > 0) await sleepImpl(PACE_MS);
    let accepted = false;
    let reason = "no attempt";
    for (let attempt = 0; attempt <= retries && !accepted; attempt++) {
      // Back off further each time: a throttle that just said no needs longer than a pace.
      if (attempt > 0) await sleepImpl(BACKOFF_MS * attempt);
      try {
        const res = await fetchImpl(INDEXNOW_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json; charset=utf-8" },
          body: JSON.stringify(batch),
        });
        if (res.ok) accepted = true;
        else reason = String(res.status);
      } catch (err) {
        reason = err instanceof Error ? err.message : String(err);
      }
    }
    if (accepted) submitted += batch.urlList.length;
    else {
      failed += 1;
      refusals.push(reason);
    }
  }
  return { batches: batches.length, submitted, failed, refusals };
}
