/** ESPN keeps the original event of a game it closed without playing; its status text says why. */
export const CALLED_OFF = /postpon|cancel|abandon|suspend/i;

/**
 * ESPN text of a game that was never played (postponed or cancelled), unlike an abandoned one, which is a result
 * once it is over. ESPN files both under state "post", so "post" alone does not say a game was played.
 */
export const isNeverPlayed = (statusText: string | null | undefined): boolean => /postpon|cancel/i.test(statusText ?? "") && !/abandon/i.test(statusText ?? "");

/** True for a game that was postponed, cancelled, abandoned or suspended (not a fixture, not a result). */
export const isCalledOff = (statusDetail: string | null | undefined): boolean => CALLED_OFF.test(statusDetail ?? "");

/** Why a called-off game was closed, in the words shown to visitors; null when the status text is not a called-off one. */
export function calledOffLabel(statusDetail: string | null | undefined): string | null {
  const called = CALLED_OFF.exec(statusDetail ?? "");
  if (!called) return null;
  return /cancel/i.test(called[0]) ? "Cancelled" : /abandon/i.test(called[0]) ? "Abandoned" : /suspend/i.test(called[0]) ? "Suspended" : "Postponed";
}

/**
 * True when a game must be shown as called off: not in play, and either unfinished with a called-off status, or
 * stored as finished although its status says it was cancelled or postponed (ESPN files those under state "post",
 * which the cricket and tennis writers read as finished; the writers now stop doing so, older rows remain). A
 * finished abandoned or suspended match is a result, and a game in play is live (a rain-suspended match still
 * being reported as "in"), so displays test this rather than isCalledOff alone. One rule for every card, pill,
 * image and calendar feed.
 */
export const isGameCalledOff = (g: { completed: boolean; status_state: string | null; status_detail: string | null | undefined }): boolean =>
  g.status_state !== "in" && (g.completed ? isNeverPlayed(g.status_detail) : isCalledOff(g.status_detail));

/** The label to show for a game that must be shown as called off (see isGameCalledOff); null for every other game. */
export const gameCalledOffLabel = (g: { completed: boolean; status_state: string | null; status_detail: string | null | undefined }): string | null =>
  isGameCalledOff(g) ? calledOffLabel(g.status_detail) : null;

/** schema.org's status for a called-off label: EventPostponed for postponed and suspended, EventCancelled for cancelled and abandoned, EventScheduled otherwise. */
export function schemaStatusForLabel(label: string | null): string {
  if (label === "Postponed" || label === "Suspended") return "https://schema.org/EventPostponed";
  if (label === "Cancelled" || label === "Abandoned") return "https://schema.org/EventCancelled";
  return "https://schema.org/EventScheduled";
}

/**
 * schema.org's status for a game: EventPostponed for a postponed or suspended one, EventCancelled for a cancelled
 * or abandoned one, EventScheduled for everything else (it has no "finished" status, so results and games in play
 * are scheduled too).
 */
export const schemaEventStatus = (g: { completed: boolean; status_state: string | null; status_detail: string | null | undefined }): string =>
  schemaStatusForLabel(gameCalledOffLabel(g));

/** Leagues whose future playoff rows ESPN files at midnight Eastern with the bare status "Scheduled" until the real time is set. */
const MIDNIGHT_PLACEHOLDER_LEAGUES = ["mlb", "nba", "nfl"];

let easternClock: Intl.DateTimeFormat | null = null;
/** True when the instant is exactly 00:00:00 on the US Eastern clock (04:00 UTC in summer, 05:00 UTC in winter). */
function isEasternMidnight(date: string | Date): boolean {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return false;
  easternClock ??= new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hourCycle: "h23", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const parts = easternClock.formatToParts(d);
  const at = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? NaN);
  return at("hour") === 0 && at("minute") === 0 && at("second") === 0;
}

/**
 * A fixture whose kickoff time the feed has not set. Two shapes, both a placeholder clock time that would read as a
 * real one:
 *  - ESPN files NFL week 18 at 05:00 UTC ("12:00 AM ET") with the status text "1/10 - TBD";
 *  - ESPN files every game of a baseball league-championship round at 04:00 UTC ("12:00 AM EDT") with the plain
 *    status "Scheduled", which says nothing. Only given `league` (and the game's `date`) can that be told apart from
 *    a real kickoff, and only for the US leagues whose kickoffs are never at midnight Eastern: a bare "Scheduled" at
 *    exactly 00:00:00 ET. The NBA writes its real late tip-offs as text ("Tue, November 10th at 11:00 PM EST"), and
 *    cricket, soccer and MLS (a 9 PM Pacific kickoff is midnight Eastern) are never read this way.
 */
export const isTimeTbd = (
  g: { completed: boolean; status_state: string | null; status_detail: string | null | undefined; date?: string | Date },
  league?: string,
): boolean =>
  g.status_state === "pre" &&
  !g.completed &&
  !isCalledOff(g.status_detail) &&
  (/\bTBD\b/i.test(g.status_detail ?? "") ||
    (league !== undefined && MIDNIGHT_PLACEHOLDER_LEAGUES.includes(league) && /^scheduled$/i.test((g.status_detail ?? "").trim()) && g.date !== undefined && isEasternMidnight(g.date)));
