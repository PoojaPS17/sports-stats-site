// The first-visit picker: seven sports a visitor can tap, and the blocks each one puts on their
// homepage. Pure, so the picker and its tests share one mapping and nothing here reaches the database.
import type { HomeBlock } from "./blockTypes";
import { btsBlock, cricketSideBlock, f1Block, liveBlock, seriesStandingsBlock, standingsBlock, type Edition, type EditionContext } from "./editions";
import { MAX_BLOCKS } from "./homeSetup";
import { SOCCER_LEAGUES, type League } from "./leagues";

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
}

/** The small line under each tile: how many are live now when anything is, otherwise what the sport covers. */
export function sportLines(input: SportLineInput): Record<SportPick, { live: number; text: string }> {
  const inLeagues = (leagues: readonly League[]) => input.sections.filter((s) => leagues.includes(s.league)).reduce((n, s) => n + s.liveCount, 0);
  const live: Record<SportPick, number> = {
    cricket: input.liveCricket,
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
  return Object.fromEntries(SPORT_PICKS.map((s) => [s, { live: live[s], text: live[s] > 0 ? `${live[s]} live now` : idle[s] }])) as Record<SportPick, { live: number; text: string }>;
}
