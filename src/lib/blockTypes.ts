// The homepage blocks: what a visitor can put on their page and what each one carries.
// Shared by the route that serves a block and the components that draw it, so nothing
// here may import the database.
import type { GameRow } from "./queries";
import type { CricketSeriesMatch } from "./cricketSeries";
import type { TennisMatch } from "./tennis";
import type { ArtPalette } from "./beyondTheScoreline";

export const BLOCK_TYPES = ["live", "team-next", "standings", "series-standings", "player-form", "f1-drivers", "bts", "moments"] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

export interface HomeBlock {
  /** `blockId(type, params)`: unique within a setup. */
  id: string;
  type: BlockType;
  params: Record<string, string>;
  /** The block's name as shown: "Kohli: last five". */
  label: string;
}

/** The type alone for a block without parameters, else the type and the parameter values in key order. */
export function blockId(type: BlockType, params: Record<string, string>): string {
  const keys = Object.keys(params).sort();
  return keys.length === 0 ? type : `${type}:${keys.map((k) => params[k]).join(":")}`;
}

export interface LiveBlockData {
  games: GameRow[];
  cricket: CricketSeriesMatch[];
  tennis: TennisMatch[];
}

export interface FixtureLine {
  id: string;
  /** ISO instant. */
  date: string;
  opponent: string;
  home: boolean;
  href: string;
  /** "2-1" from the team's side, or a cricket score line; null before the game. */
  score: string | null;
  result: "W" | "L" | "D" | null;
  live: boolean;
  status: string | null;
  league: string;
  /** "Mon, Oct 12 · TBD" for a game whose start time the feed has not set; absent for every other game. */
  tbd?: string;
}

/** Where a league team stands and how it has been playing: the same table row and results its team page shows. */
export interface TeamSummary {
  /** "Premier League". */
  leagueLabel: string;
  /** Rank in the table, null when the team is not in it. */
  position: number | null;
  /** "16 pts" in a points table, "5-0" in a record table; null when the team is not in the table. */
  figure: string | null;
  /** "7 played · +7 goal difference", or "5 played" where goals do not apply. */
  record: string | null;
  /** The last five finished games, oldest first. */
  form: ("W" | "L" | "D")[];
}

export interface TeamNextBlockData {
  team: { name: string; href: string; color: string | null };
  /** Absent for cricket sides, which have no league table of their own. */
  summary?: TeamSummary | null;
  last: FixtureLine | null;
  next: FixtureLine[];
}

export interface StandingsLine {
  position: number;
  name: string;
  href: string;
  played: number;
  /** Points for football and cricket, "W-L" for the NFL and NBA. */
  figure: string;
  netRunRate: string | null;
  /** One of the `.zone-N` classes, or null outside any zone. */
  zone: string | null;
  color: string | null;
}

export interface StandingsBlockData {
  label: string;
  href: string;
  rows: StandingsLine[];
  /** True for the NFL and NBA, where `figure` is a record and the leader is "ahead at 5-1". */
  record: boolean;
}

export interface PlayerFormBlockData {
  player: { name: string; href: string; team: string | null };
  /** Column name for the bars: "Runs", "Points", "Goals". */
  statLabel: string;
  /** Verb for the hero line: "made", "scored", "had". */
  verb: string;
  games: { id: string; date: string; opponent: string; value: number | null; display: string; href: string }[];
}

export interface F1DriversBlockData {
  season: number;
  rows: { position: number | null; name: string; href: string; constructor: string | null; points: number | null }[];
  nextRace: { name: string; href: string; raceIso: string; circuitTimeZone: string } | null;
}

export interface BtsBlockData {
  articles: { slug: string; title: string; number: string; caption: string; palette: ArtPalette; sport: string; href: string }[];
}

/** One finished result from a followed team's side: the team's own score first, the opponent named, a link to the game. */
export interface Moment {
  /** `league/espn_id` (cricket: `cricket/espn_id`): one per game however many followed teams played in it. */
  id: string;
  /** ISO instant of the start of the game. */
  date: string;
  /** The followed team the result is told from. */
  team: string;
  opponent: string;
  home: boolean;
  /** "2-1" from the team's side, or "185/4 v 180/9" for cricket; null when the feed carries no score line. */
  score: string | null;
  result: "W" | "L" | "D";
  /** The result in words, cricket only: "India beat Australia by 5 wickets". */
  summary: string | null;
  href: string;
  league: string;
}

/** What happened to the visitor's teams since they last looked: `moments` is the newest few of `total`. */
export interface MomentsBlockData {
  /** ISO instant the window starts at: the visit time, or seven days ago when that is older. */
  since: string;
  total: number;
  moments: Moment[];
}

export type BlockPayload = LiveBlockData | TeamNextBlockData | StandingsBlockData | PlayerFormBlockData | F1DriversBlockData | BtsBlockData | MomentsBlockData;

/** What the route returns: `block` is null when the entity no longer exists. */
export interface BlockResponse {
  block: BlockPayload | null;
  fetchedAt: string;
}
