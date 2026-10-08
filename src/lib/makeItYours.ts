// "Make it yours": the strip under a freshly built homepage that offers the two things the site really has for taking the
// page with you (a link that opens it on another device, and a calendar feed of the followed teams' fixtures), and the
// build log shown while the page forms. Pure helpers plus a little localStorage; no claim here that a step cannot back.
import { encodeFollows } from "./followShare";
import type { HomeBlock } from "./blockTypes";
import { isLeague, type League } from "./leagues";

export const STEPS_KEY = "sportsdb-home-steps";

export interface Steps {
  phone: boolean;
  cal: boolean;
  dismissed: boolean;
}

/** Written when a page is built from the picker. Visitors who built before this existed have none and never see the strip. */
export function startSteps(): void {
  try {
    window.localStorage.setItem(STEPS_KEY, JSON.stringify({ phone: false, cal: false, dismissed: false } satisfies Steps));
  } catch {
    /* private mode: the strip simply does not appear */
  }
}

export function parseSteps(raw: string | null): Steps | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<Steps>;
    if (!v || typeof v !== "object") return null;
    return { phone: v.phone === true, cal: v.cal === true, dismissed: v.dismissed === true };
  } catch {
    return null;
  }
}

export function readSteps(): Steps | null {
  try {
    return parseSteps(window.localStorage.getItem(STEPS_KEY));
  } catch {
    return null;
  }
}

export function writeSteps(steps: Steps): void {
  try {
    window.localStorage.setItem(STEPS_KEY, JSON.stringify(steps));
  } catch {
    /* kept in memory by the caller for this session */
  }
}

/** Steps done out of three: the first (the page itself, already saved) always counts. */
export function stepsDone(steps: Steps): number {
  return 1 + (steps.phone ? 1 : 0) + (steps.cal ? 1 : 0);
}

/**
 * The calendar feed for the teams on a page: the follows feed (/calendar/follows) over the page's team blocks. A cricket
 * side has no fixture feed (the feed reads league teams only), so a page with no league team has nothing to offer: null.
 */
export function calendarFeedPath(blocks: HomeBlock[]): string | null {
  const teams = blocks
    .filter((b) => b.type === "team-next" && isLeague(b.params.league ?? ""))
    .map((b) => ({ kind: "team" as const, league: b.params.league as League, refId: b.params.team, label: b.label.replace(/: next three$/, ""), href: `/${b.params.league}/teams/${b.params.team}` }));
  return teams.length === 0 ? null : `/calendar/follows?f=${encodeFollows(teams)}`;
}

export const BUILD_LINE_MS = 170;
export const BUILD_BASE_MS = 520;
/** How long the build log runs: a beat per block plus a short tail. */
export function buildLogMs(lines: number): number {
  return lines * BUILD_LINE_MS + BUILD_BASE_MS;
}
