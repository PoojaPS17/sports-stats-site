// A scraper-freshness check the watchdog GitHub Actions workflow can hit over HTTPS (through
// Cloudflare) instead of opening a direct connection to the production database. Mirrors
// scripts/check-stale.ts exactly (same table, same MAX_AGE_MINUTES) so the two never disagree
// about what "stale" means; that file remains the one the VM's own hourly job runs internally.
import { pool } from "@/lib/db";
import { findStale } from "../../../../scripts/lib/heartbeat";

export const dynamic = "force-dynamic";

export async function GET() {
  const stale = await findStale(pool);
  const body = {
    ok: stale.length === 0,
    stale: stale.map((s) => ({ scraper: s.scraper, ageMinutes: s.ageMinutes })),
  };
  return Response.json(body, {
    status: stale.length === 0 ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
