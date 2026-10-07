import { decodeFollows } from "@/lib/followShare";
import { buildFollowsFeed, feedResponse } from "@/lib/ics";

export const revalidate = 1800;

// GET /calendar/follows?f=<packed follows> → one calendar for the teams and matches in a My follows link
// (see lib/followShare.ts). The list rides in the address because there are no accounts: subscribing to
// the address is what keeps a phone's calendar current.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const items = decodeFollows(url.searchParams.get("f"));
  return feedResponse(await buildFollowsFeed(items), url.searchParams.get("download") === "1");
}
