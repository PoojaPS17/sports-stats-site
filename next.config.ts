import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A hard five-minute cap on the age of anything a visitor is served. `revalidate` alone is only
  // a refresh trigger: past it Next hands the first visitor the old copy and refreshes behind them,
  // and with the default expire (one year) that copy can be any age at all — measured at 150s old
  // on a page whose revalidate is 10s. `expireTime` is the route's `expire` (server/config.js:1063);
  // once an entry is older than it, server/lib/incremental-cache/index.js:446-449 marks it -1 and
  // server/response-cache/index.js:205-215 refuses to serve it, blocking on a fresh render instead.
  // It applies to every cached route, so no page here may set `revalidate` above it except ones
  // with nothing time-varying to show (a team's venue, a team crest).
  expireTime: 300,
  async redirects() {
    return [
      // The sport's front doors, for typed-in and linked addresses.
      { source: "/cricket", destination: "/cricket/series", permanent: true },
      { source: "/tennis/scores", destination: "/tennis", permanent: true },
    ];
  },
  async rewrites() {
    return [
      // Football uses "matchweek"; the NFL and NBA say "week". Both serve the same
      // route; links are generated with the sport-appropriate word (see weekPath()).
      { source: "/:league/week", destination: "/:league/matchweek" },
      { source: "/:league/week/:path*", destination: "/:league/matchweek/:path*" },
      // The Champions League counts matchdays.
      { source: "/:league/matchday", destination: "/:league/matchweek" },
      { source: "/:league/matchday/:path*", destination: "/:league/matchweek/:path*" },
      // The conventional sitemap address serves the index of the per-section sitemaps
      // (Next's metadata route owns /sitemap/<id>.xml, so the index lives beside it).
      { source: "/sitemap.xml", destination: "/sitemap-index.xml" },
    ];
  },
};

export default nextConfig;
