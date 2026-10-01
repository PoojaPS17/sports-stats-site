// One homepage block. The URL fully describes it (type and parameters), so the edge
// caches one copy per distinct block for every visitor who has it; the lifetime is the
// block type's (lib/blockParams.ts). Bad input is a 400; an entity that no longer exists
// is `{ block: null }` with the same cache header, which the client shows as an empty block.
import { NextResponse } from "next/server";
import { cacheHeader, isBlockType, validateBlockParams } from "@/lib/blockParams";
import { loadBlock } from "@/lib/blockLoaders";

export const dynamic = "force-dynamic";

// A plain Request (not NextRequest) so the handler is callable from a test without the Next runtime.
export async function GET(req: Request, ctx: { params: Promise<{ type: string }> }) {
  const { type } = await ctx.params;
  if (!isBlockType(type)) return NextResponse.json({ error: "unknown block type" }, { status: 400 });
  const check = validateBlockParams(type, Object.fromEntries(new URL(req.url).searchParams.entries()));
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });
  const block = await loadBlock(type, check.params);
  return NextResponse.json({ block, fetchedAt: new Date().toISOString() }, { headers: { "Cache-Control": cacheHeader(type) } });
}
