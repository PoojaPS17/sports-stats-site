import { isSoccerLeague } from "./leagues";
// schema.org builders for the structured data blocks on key pages.
import { LEAGUE_LABEL, type GameRow, type League } from "./queries";
import { SITE_NAME, SITE_URL, absoluteUrl } from "./site";

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

export function athleteSchema(league: League, player: { name: string; slug: string; headshot_url: string | null; team_name: string | null; team_slug: string | null }) {
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: player.name,
    url: absoluteUrl(`/${league}/players/${player.slug}`),
    ...(player.headshot_url ? { image: player.headshot_url } : {}),
    ...(player.team_name
      ? { memberOf: { "@type": "SportsTeam", name: player.team_name, ...(player.team_slug ? { url: absoluteUrl(`/${league}/teams/${player.team_slug}`) } : {}) } }
      : {}),
  };
}

export function gameSchema(league: League, game: GameRow, venue?: string | null) {
  const status = game.completed ? "https://schema.org/EventScheduled" : game.status_state === "in" ? "https://schema.org/EventScheduled" : "https://schema.org/EventScheduled";
  const team = (name: string, slug: string, logo: string | null) => ({
    "@type": "SportsTeam",
    name,
    url: absoluteUrl(`/${league}/teams/${slug}`),
    ...(logo ? { logo } : {}),
  });
  return {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name: `${game.away_name} at ${game.home_name}`,
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
