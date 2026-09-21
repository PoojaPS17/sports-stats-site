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

/**
 * A fixture whose kickoff time the feed has not set: ESPN files a placeholder clock time (NFL week 18 is stored
 * at 05:00 UTC, "12:00 AM ET") with the status text "1/10 - TBD". Such a game has a date and no time, and every
 * display shows "TBD" in place of a clock time.
 */
export const isTimeTbd = (g: { completed: boolean; status_state: string | null; status_detail: string | null | undefined }): boolean =>
  g.status_state === "pre" && !g.completed && /\bTBD\b/i.test(g.status_detail ?? "") && !isCalledOff(g.status_detail);
