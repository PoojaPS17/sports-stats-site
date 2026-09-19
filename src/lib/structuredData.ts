import { isSoccerLeague } from "./leagues";
// schema.org builders for the structured data blocks on key pages.
import { LEAGUE_LABEL, type GameRow, type League } from "./queries";
import { CONTACT_EMAIL, SITE_NAME, SITE_URL, absoluteUrl } from "./site";

export function websiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL,
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/search?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };
}

export function organizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_URL,
    logo: absoluteUrl("/icon.png"),
    email: CONTACT_EMAIL,
    contactPoint: { "@type": "ContactPoint", contactType: "customer support", email: CONTACT_EMAIL, url: absoluteUrl("/contact") },
  };
}

export function breadcrumbSchema(items: { label: string; href?: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [{ label: "Home", href: "/" }, ...items].map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.label,
      ...(item.href ? { item: absoluteUrl(item.href) } : {}),
    })),
  };
}

export function teamSchema(league: League, team: { name: string; slug: string; logo_url: string | null; venue_name?: string | null; venue_city?: string | null }) {
  return {
    "@context": "https://schema.org",
    "@type": "SportsTeam",
    name: team.name,
    sport: sportName(league),
    memberOf: { "@type": "SportsOrganization", name: LEAGUE_LABEL[league] },
    url: absoluteUrl(`/${league}/teams/${team.slug}`),
    ...(team.logo_url ? { logo: team.logo_url } : {}),
    ...(team.venue_name ? { location: { "@type": "Place", name: team.venue_name, ...(team.venue_city ? { address: team.venue_city } : {}) } } : {}),
  };
}

export function athleteSchema(
  league: League,
  player: { name: string; slug: string; headshot_url: string | null; team_name: string | null; team_slug: string | null; height?: string | null; weight?: string | null },
  options: { position?: string | null; description?: string } = {}
) {
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: player.name,
    url: absoluteUrl(`/${league}/players/${player.slug}`),
    ...(options.description ? { description: options.description } : {}),
    ...(options.position ? { jobTitle: options.position } : {}),
    ...(player.height ? { height: player.height } : {}),
    ...(player.weight ? { weight: player.weight } : {}),
    ...(player.headshot_url ? { image: player.headshot_url } : {}),
    ...(player.team_name
      ? { memberOf: { "@type": "SportsTeam", name: player.team_name, ...(player.team_slug ? { url: absoluteUrl(`/${league}/teams/${player.team_slug}`) } : {}) } }
      : {}),
  };
}

export function gameSchema(league: League, game: GameRow, venue?: string | null) {
  // schema.org has no "finished" status; scheduled covers played and in-play games.
  const status = /postponed/i.test(game.status_detail ?? "") ? "https://schema.org/EventPostponed" : /cancel/i.test(game.status_detail ?? "") ? "https://schema.org/EventCancelled" : "https://schema.org/EventScheduled";
  const team = (name: string, slug: string, logo: string | null) => ({
    "@type": "SportsTeam",
    name,
    url: absoluteUrl(`/${league}/teams/${slug}`),
    ...(logo ? { logo } : {}),
  });
  return {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    // American sports say "Away at Home"; football and cricket list the home side first.
    name: league === "nfl" || league === "nba" ? `${game.away_name} at ${game.home_name}` : `${game.home_name} ${isSoccerLeague(league) ? "vs" : "v"} ${game.away_name}`,
    sport: sportName(league),
    startDate: game.date,
    eventStatus: status,
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    url: absoluteUrl(`/${league}/games/${game.espn_id}`),
    homeTeam: team(game.home_name, game.home_slug, game.home_logo),
    awayTeam: team(game.away_name, game.away_slug, game.away_logo),
    competitor: [team(game.home_name, game.home_slug, game.home_logo), team(game.away_name, game.away_slug, game.away_logo)],
    organizer: { "@type": "SportsOrganization", name: LEAGUE_LABEL[league] },
    ...(venue ? { location: { "@type": "Place", name: venue } } : {}),
    ...(game.completed && game.home_score != null && game.away_score != null
      ? { description: `Final score: ${game.away_name} ${game.away_score_display ?? game.away_score}, ${game.home_name} ${game.home_score_display ?? game.home_score}.` }
      : {}),
  };
}

function sportName(league: League): string {
  if (league === "nfl") return "American football";
  if (league === "nba") return "Basketball";
  if (isSoccerLeague(league)) return "Soccer";
  return "Cricket";
}

/** A cricket match from the series listing (no SportsDB team pages to link). */
export function cricketSeriesMatchSchema(m: {
  espn_id: string;
  name: string;
  date: string;
  series_name: string;
  status_summary: string | null;
  status_state: string | null;
  home: { name: string; logo: string | null } | null;
  away: { name: string; logo: string | null } | null;
}, venue?: string | null) {
  const team = (t: { name: string; logo: string | null } | null) => (t ? { "@type": "SportsTeam", name: t.name, ...(t.logo ? { logo: t.logo } : {}) } : undefined);
  return {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name: m.name,
    sport: "Cricket",
    startDate: m.date,
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    url: absoluteUrl(`/cricket/matches/${m.espn_id}`),
    ...(m.home ? { homeTeam: team(m.home) } : {}),
    ...(m.away ? { awayTeam: team(m.away) } : {}),
    competitor: [team(m.home), team(m.away)].filter(Boolean),
    organizer: { "@type": "SportsOrganization", name: m.series_name },
    ...(venue ? { location: { "@type": "Place", name: venue } } : {}),
    ...(m.status_state === "post" && m.status_summary ? { description: m.status_summary } : {}),
  };
}
