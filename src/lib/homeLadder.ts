// The "Start here" ladder: each sport's best pages as plain internal links. Kept apart from homeExplainers.ts because the
// client island imports it, and that module reads server-only code.
import type { SportPick } from "./sportPicks";

export interface LadderPage {
  label: string;
  href: string;
}

/** Each sport's best pages: plain internal links to routes that exist (a test checks every one against src/app). */
export const LADDER: Record<SportPick, LadderPage[]> = {
  cricket: [
    { label: "Series and standings", href: "/cricket/series" },
    { label: "T20 international leaders", href: "/t20i/leaders" },
    { label: "ODI centuries", href: "/odi/centuries" },
  ],
  football: [
    { label: "Premier League table", href: "/epl/standings" },
    { label: "Premier League leaders", href: "/epl/leaders" },
    { label: "Champions League table", href: "/ucl/standings" },
  ],
  nfl: [
    { label: "NFL standings", href: "/nfl/standings" },
    { label: "NFL leaders", href: "/nfl/leaders" },
    { label: "NFL records", href: "/nfl/records" },
  ],
  nba: [
    { label: "NBA standings", href: "/nba/standings" },
    { label: "NBA leaders", href: "/nba/leaders" },
    { label: "NBA records", href: "/nba/records" },
  ],
  mlb: [
    { label: "MLB standings", href: "/mlb/standings" },
    { label: "MLB leaders", href: "/mlb/leaders" },
    { label: "MLB records", href: "/mlb/records" },
  ],
  tennis: [
    { label: "Tennis scores", href: "/tennis" },
    { label: "ATP rankings", href: "/tennis/atp/rankings" },
    { label: "Tournaments", href: "/tennis/tournaments" },
  ],
  f1: [
    { label: "Race calendar and results", href: "/f1" },
    { label: "Championship standings", href: "/f1/standings" },
  ],
};
