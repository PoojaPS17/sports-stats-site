import { NextResponse, type NextRequest } from "next/server";

// The site's own domain (sports-db.live) is wired up ahead of launch so DNS and the
// certificate are ready, but it shows a holding page and tells crawlers to stay
// away until SITE_LAUNCHED=1 is set in the Vercel project. The vercel.app alias is
// unaffected and keeps serving the site for review. To launch: set SITE_LAUNCHED=1
// and NEXT_PUBLIC_SITE_URL=https://sports-db.live, then redeploy.
const OWN_DOMAIN = /(^|\.)sports-db\.live$/i;

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|icon|apple-icon|opengraph-image).*)"],
};

export default function proxy(request: NextRequest) {
  const host = (request.headers.get("host") ?? "").split(":")[0];
  if (process.env.SITE_LAUNCHED === "1" || !OWN_DOMAIN.test(host)) return NextResponse.next();

  if (request.nextUrl.pathname === "/robots.txt") {
    return new NextResponse("User-agent: *\nDisallow: /\n", { headers: { "content-type": "text/plain; charset=utf-8", "x-robots-tag": "noindex, nofollow" } });
  }
  const url = request.nextUrl.clone();
  url.pathname = "/coming-soon";
  url.search = "";
  const response = NextResponse.rewrite(url);
  response.headers.set("x-robots-tag", "noindex, nofollow");
  response.headers.set("cache-control", "no-store");
  return response;
}
