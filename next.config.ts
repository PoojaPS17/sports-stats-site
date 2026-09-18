import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
    ];
  },
};

export default nextConfig;
