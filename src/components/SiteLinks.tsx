import Link from "next/link";
import { LEAGUE_LABEL, SOCCER_LEAGUES } from "@/lib/leagues";

// Where to go from a dead end (the 404 and error pages): home, search, and the front door of every
// sport. Plain links to fixed paths, no data, so it renders even when the database is down.
const SPORT_LINKS: { label: string; href: string }[] = [
  ...SOCCER_LEAGUES.map((l) => ({ label: LEAGUE_LABEL[l], href: `/${l}` })),
  { label: "NFL", href: "/nfl" },
  { label: "NBA", href: "/nba" },
  { label: "Cricket", href: "/cricket/series" },
  { label: "Tennis", href: "/tennis" },
  { label: "F1", href: "/f1" },
];

export function SiteLinks() {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Link href="/" className="nav-pill nav-pill-active">
          Home
        </Link>
        <Link href="/search" className="nav-pill">
          Search teams and players
        </Link>
      </div>
      <ul className="flex flex-wrap items-center justify-center gap-2" aria-label="Browse by sport">
        {SPORT_LINKS.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="nav-pill">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
