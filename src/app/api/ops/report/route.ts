// Aggregate data checks for the Ops Room agents, read over HTTPS through the edge because the
// database only accepts connections from the VM. Cached at the edge for fifteen minutes: the
// duplicate and integrity scans read whole tables, and nobody needs them fresher than that.
import { pool } from "@/lib/db";
import { opsReport } from "@/lib/opsReport";

export const dynamic = "force-dynamic";

export async function GET() {
  const report = await opsReport(pool);
  return Response.json(report, {
    headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=60" },
  });
}
