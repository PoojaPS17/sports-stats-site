// The first-visit picker: seven sports a visitor can tap, and the blocks each one puts on their
// homepage. Pure, so the picker and its tests share one mapping and nothing here reaches the database.
import type { HomeBlock } from "./blockTypes";
import { btsBlock, cricketSideBlock, f1Block, liveBlock, seriesStandingsBlock, standingsBlock, type Edition, type EditionContext } from "./editions";
import { MAX_BLOCKS } from "./homeSetup";
import { CRICKET_LEAGUES, SOCCER_LEAGUES, type League } from "./leagues";

export const SPORT_PICKS = ["cricket", "football", "nfl", "nba", "mlb", "tennis", "f1"] as const;
export type SportPick = (typeof SPORT_PICKS)[number];

export const SPORT_PICK_LABEL: Record<SportPick, string> = {
  cricket: "Cricket",
  football: "Football",
  nfl: "NFL",
  nba: "NBA",
  mlb: "MLB",
  tennis: "Tennis",
  f1: "F1",
};

/** Window events that link the picker band to the "Start here" cards further down: a card asks the picker to toggle a sport, the picker announces which are picked. */
export const PICK_TOGGLE_EVENT = "sportsdb:pick-toggle";
export const PICKED_EVENT = "sportsdb:picked";

export function isSportPick(value: string): value is SportPick {
  return (SPORT_PICKS as readonly string[]).includes(value);
}

/** The blocks one sport adds. Tennis has no block of its own: its matches arrive in the live block. */
function sportBlocks(sport: SportPick, edition: Edition, ctx: EditionContext): HomeBlock[] {
  switch (sport) {
    case "cricket": {
      const side = edition.nationalSide ? ctx.cricketSides.find((s) => s.name === edition.nationalSide) : undefined;
      return [...(side ? [cricketSideBlock(side)] : []), ...(ctx.featuredCricketSeries ? [seriesStandingsBlock(ctx.featuredCricketSeries)] : [])];
    }
    case "football":
      return [...(edition.domesticLeague ? [standingsBlock(edition.domesticLeague)] : []), standingsBlock("epl"), standingsBlock("ucl")];
    case "nfl":
      return [standingsBlock("nfl")];
    case "nba":
      return [standingsBlock("nba")];
    case "mlb":
      return [standingsBlock("mlb")];
    case "tennis":
      return [];
    case "f1":
      return [f1Block()];
  }
}

/**
 * The homepage a set of picks builds: live scores first, then each sport in the order it was tapped,
 * then the teams and players the visitor added, then the desk. Duplicates are dropped and the list is
 * capped at MAX_BLOCKS; the desk is the first to go when the list is full, the live block never is.
 */
export function blocksForSports(sports: SportPick[], edition: Edition, ctx: EditionContext, extra: HomeBlock[] = []): HomeBlock[] {
  if (sports.length === 0) return [];
  const body = [liveBlock(), ...sports.flatMap((s) => sportBlocks(s, edition, ctx)), ...extra];
  const seen = new Set<string>();
  const unique = body.filter((b) => (seen.has(b.id) ? false : (seen.add(b.id), true)));
  const room = MAX_BLOCKS - 1;
  const kept = unique.slice(0, room);
  return [...kept, btsBlock()];
}

export interface SportLineInput {
  liveCricket: number;
  liveTennis: number;
  sections: { league: League; liveCount: number }[];
  /** Every league game in play, whichever block shows it. Preferred over `sections`, which cover only the four headline leagues. */
  liveGames?: { league: League }[];
  /** The next stored fixture per league (ISO), null where the league has none left to play. A league missing from the map is unknown. */
  nextFixtures?: Partial<Record<League, string | null>>;
  /** Headline cricket fixtures still to come, tennis matches still to play (the earliest one that has not started is used), and the F1 weekend within the week. */
  nextCricket?: (string | null)[];
  nextTennis?: (string | null)[];
  nextF1?: { start: string; end: string | null } | null;
  /** The clock; tests pass their own. Only elapsed time is used, never a calendar day, so the line reads the same in every timezone. */
  now?: Date;
}

const HOUR = 3_600_000;

