// iCalendar (.ics) feeds built from the games archive, so fans can subscribe to a
// team's or a league's fixtures in Apple Calendar, Google Calendar or Outlook.
import { pool } from "./db";
import { GAME_SELECT, LEAGUE_LABEL, type GameRow } from "./queries";
import { isCricketLeague, type League } from "./leagues";
import { getF1Calendar, getF1Seasons } from "./f1";
import { isSoccer } from "./analytics";
import { SITE_URL } from "./site";
import { gameCalledOffLabel } from "./gameStatus";

const SITE = SITE_URL;
const PRODID = "-//SportsDB//Fixtures//EN";

/* ------------------------------------------------------------------------ */
/* iCalendar formatting                                                      */
/* ------------------------------------------------------------------------ */

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** UTC timestamp in iCalendar basic format: 20260919T140000Z */
export function icsDate(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

/** All-day date: 20260919 */
function icsDay(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
}

export function icsEscape(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

// RFC 5545: lines longer than 75 octets are folded with CRLF + one space.
function fold(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let i = 0;
  let first = true;
  while (i < bytes.length) {
    const max = first ? 75 : 74;
    let end = Math.min(i + max, bytes.length);
    // Don't split a multi-byte UTF-8 sequence.
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    out.push((first ? "" : " ") + bytes.subarray(i, end).toString("utf8"));
    i = end;
    first = false;
  }
  return out.join("\r\n");
}

export interface IcsEvent {
  uid: string;
  start: Date;
  /** Either an end time or an all-day flag. */
  end?: Date;
  allDay?: boolean;
  summary: string;
  description?: string;
  location?: string;
  url?: string;
  /** Bumped when the event's details change so calendar apps refresh it. */
  sequence?: number;
  status?: "CONFIRMED" | "TENTATIVE" | "CANCELLED";
  lastModified?: Date;
}

export function buildIcs(name: string, description: string, events: IcsEvent[], refreshHours = 6): string {
  const now = icsDate(new Date());
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODID}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsEscape(name)}`,
    `X-WR-CALDESC:${icsEscape(description)}`,
    `REFRESH-INTERVAL;VALUE=DURATION:PT${refreshHours}H`,
    `X-PUBLISHED-TTL:PT${refreshHours}H`,
  ];
  for (const e of events) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${e.uid}`);
    lines.push(`DTSTAMP:${now}`);
    if (e.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${icsDay(e.start)}`);
      const end = e.end ?? new Date(e.start.getTime() + 86_400_000);
      lines.push(`DTEND;VALUE=DATE:${icsDay(end)}`);
    } else {
      lines.push(`DTSTART:${icsDate(e.start)}`);
      lines.push(`DTEND:${icsDate(e.end ?? new Date(e.start.getTime() + 2 * 3_600_000))}`);
    }
    lines.push(`SUMMARY:${icsEscape(e.summary)}`);
    if (e.description) lines.push(`DESCRIPTION:${icsEscape(e.description)}`);
    if (e.location) lines.push(`LOCATION:${icsEscape(e.location)}`);
    if (e.url) lines.push(`URL:${e.url}`);
    if (e.sequence != null) lines.push(`SEQUENCE:${e.sequence}`);
    if (e.lastModified) lines.push(`LAST-MODIFIED:${icsDate(e.lastModified)}`);
    lines.push(`STATUS:${e.status ?? "CONFIRMED"}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

/* ------------------------------------------------------------------------ */
/* Games → events                                                            */
/* ------------------------------------------------------------------------ */

// Typical duration per sport, used for the calendar block.
function durationMinutes(league: League): number {
  if (isSoccer(league)) return 115;
  if (league === "nfl") return 195;
  if (league === "nba") return 150;
  if (isCricketLeague(league)) return 210;
  return 120;
}

interface GameWithVenue extends GameRow {
  venue_name?: string | null;
  venue_city?: string | null;
  updated_at?: string | null;
}

function gameSummary(league: League, g: GameWithVenue, perspectiveTeamId?: string): string {
  const soccer = isSoccer(league);
  if (g.completed && g.home_score != null && g.away_score != null) {
    const h = g.home_score_display ?? String(g.home_score);
    const a = g.away_score_display ?? String(g.away_score);
    return soccer ? `${g.home_name} ${h}–${a} ${g.away_name}` : `${g.away_name} ${a} @ ${g.home_name} ${h}`;
  }
  if (perspectiveTeamId) {
    const home = g.home_team_espn_id === perspectiveTeamId;
    return home ? `${g.home_name} vs ${g.away_name}` : `${g.away_name} at ${g.home_name}`;
  }
  return soccer ? `${g.home_name} vs ${g.away_name}` : `${g.away_name} at ${g.home_name}`;
}

export function gameEvent(league: League, g: GameWithVenue, perspectiveTeamId?: string): IcsEvent {
  const start = new Date(g.date);
  const end = new Date(start.getTime() + durationMinutes(league) * 60_000);
  const label = LEAGUE_LABEL[league];
  const parts = [label];
  if (g.round) parts.push(g.round);
  // A postponed or cancelled game stays in the archive as its original event; the replay has its own uid. Mark it
  // cancelled so a subscriber's calendar does not keep a fixture that is not happening.
  const off = gameCalledOffLabel(g);
  if (off) parts.push(off);
  else if (g.completed) parts.push(`Final${g.status_summary ? `: ${g.status_summary}` : ""}`);
  else if (g.status_state === "in") parts.push("In progress");
  parts.push(`Match page: ${SITE}/${league}/games/${g.espn_id}`);
  const location = g.venue_name ? [g.venue_name, g.venue_city].filter(Boolean).join(", ") : undefined;
  return {
    uid: `${league}-${g.espn_id}@sportsdb`,
    start,
    end,
    summary: off ? `${gameSummary(league, g, perspectiveTeamId)} (${off})` : gameSummary(league, g, perspectiveTeamId),
    description: parts.join("\n"),
    location,
    url: `${SITE}/${league}/games/${g.espn_id}`,
    // The summary changes when the score lands, so bump the sequence on completion
    // and let calendar apps pick the update up on their next refresh.
    sequence: g.completed || off ? 1 : 0,
    ...(off ? { status: "CANCELLED" as const } : {}),
    lastModified: g.updated_at ? new Date(g.updated_at) : undefined,
  };
}

const GAME_WITH_VENUE_SELECT = `${GAME_SELECT.replace("from games g", ", ht.venue_name, ht.venue_city, g.updated_at\n  from games g")}`;

/* ------------------------------------------------------------------------ */
/* Feeds                                                                     */
/* ------------------------------------------------------------------------ */

export interface Feed {
  filename: string;
  ics: string;
}

/** A team's full current-season schedule, results included. */
export async function buildTeamFeed(league: League, slug: string): Promise<Feed | null> {
  const { rows: teams } = await pool.query(`select espn_id, name from teams where league = $1 and slug = $2`, [league, slug]);
  const team = teams[0];
  if (!team) return null;
  const { rows: seasons } = await pool.query(
    `select max(season_year) as season from games where league = $1 and (home_team_espn_id = $2 or away_team_espn_id = $2)`,
    [league, team.espn_id]
  );
  const season = seasons[0]?.season as number | null;
  if (!season) return null;
  const { rows: games } = await pool.query<GameWithVenue>(
    `${GAME_WITH_VENUE_SELECT}
     where g.league = $1 and g.season_year = $2 and (g.home_team_espn_id = $3 or g.away_team_espn_id = $3)
     order by g.date asc`,
    [league, season, team.espn_id]
  );
  const label = LEAGUE_LABEL[league];
  return {
    filename: `${slug}-${league}.ics`,
    ics: buildIcs(
      `${team.name} (${label})`,
      `${team.name} ${label} fixtures and results from SportsDB. Scores appear in the event title once a game finishes.`,
      games.map((g) => gameEvent(league, g, team.espn_id))
    ),
  };
}

/** Every league game from the last two weeks onward, so the feed stays a sane size. */
export async function buildLeagueFeed(league: League): Promise<Feed | null> {
  const { rows: games } = await pool.query<GameWithVenue>(
    `${GAME_WITH_VENUE_SELECT}
     where g.league = $1 and g.date > now() - interval '14 days'
     order by g.date asc`,
    [league]
  );
  const label = LEAGUE_LABEL[league];
  return {
    filename: `${league}-fixtures.ics`,
    ics: buildIcs(`${label} fixtures`, `All ${label} fixtures and recent results from SportsDB, refreshed automatically.`, games.map((g) => gameEvent(league, g))),
  };
}

/** Formula 1 race weekends as all-day events. */
export async function buildF1Feed(): Promise<Feed | null> {
  const seasons = await getF1Seasons();
  const season = seasons[0];
  if (!season) return null;
  const events = await getF1Calendar(season);
  return {
    filename: `f1-${season}.ics`,
    ics: buildIcs(
      `Formula 1 ${season}`,
      "Formula 1 race weekends from SportsDB.",
      events.map((e) => {
        const start = new Date(e.date);
        // Race weekends run Friday to Sunday; the feed stores the race day, so the
        // event spans the two days leading up to it.
        const weekendStart = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() - 2));
        const end = e.end_date ? new Date(e.end_date) : start;
        const endExclusive = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate() + 1));
        const where = [e.circuit_name, e.circuit_city, e.circuit_country].filter(Boolean).join(", ");
        return {
          uid: `f1-${e.espn_id}@sportsdb`,
          start: weekendStart,
          end: endExclusive,
          allDay: true,
          summary: e.winner_name ? `${e.name} · Winner: ${e.winner_name}` : e.name,
          description: [where, `Event page: ${SITE}/f1/events/${e.espn_id}`].filter(Boolean).join("\n"),
          location: where || undefined,
          url: `${SITE}/f1/events/${e.espn_id}`,
          sequence: e.winner_name ? 1 : 0,
        } satisfies IcsEvent;
      })
    ),
  };
}
