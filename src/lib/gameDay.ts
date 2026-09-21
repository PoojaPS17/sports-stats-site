// Which calendar day a game belongs to.
//
// ESPN files a game under its US Eastern date, and so does every scoreboard the NFL and the NBA
// publish. This site filed by the UTC date instead, which put a Sunday-night NFL kickoff (00:20 UTC
// Monday) on Monday, Thursday night football on Friday, and about a third of NBA games (tip-off
// after 8 pm ET) a day late — on the scores-by-date page, in player game logs and on the game page.
// Soccer (epl, laliga, bundesliga, seriea, ucl) matched ESPN on the UTC date on every date checked,
// so everything that is not the NFL or the NBA keeps its UTC day.
//
// Everything that shows or groups by a game's day goes through here, so the same game can never
// appear under two different days on two different pages. This module is pure — it imports no
// database code — so queries and Client Components can both use it without a cycle.

/** Leagues whose calendar day is the US Eastern one. */
const EASTERN_DAY_LEAGUES = ["nfl", "nba"];

/**
 * The time zone a league's calendar day is measured in: US Eastern for the NFL and the NBA, UTC for
 * every other competition. Takes a plain string so a raw `games.league` value works as well as a
 * `League`; an unknown league is UTC.
 */
export function dayTimeZone(league: string): string {
  return EASTERN_DAY_LEAGUES.includes(league) ? "America/New_York" : "UTC";
}

// Intl.DateTimeFormat is expensive to construct and these two are used on every row of a long game
// log, so keep one per zone. formatToParts is used rather than an "en-CA" string so the result is
// YYYY-MM-DD whatever the ICU build decides that locale looks like.
const dayFormats = new Map<string, Intl.DateTimeFormat>();
function dayFormat(timeZone: string): Intl.DateTimeFormat {
  let f = dayFormats.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
    dayFormats.set(timeZone, f);
  }
  return f;
}

/**
 * The game's day as YYYY-MM-DD — the date the site files it under, and the date segment of its
 * scores page. Correct across the DST changes, because the zone does the arithmetic.
 */
export function gameDayIso(date: string | Date, league: string): string {
  const parts = dayFormat(dayTimeZone(league)).formatToParts(new Date(date));
  const at = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${at("year")}-${at("month")}-${at("day")}`;
}

/**
 * A game's date as a label, in the league's day zone. Same format options as `toLocaleDateString`,
 * so a caller keeps the exact words and digits it had; only the zone is decided here.
 */
export function formatGameDate(date: string | Date, league: string, opts: Intl.DateTimeFormatOptions): string {
  return new Date(date).toLocaleDateString("en-US", { ...opts, timeZone: dayTimeZone(league) });
}

/**
 * A game's kickoff time in the league's day zone, so the time on a server-rendered label agrees with
 * the date beside it rather than being a UTC time under an Eastern date.
 */
export function formatGameTime(date: string | Date, league: string, opts: Intl.DateTimeFormatOptions): string {
  return new Date(date).toLocaleTimeString("en-US", { ...opts, timeZone: dayTimeZone(league) });
}
