// The "this season" links at the foot of a game page. Cricket internationals have no table, so
// their standings link 404ed on every game page (about 440 Googlebot hits, Search Console 2026-10-07).
import { formatSeasonLabel, hasStandings, LEAGUE_LABEL, type League } from "./leagues";
import { supportsMatchweeks, weekIndexPath, weekNoun } from "./matchweeks";
import type { RelatedLink } from "./related";

export function gameSeasonLinks(league: League, season: number | null): RelatedLink[] {
  const label = season ? formatSeasonLabel(league, season) : null;
  return [
    ...(season && hasStandings(league) ? [{ href: `/${league}/standings/${season}`, label: `${label} standings` }] : []),
    ...(season && supportsMatchweeks(league) ? [{ href: weekIndexPath(league, season), label: `Every ${weekNoun(league).toLowerCase()} of ${label}` }] : []),
    { href: `/${league}/leaders`, label: `${LEAGUE_LABEL[league]} leaders` },
  ];
}
