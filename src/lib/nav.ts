// Single source of truth for the site's primary navigation. Used by the desktop
// header, the mobile drawer and the footer so the three never drift apart.
// Pure constants only — this is imported from Client Components, so it must not
// pull in anything that touches the database.
import { CRICKET_LEAGUES, SOCCER_LEAGUES, LEAGUE_LABEL } from "./leagues";
import { TOURS, TOUR_LABEL } from "./tennisTours";

export interface NavChild {
  label: string;
  href: string;
}

export interface NavItem {
  label: string;
  /** Direct link for simple items; omitted for dropdown groups. */
  href?: string;
  children?: NavChild[];
}

export const NAV_ITEMS: NavItem[] = [
  {
    label: "Football",
    children: SOCCER_LEAGUES.map((l) => ({ label: LEAGUE_LABEL[l], href: `/${l}` })),
  },
  { label: "NFL", href: "/nfl" },
  { label: "NBA", href: "/nba" },
  {
    label: "Cricket",
    children: [{ label: "All series & live", href: "/cricket/series" }, ...CRICKET_LEAGUES.map((l) => ({ label: LEAGUE_LABEL[l], href: `/${l}` }))],
  },
  {
    label: "Tennis",
    children: [
      { label: "Scores", href: "/tennis" },
      { label: "Calendar", href: "/tennis/tournaments" },
      ...TOURS.map((t) => ({ label: `${TOUR_LABEL[t]} rankings`, href: `/tennis/${t}/rankings` })),
    ],
  },
  { label: "F1", href: "/f1" },
  { label: "Top Games", href: "/top-games" },
];

/** True when `pathname` is inside the section rooted at `href` (exact or a sub-path). */
export function isPathActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function isNavItemActive(pathname: string | null, item: NavItem): boolean {
  if (item.href) return isPathActive(pathname, item.href);
  return (item.children ?? []).some((c) => isPathActive(pathname, c.href));
}
