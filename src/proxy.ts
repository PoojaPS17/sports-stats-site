import { NextResponse, type NextRequest } from "next/server";
import { PRIMARY_HOST } from "./lib/launchHost";
import { storedMatchIsFinal } from "./lib/cricketMatchCache";

// Only https://sports-db.live is ever indexable. The site's own domain is wired up ahead
// of launch so DNS and the certificate are ready, but it shows a holding page and tells
// crawlers to stay away until SITE_LAUNCHED=1 is set in the app's environment. Every other
// host (the vercel.app review copy, any alias) keeps serving the site for review but is
// marked noindex on every response, and its robots.txt disallows everything, so Google can
// never index a second copy. Local development hosts are left alone.
// To launch: set SITE_LAUNCHED=1 and NEXT_PUBLIC_SITE_URL=https://sports-db.live in the
// app's environment (/opt/sportsdb/repo/.env.production on the VM), then rebuild and restart.
const WWW_HOST = `www.${PRIMARY_HOST}`;
const OWN_DOMAIN = /(^|\.)sports-db\.live$/i;
const DEV_HOST = /^(localhost|127\.0\.0\.1|\[::1\]|.+\.localhost)$/;

// A cricket match that is over is served by its day-cached route; see routeCricketMatch below.
const MATCH_PATH = /^\/cricket\/matches\/(\d+)$/;
const FINAL_MATCH_PATH = /^\/cricket\/matches\/final\/(\d+)$/;

const NOINDEX = "noindex, nofollow";
const ROBOTS_DISALLOW_ALL = "User-agent: *\nDisallow: /\n";

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|icon|apple-icon|opengraph-image).*)"],
};

// The Host header as the proxy sees it (Cloudflare passes the public host through to the
// VM): lower-cased, without a port or a trailing dot. An IPv6 literal keeps its brackets.
function hostOf(request: NextRequest): string {
  const raw = (request.headers.get("host") ?? "").trim().toLowerCase();
  const host = raw.startsWith("[") ? raw.slice(0, raw.indexOf("]") + 1) : raw.split(":")[0];
  return host.replace(/\.$/, "");
}

function robotsDisallowAll(): NextResponse {
  return new NextResponse(ROBOTS_DISALLOW_ALL, {
    headers: { "content-type": "text/plain; charset=utf-8", "x-robots-tag": NOINDEX, "cache-control": "no-store" },
  });
}

/**
 * /cricket/matches/<id> is rendered per request while a match is in play or still to come. Once the
 * stored row says it is over (one indexed read, lib/cricketMatchCache.ts), the request is rewritten
 * to /cricket/matches/final/<id>: the same page, cached for a day at the origin and the edge. The
 * public address never changes; a direct request to the final address is sent back to it. Anything
 * else, and any read failure, falls through to the public route.
 */
async function routeCricketMatch(request: NextRequest): Promise<NextResponse | null> {
  const { pathname } = request.nextUrl;
  const direct = FINAL_MATCH_PATH.exec(pathname);
  if (direct) {
    const url = request.nextUrl.clone();
    url.pathname = `/cricket/matches/${direct[1]}`;
    return NextResponse.redirect(url, 308);
  }
  const match = MATCH_PATH.exec(pathname);
  if (!match || (request.method !== "GET" && request.method !== "HEAD")) return null;
  if (!(await storedMatchIsFinal(match[1]))) return null;
  const url = request.nextUrl.clone();
  url.pathname = `/cricket/matches/final/${match[1]}`;
  return NextResponse.rewrite(url);
}

export default async function proxy(request: NextRequest): Promise<NextResponse> {
  const host = hostOf(request);
  const { pathname, search } = request.nextUrl;

  // www is not a second site: send it to the apex before anything else. The path is set on
  // a URL object rather than resolved against the base, so "//evil.example" stays a path.
  if (host === WWW_HOST) {
    const target = new URL(`https://${PRIMARY_HOST}`);
    target.pathname = pathname;
    target.search = search;
    return NextResponse.redirect(target, 308);
  }

  if (DEV_HOST.test(host)) return (await routeCricketMatch(request)) ?? NextResponse.next();

  // Before launch the site's own domain (apex and any subdomain) shows the holding page.
  if (process.env.SITE_LAUNCHED !== "1" && OWN_DOMAIN.test(host)) {
    if (pathname === "/robots.txt") return robotsDisallowAll();
    const url = request.nextUrl.clone();
    url.pathname = "/coming-soon";
    url.search = "";
    const response = NextResponse.rewrite(url);
    response.headers.set("x-robots-tag", NOINDEX);
    response.headers.set("cache-control", "no-store");
    return response;
  }

  if (host === PRIMARY_HOST) return (await routeCricketMatch(request)) ?? NextResponse.next();

  // Any other host: the page is served as usual but must never be indexed.
  if (pathname === "/robots.txt") return robotsDisallowAll();
  const response = NextResponse.next();
  response.headers.set("x-robots-tag", NOINDEX);
  return response;
}
