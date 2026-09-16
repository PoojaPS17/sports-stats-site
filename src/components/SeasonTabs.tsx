import Link from "next/link";
import { formatSeasonLabel, type League } from "@/lib/queries";

// Year-by-year toggle used on team and standings pages. The most recent season links
// back to the base (no-season) URL so that stays the canonical "current" page; every
// other season gets its own indexable `/season` sub-page.
export function SeasonTabs({
  league,
  basePath,
  seasons,
  activeSeason,
}: {
  league: League;
  basePath: string;
  seasons: number[];
  activeSeason: number | null;
}) {
  if (seasons.length <= 1) return null;
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1">
      {seasons.map((season, i) => {
        const active = season === activeSeason;
        const href = i === 0 ? basePath : `${basePath}/${season}`;
        return (
          <Link
            key={season}
            href={href}
            className={`nav-pill shrink-0 text-sm ${active ? "nav-pill-active" : "text-[var(--text-muted)]"}`}
          >
            {formatSeasonLabel(league, season)}
          </Link>
        );
      })}
    </div>
  );
}
