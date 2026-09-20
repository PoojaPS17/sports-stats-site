/** ESPN keeps the original event of a game it closed without playing; its status text says why. */
export const CALLED_OFF = /postpon|cancel|abandon|suspend/i;

/** True for a game that was postponed, cancelled, abandoned or suspended (not a fixture, not a result). */
export const isCalledOff = (statusDetail: string | null | undefined): boolean => CALLED_OFF.test(statusDetail ?? "");
