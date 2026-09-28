import { gameDayIso, gameStartDateIso } from "./gameDay";
import { isCricketLeague, isSoccerLeague } from "./leagues";
import type { CricketTeamScorecard } from "./matchDetail";
import { isTimeTbd, schemaEventStatus, schemaStatusForLabel } from "./gameStatus";
import { f1EventDescription, f1EventStatus } from "./f1Status";
import type { F1EventRow } from "./f1";
import { scoreLineSides } from "./gamePage";
import { cricketSchemaStatus } from "./cricketMatchStatus";
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
    logo: absoluteUrl("/logo-512.png"),
    email: CONTACT_EMAIL,
    contactPoint: { "@type": "ContactPoint", contactType: "customer support", email: CONTACT_EMAIL, url: absoluteUrl("/contact") },
  };
}

/** A top-level schema reused as a property of another: the same node, minus the @context only the outermost one carries. */
function nested<T extends { "@context": string }>(schema: T): Omit<T, "@context"> {
  const rest: Partial<T> = { ...schema };
  delete rest["@context"];
  return rest as Omit<T, "@context">;
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

/**
 * A ground, with an address only when one is passed. Text would be valid for schema.org, but a
 * PostalAddress is what a consumer can actually parse, and it carries the region and country the
 * database holds alongside the city.
 */
function place(name: string, address: ReturnType<typeof postalAddress>) {
  return { "@type": "Place", name, ...(address ? { address } : {}) };
}

function postalAddress(v: { venue_city?: string | null; venue_state?: string | null; venue_country?: string | null }) {
  if (!v.venue_city) return null;
  return {
    "@type": "PostalAddress",
    addressLocality: v.venue_city,
    ...(v.venue_state ? { addressRegion: v.venue_state } : {}),
    ...(v.venue_country ? { addressCountry: v.venue_country } : {}),
  };
}

export function teamSchema(league: League, team: { name: string; slug: string; logo_url: string | null; venue_name?: string | null; venue_city?: string | null; venue_state?: string | null; venue_country?: string | null }) {
  return {
    "@context": "https://schema.org",
    "@type": "SportsTeam",
    name: team.name,
    sport: sportName(league),
    memberOf: { "@type": "SportsOrganization", name: LEAGUE_LABEL[league] },
    url: absoluteUrl(`/${league}/teams/${team.slug}`),
    ...(team.logo_url ? { logo: team.logo_url } : {}),
    ...(team.venue_name ? { location: place(team.venue_name, postalAddress(team)) } : {}),
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

/** A tennis player (their page is /tennis/<tour>/players/<slug>). No nationality: the site stores a country code, and schema.org wants a name. */
export function tennisPlayerSchema(tour: string, player: { name: string; slug: string; headshot_url: string | null }) {
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: player.name,
    url: absoluteUrl(`/tennis/${tour}/players/${player.slug}`),
    jobTitle: "Tennis player",
    ...(player.headshot_url ? { image: player.headshot_url } : {}),
  };
}

export function blogPostingSchema(article: { slug: string; title: string; dek: string; publishedAt: string }) {
  const url = absoluteUrl(`/beyond-the-scoreline/${article.slug}`);
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: article.title,
    description: article.dek,
    datePublished: article.publishedAt,
    url,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    // The site's own share card. An article's art is a palette and a numeral drawn in CSS, not a
    // photograph, so there is no per-article picture; this is the image its og:image already serves.
    image: absoluteUrl("/opengraph-image"),
    // No dateModified: nothing records when an article was last edited, and datePublished would
    // be a lie dressed as an update.
    author: { "@type": "Organization", name: "Beyond the Scoreline Desk", url: absoluteUrl("/beyond-the-scoreline") },
    // Nested, so without the @context that only the outermost node needs.
    publisher: nested(organizationSchema()),
  };
}

/**
 * The description of a finished game. Cricket says "Result: <result text>. <first side> <score>, <second side> <score>."
 * with the batting-first side first (from the scorecard when the page has one, else the score lines, else away first);
 * every other sport says "Final score: ...", football with its home side first and the NBA and NFL with the visitors,
 * the same order their score lines use (scoreLineSides).
 */
function finishedDescription(league: League, game: GameRow, scorecard?: CricketTeamScorecard[] | null): string {
  const line = { home: `${game.home_name} ${game.home_score_display ?? game.home_score}`, away: `${game.away_name} ${game.away_score_display ?? game.away_score}` };
  const [first, second] = scoreLineSides(league, game, scorecard);
  if (!isCricketLeague(league)) return `Final score: ${line[first]}, ${line[second]}.`;
  return `Result: ${game.status_summary ? `${game.status_summary}. ` : ""}${line[first]}, ${line[second]}.`;
}

/**
 * Where a match was played, with a street-level address only when we can prove the address belongs
 * to that venue: the ground we are naming has to be the home club's own, and the match must not have
 * been moved to neutral ground. A club's city is a fact about the club, not about every fixture it
 * plays, so a Mexico City or Wembley game gets the venue's name and nothing else.
 */
function eventLocation(game: GameRow, venue: string) {
  const sameGround = (a?: string | null, b?: string | null) =>
    !!a && !!b && a.trim().toLowerCase().replace(/\s+/g, " ") === b.trim().toLowerCase().replace(/\s+/g, " ");
  const atHomeGround = game.neutral_site !== true && sameGround(game.home_venue_name, venue);
  return place(venue, atHomeGround ? postalAddress({ venue_city: game.home_venue_city, venue_state: game.home_venue_state, venue_country: game.home_venue_country }) : null);
}

/**
 * What a match that is not a finished result can say about itself: the fixture, where it is being
 * played, and the feed's own word on its state ("Postponed", "Stumps - Day 2"). Google asks every
 * Event for a description; a fixture that has not been played has no score to give it one.
 */
function fixtureDescription(league: League, matchup: string, venue: string | null | undefined, game: GameRow): string {
  const summary = game.status_summary ? ` ${game.status_summary}.` : "";
  return `${LEAGUE_LABEL[league]}: ${matchup}${venue ? `, ${venue}` : ""}.${summary}`;
}

/**
 * The last day of a match that ran past its first — a Test, or any cricket match spread over days
 * (games.end_date, parsed at ingest). Every other sport is played and finished inside a day and
 * stores no end at all, so nothing is claimed for it: a kickoff plus a guessed duration would be
 * a false claim, the same reason a fixture with no known time carries only its day.
 */
function eventEndDate(game: GameRow, startDate: string): string | null {
  if (!game.end_date) return null;
  return game.end_date === (game.local_date ?? startDate.slice(0, 10)) ? null : game.end_date;
}

export function gameSchema(league: League, game: GameRow, venue?: string | null, scorecard?: CricketTeamScorecard[] | null) {
  const status = schemaEventStatus(game);
  const team = (name: string, slug: string, logo: string | null) => ({
    "@type": "SportsTeam",
    name,
    url: absoluteUrl(`/${league}/teams/${slug}`),
    ...(logo ? { logo } : {}),
  });
  // American sports say "Away at Home"; football and cricket list the home side first.
  const matchup = league === "nfl" || league === "nba" ? `${game.away_name} at ${game.home_name}` : `${game.home_name} ${isSoccerLeague(league) ? "vs" : "v"} ${game.away_name}`;
  // A fixture with no kickoff time yet carries its day only; a placeholder clock time would be a false claim.
  const startDate = isTimeTbd(game) ? gameDayIso(game.date, league) : gameStartDateIso(game.date, league);
  const endDate = eventEndDate(game, startDate);
  const sides = [team(game.home_name, game.home_slug, game.home_logo), team(game.away_name, game.away_slug, game.away_logo)];
  return {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name: matchup,
    sport: sportName(league),
    startDate,
    ...(endDate ? { endDate } : {}),
    eventStatus: status,
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    url: absoluteUrl(`/${league}/games/${game.espn_id}`),
    // The page's own share card: the two badges, the score and the status, drawn for this match.
    image: absoluteUrl(`/${league}/games/${game.espn_id}/opengraph-image`),
    homeTeam: sides[0],
    awayTeam: sides[1],
    competitor: sides,
    // The two sides are both the competitors and, in Google's Event vocabulary, the performers.
    performer: sides,
    organizer: { "@type": "SportsOrganization", name: LEAGUE_LABEL[league], url: absoluteUrl(`/${league}`) },
    ...(venue ? { location: eventLocation(game, venue) } : {}),
    description: game.completed && game.home_score != null && game.away_score != null
      ? finishedDescription(league, game, scorecard)
      : fixtureDescription(league, matchup, venue, game),
    // No `offers`. Search Console asks for one because its Event type is built for ticketed
    // entertainment; we sell no tickets and hold no ticket URLs, so any value here would be
    // invented. The warning stays open on purpose — see tests/structured-data.test.ts.
  };
}

function sportName(league: League): string {
  if (league === "nfl") return "American football";
  if (league === "nba") return "Basketball";
  if (isSoccerLeague(league)) return "Soccer";
  return "Cricket";
}

/**
 * `f1_events.date` and `.end_date` come back from pg as Date objects: f1.ts's EVENT_SELECT reads those
 * columns raw, where the game queries cast theirs (`g.end_date::text`). The row type says `string`, so
 * nothing at the call site warns about it, and `.slice()` on a Date throws. Accept either shape.
 */
function isoInstant(value: string | Date): string {
  return typeof value === "string" ? value : value.toISOString();
}

/**
 * A Formula 1 race weekend. Not a single race: the page covers every session, so the event runs from
 * the first practice to the chequered flag, and `end_date` says so honestly instead of a guess. The
 * circuit is a fixed address, which is why this one always carries its city and country.
 * No competitors: a Grand Prix has twenty of them, and the classification on the page is the place
 * to read them, not a list repeated in the head of every weekend's markup.
 */
export function f1EventSchema(event: F1EventRow) {
  const year = event.season_year ?? new Date(event.date).getUTCFullYear();
  const where = event.circuit_name ? ` at ${event.circuit_name}` : "";
  const status = f1EventStatus(event);
  const startDate = isoInstant(event.date);
  const endDate = event.end_date == null ? null : isoInstant(event.end_date);
  const sameDay = !endDate || endDate.slice(0, 10) === startDate.slice(0, 10);
  return {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name: `${year} ${event.name}`,
    sport: "Formula 1",
    startDate,
    ...(sameDay ? {} : { endDate }),
    eventStatus: schemaStatusForLabel(status.kind === "called-off" ? status.label : null),
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    url: absoluteUrl(`/f1/events/${event.espn_id}`),
    ...(event.circuit_name
      ? { location: place(event.circuit_name, postalAddress({ venue_city: event.circuit_city, venue_country: event.circuit_country })) }
      : {}),
    organizer: { "@type": "SportsOrganization", name: "Formula 1", url: absoluteUrl("/f1") },
    description: f1EventDescription(event, year, where),
  };
}

/** A cricket match from the series listing (no SportsDB team pages to link). */
export function cricketSeriesMatchSchema(m: {
  espn_id: string;
  name: string;
  date: string;
  series_espn_id: string;
  series_name: string;
  status_summary: string | null;
  status_state: string | null;
  home: { name: string; logo: string | null } | null;
  away: { name: string; logo: string | null } | null;
}, venue?: string | null) {
  const team = (t: { name: string; logo: string | null } | null) => (t ? { "@type": "SportsTeam", name: t.name, ...(t.logo ? { logo: t.logo } : {}) } : undefined);
  const sides = [team(m.home), team(m.away)].filter(Boolean);
  return {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name: m.name,
    sport: "Cricket",
    startDate: m.date,
    eventStatus: cricketSchemaStatus(m),
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    url: absoluteUrl(`/cricket/matches/${m.espn_id}`),
    ...(m.home ? { homeTeam: team(m.home) } : {}),
    ...(m.away ? { awayTeam: team(m.away) } : {}),
    competitor: sides,
    performer: sides,
    organizer: { "@type": "SportsOrganization", name: m.series_name, url: absoluteUrl(`/cricket/series/${m.series_espn_id}`) },
    // No address: a series match names the ground from the live summary, and cricket's team
    // endpoints carry no venue of their own, so there is no city to attach to it. No image
    // either — this route has no share card to point at. And no `offers`, for the same reason
    // a game page has none: we sell no tickets.
    ...(venue ? { location: { "@type": "Place", name: venue } } : {}),
    description: m.status_state === "post" && m.status_summary ? m.status_summary : `${m.series_name}: ${m.name}.`,
  };
}
