// What the share menus on a cricket match page need, as plain data. Both match routes (the domestic/live page and the
// league page where internationals live) build it the same way, so a section can never be shared from one and not the
// other. Everything here is serialisable (it is passed from a server page to client components), pure, and free of
// network and database access.
import type { Performer } from "./cricketPerformers";
import type { TeamXi } from "./cricketPlayingXi";
import type { StoryInnings } from "./cricketBalls";
import type { ScorecardTabData } from "./cricketScorecardView";
import { splitCricketScore } from "./cricketMatchExtras";
import { teamDisplayName } from "./teamName";

export interface ShareSide {
  name: string;
  logo: string | null;
  /** ESPN's score text, "172/2 (14.4/20 ov, target 172)"; empty for a fixture. */
  score: string;
  winner: boolean;
}

/** The top of every cricket card: who, when and how it ended. */
export interface ShareHeaderData {
  /** "Cricket · T20I · 1st T20I · West Indies tour of India 2026/27". */
  eyebrow: string;
  /** The date, already written ("Oct 6, 2026"), or null. */
  when: string | null;
  state: "pre" | "in" | "post";
  /** Display order: the side that batted first first. */
  sides: ShareSide[];
  result: string | null;
}

export interface ResultShareData {
  header: ShareHeaderData;
  potm: { name: string; line: string | null } | null;
  large: Performer | null;
  largeLabel: string;
  small: Performer[];
  teams: Record<string, string>;
  /** Series, stage, format, venue, date, folded into the result card. */
  facts: [string, string][];
}

export interface PerformersShareData {
  header: ShareHeaderData;
  large: Performer | null;
  largeLabel: string;
  small: Performer[];
  teams: Record<string, string>;
}

export interface XiShareData {
  header: ShareHeaderData;
  sides: TeamXi[];
}

export interface StoryShareData {
  header: ShareHeaderData;
  innings: StoryInnings[];
  /** Team id to a CSS hex colour (ESPN's), for the lines. */
  colours: Record<string, string>;
}

export interface ScorecardShareData {
  header: ShareHeaderData;
  tabs: ScorecardTabData[];
}

/** Everything the page's share controls share between them. */
export interface MatchShareCommon {
  league: string;
  /** The page's id for file names. */
  id: string;
  matchName: string;
  /** Absolute address of the match page. */
  link: string;
  /** Pre-filled text for the share sheet: score, result, link, no hashtags. */
  caption: string;
}

export interface MatchShare extends MatchShareCommon {
  result: ResultShareData | null;
  performers: PerformersShareData | null;
  xi: XiShareData | null;
  story: StoryShareData | null;
  scorecard: ScorecardShareData | null;
}

/** "172/2" from ESPN's "172/2 (14.4/20 ov, target 172)". */
export const scoreMain = (score: string): string => splitCricketScore(score).main;

/** A hex colour ESPN gave a side, only if it will show on the card's white (not near-white). */
export function cardColour(hex: string | null | undefined): string | null {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex ?? "").trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const lum = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  return lum > 0.82 ? null : `#${m[1].toLowerCase()}`;
}

/**
 * The text that goes with a shared picture: "Pakistan 276/6 v India 270/8. Pakistan won by 6 runs." and the match link on
 * its own line. A live match says so; no hashtags.
 */
export function shareCaption(header: Pick<ShareHeaderData, "sides" | "result" | "state">, link: string): string {
  const scored = header.sides.filter((s) => s.score);
  const line = scored.length > 0 ? header.sides.map((s) => `${teamDisplayName(s.name)}${s.score ? ` ${scoreMain(s.score)}` : ""}`).join(" v ") : header.sides.map((s) => teamDisplayName(s.name)).join(" v ");
  const status = header.result ? `. ${header.result.replace(/\.$/, "")}.` : header.state === "in" ? ". Live." : ".";
  return `${line}${status}\n${link}`;
}

export interface BuildShareInput extends Omit<MatchShareCommon, "caption"> {
  header: ShareHeaderData;
  /** The match was closed without play. */
  calledOff: boolean;
  potm: { name: string; line: string | null } | null;
  performers: { large: Performer | null; small: Performer[] };
  largeLabel: string;
  teams: Record<string, string>;
  facts: [string, string][];
  xi: TeamXi[];
  story: StoryInnings[];
  colours: Record<string, string>;
  tabs: ScorecardTabData[];
}

/**
 * Which sections have anything to share, with the data for each. A fixture, a match called off and a section with no data
 * give null for what has nothing to show, so the page renders no button there.
 */
export function buildMatchShare(i: BuildShareInput): MatchShare {
  const played = !i.calledOff && (i.header.state === "post" || (i.header.state === "in" && i.header.sides.some((s) => s.score)));
  const { header } = i;
  const hasPerformers = i.performers.large !== null || i.performers.small.length > 0;
  const colours: Record<string, string> = {};
  for (const [id, c] of Object.entries(i.colours)) {
    const ok = cardColour(c);
    if (ok) colours[id] = ok;
  }
  return {
    league: i.league,
    id: i.id,
    matchName: i.matchName,
    link: i.link,
    caption: shareCaption(header, i.link),
    result: played ? { header, potm: i.potm, large: i.performers.large, largeLabel: i.largeLabel, small: i.performers.small, teams: i.teams, facts: i.facts } : null,
    performers: played && hasPerformers ? { header, large: i.performers.large, largeLabel: i.largeLabel, small: i.performers.small, teams: i.teams } : null,
    xi: !i.calledOff && i.xi.length > 0 ? { header, sides: i.xi } : null,
    story: played && i.story.length > 0 ? { header, innings: i.story, colours } : null,
    scorecard: played && i.tabs.length > 0 ? { header, tabs: i.tabs } : null,
  };
}

/** The date as a card writes it: "Oct 6, 2026" (UTC, like the rest of the cricket pages). */
export function shareDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}