/** "Next game in 5 hours" / "in 3 days": elapsed time from now, so no weekday or timezone is involved. Null for a date that has passed. */
export function untilLabel(iso: string | null | undefined, now: Date, noun: string): string | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - now.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const hours = Math.floor(ms / HOUR);
  if (hours < 1) return `${noun} within the hour`;
  if (hours < 24) return `${noun} in ${hours} ${hours === 1 ? "hour" : "hours"}`;
  const days = Math.round(hours / 24);
  return `${noun} in ${days} ${days === 1 ? "day" : "days"}`;
}

const earliest = (dates: (string | null | undefined)[], now: Date): string | null => {
  const future = dates.filter((d): d is string => !!d && new Date(d).getTime() > now.getTime()).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  return future[0] ?? null;
};

/**
 * The small line under each tile. How many are live now when anything is; otherwise a status the data backs (the next
 * fixture, "Between seasons" for a sport whose leagues have nothing left to play); otherwise what the sport covers.
 * Nothing here is estimated: a sport we know nothing about keeps its description.
 */
export function sportLines(input: SportLineInput): Record<SportPick, { live: number; text: string }> {
  const now = input.now ?? new Date();
  const inLeagues = (leagues: readonly League[]) =>
    input.liveGames
      ? input.liveGames.filter((g) => leagues.includes(g.league)).length
      : input.sections.filter((s) => leagues.includes(s.league)).reduce((n, s) => n + s.liveCount, 0);
  const live: Record<SportPick, number> = {
    cricket: input.liveCricket + inLeagues(CRICKET_LEAGUES),
    football: inLeagues(SOCCER_LEAGUES),
    nfl: inLeagues(["nfl"]),
    nba: inLeagues(["nba"]),
    mlb: inLeagues(["mlb"]),
    tennis: input.liveTennis,
    f1: 0,
  };
  const idle: Record<SportPick, string> = {
    cricket: "Every format, every series",
    football: "Nine leagues",
    nfl: "Scores, tables, leaders",
    nba: "Scores, tables, leaders",
    mlb: "Scores, tables, leaders",
    tennis: "Live matches, draws",
    f1: "Standings, race calendar",
  };
  /** Next fixture across a sport's leagues; "Between seasons" only when every league was looked up and has nothing left. */
  const leagueStatus = (leagues: readonly League[]): string | null => {
    const map = input.nextFixtures;
    if (!map) return null;
    const next = untilLabel(earliest(leagues.map((l) => map[l]), now), now, "Next game");
    if (next) return next;
    return leagues.every((l) => map[l] === null) ? "Between seasons" : null;
  };
  const status: Record<SportPick, string | null> = {
    cricket: untilLabel(earliest(input.nextCricket ?? [], now), now, "Next match"),
    football: leagueStatus(SOCCER_LEAGUES),
    nfl: leagueStatus(["nfl"]),
    nba: leagueStatus(["nba"]),
    mlb: leagueStatus(["mlb"]),
    tennis: untilLabel(earliest(input.nextTennis ?? [], now), now, "Next match"),
    f1: input.nextF1
      ? new Date(input.nextF1.start).getTime() <= now.getTime() && (!input.nextF1.end || new Date(input.nextF1.end).getTime() >= now.getTime())
        ? "Race weekend now"
        : untilLabel(input.nextF1.start, now, "Next race")
      : null,
  };
  return Object.fromEntries(SPORT_PICKS.map((s) => [s, { live: live[s], text: live[s] > 0 ? `${live[s]} live now` : (status[s] ?? idle[s]) }])) as Record<SportPick, { live: number; text: string }>;
}

/** Rows in the picker tray: filled blocks first, dashed placeholders after them up to this many. */
export const TRAY_ROWS = 3;
export const trayPlaceholders = (blockCount: number): number => Math.max(0, TRAY_ROWS - blockCount);

/** The follow event a card elsewhere on the page sends the picker: a sport, optionally with the team or player to add. */
export const PICK_FOLLOW_EVENT = "sportsdb:pick-follow";
/** The picker announces the block ids it holds beyond sports (teams, players), so a card can show itself as followed. */
export const PICKED_BLOCKS_EVENT = "sportsdb:picked-blocks";
