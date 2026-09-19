// Latest results for the header strip. Cached at the edge for a minute, so the
// database sees at most one query a minute per region however many people are browsing.
import { getTicker } from "@/lib/ticker";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await getTicker(), { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } });
}
