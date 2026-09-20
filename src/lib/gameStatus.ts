/** ESPN keeps the original event of a game it closed without playing; its status text says why. */
export const CALLED_OFF = /postpon|cancel|abandon|suspend/i;

/** True for a game that was postponed, cancelled, abandoned or suspended (not a fixture, not a result). */
export const isCalledOff = (statusDetail: string | null | undefined): boolean => CALLED_OFF.test(statusDetail ?? "");

/** Why a called-off game was closed, in the words shown to visitors; null when the status text is not a called-off one. */
export function calledOffLabel(statusDetail: string | null | undefined): string | null {
  const called = CALLED_OFF.exec(statusDetail ?? "");
  if (!called) return null;
  return /cancel/i.test(called[0]) ? "Cancelled" : /abandon/i.test(called[0]) ? "Abandoned" : /suspend/i.test(called[0]) ? "Suspended" : "Postponed";
}

/**
 * True when a game must be shown as called off: unfinished, not in play, with a called-off status. A finished game
 * is never one (a finished abandoned cricket match is a result), and neither is a game in play (a rain-suspended
 * match still being reported as "in" is live), so displays test this rather than isCalledOff alone. One rule for
 * every card, pill, image and calendar feed.
 */
export const isGameCalledOff = (g: { completed: boolean; status_state?: string | null; status_detail: string | null | undefined }): boolean =>
  !g.completed && g.status_state !== "in" && isCalledOff(g.status_detail);

/** The label to show for a game that must be shown as called off (see isGameCalledOff); null for every other game. */
export const gameCalledOffLabel = (g: { completed: boolean; status_state?: string | null; status_detail: string | null | undefined }): string | null =>
  isGameCalledOff(g) ? calledOffLabel(g.status_detail) : null;
