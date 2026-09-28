// Aggregate data checks for the Ops Room agents, read over HTTPS through the edge because the
// database only accepts connections from the VM. Cached at the edge for fifteen minutes: the
// duplicate and integrity scans read whole tables, and nobody needs them fresher than that.
import { pool } from "@/lib/db";
import { opsReport, type OpsReport } from "@/lib/opsReport";

export const dynamic = "force-dynamic";

/** How long one computed report is reused, whatever the request asked for. */
const MEMO_MS = 15 * 60 * 1000;

// Cloudflare's cache key includes the query string, so `?x=1`, `?x=2`, ... all miss the edge and
// arrive here. The route reads nothing from the request, so it answers all of them from one memo:
// at most one computation per quarter hour, and a request that lands while a computation is still
// running shares that promise instead of starting a second scan of the same tables.
let memo: { at: number; promise: Promise<OpsReport> } | null = null;
const live = () => opsReport(pool);
let compute: () => Promise<OpsReport> = live;

/** Test seam: forget the memo, and optionally stand a stub in for the database work. */
export function resetOpsReportMemo(next?: () => Promise<OpsReport>): void {
  memo = null;
  compute = next ?? live;
}

export async function GET(request: Request) {
  // Read on purpose and then ignored: the answer is the same for every request, query string and
  // all, which is what makes the memo below a cap rather than a suggestion.
  void request;
  const now = Date.now();
  if (!memo || now - memo.at >= MEMO_MS) {
    const started: { at: number; promise: Promise<OpsReport> } = { at: now, promise: compute() };
    // A computation that rejects must not be handed to every caller for the next fifteen minutes,
    // and the handler also keeps the rejection from being an unhandled one.
    started.promise.catch(() => {
      if (memo === started) memo = null;
    });
    memo = started;
  }
  const report = await memo.promise;
  return Response.json(report, {
    headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=60" },
  });
}
