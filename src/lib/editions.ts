// The starting draft of a visitor's homepage by country. An edition is only a first
// suggestion: the visitor can trim it or start blank, and the page never reads the
// country on the server (see the spec: the homepage HTML is one cached document).
import { blockId, type HomeBlock } from "./blockTypes";
import { LEAGUE_LABEL, type League } from "./leagues";

export type EditionKey = "IN" | "PK" | "BD" | "LK" | "US" | "CA" | "GB" | "IE" | "AU" | "NZ" | "ZA" | "DE" | "ES" | "IT" | "world";

export interface Edition {
  key: EditionKey;
  /** Shown in the builder card: "India picks". */
  name: string;
  /** The men's international cricket side suggested as the first team, by the name the cricket feeds use. */
  nationalSide: string | null;
  domesticLeague: League | null;
}

/** What the server resolves once per render so the client never guesses ids: the international
 * cricket sides with play in the coming weeks and the headline series with a table. */
export interface EditionContext {
  cricketSides: { id: string; name: string }[];
  featuredCricketSeries: { id: string; name: string } | null;
}

const EDITIONS: Record<Exclude<EditionKey, "world">, Omit<Edition, "key">> = {
  IN: { name: "India", nationalSide: "India", domesticLeague: null },
  PK: { name: "Pakistan", nationalSide: "Pakistan", domesticLeague: null },
  BD: { name: "Bangladesh", nationalSide: "Bangladesh", domesticLeague: null },
  LK: { name: "Sri Lanka", nationalSide: "Sri Lanka", domesticLeague: null },
  US: { name: "USA", nationalSide: null, domesticLeague: null },
  CA: { name: "Canada", nationalSide: null, domesticLeague: null },
  GB: { name: "UK", nationalSide: "England", domesticLeague: null },
  IE: { name: "Ireland", nationalSide: "England", domesticLeague: null },
  AU: { name: "Australia", nationalSide: "Australia", domesticLeague: null },
  NZ: { name: "New Zealand", nationalSide: "New Zealand", domesticLeague: null },
  ZA: { name: "South Africa", nationalSide: "South Africa", domesticLeague: null },
  DE: { name: "Germany", nationalSide: null, domesticLeague: "bundesliga" },
  ES: { name: "Spain", nationalSide: null, domesticLeague: "laliga" },
  IT: { name: "Italy", nationalSide: null, domesticLeague: "seriea" },
};

export function editionFor(country: string | null | undefined): Edition {
  const key = (country ?? "").trim().toUpperCase();
  if (key in EDITIONS) return { key: key as Exclude<EditionKey, "world">, ...EDITIONS[key as Exclude<EditionKey, "world">] };
  return { key: "world", name: "World", nationalSide: null, domesticLeague: null };
}

function make(type: HomeBlock["type"], params: Record<string, string>, label: string): HomeBlock {
  return { id: blockId(type, params), type, params, label };
}

export const liveBlock = (): HomeBlock => make("live", {}, "Live in your blocks");
export const f1Block = (): HomeBlock => make("f1-drivers", {}, "F1: driver standings");
export const btsBlock = (): HomeBlock => make("bts", {}, "Beyond the Scoreline");
export const standingsBlock = (league: League): HomeBlock => make("standings", { league }, `${LEAGUE_LABEL[league]} standings`);
export const cricketSideBlock = (side: { id: string; name: string }): HomeBlock => make("team-next", { league: "cricket", team: side.id }, `${side.name}: next three`);
export const seriesStandingsBlock = (series: { id: string; name: string }): HomeBlock => make("series-standings", { series: series.id }, `${series.name} standings`);

type Group = "cricket-first" | "us" | "uk" | "cricket-south" | "european" | "world";

function group(edition: Edition): Group {
  switch (edition.key) {
    case "IN":
    case "PK":
    case "BD":
    case "LK":
      return "cricket-first";
    case "US":
    case "CA":
      return "us";
    case "GB":
    case "IE":
      return "uk";
    case "AU":
    case "NZ":
    case "ZA":
      return "cricket-south";
    case "DE":
    case "ES":
    case "IT":
      return "european";
    default:
      return "world";
  }
}

/** The edition's starting blocks in order. Blocks that need something the context lacks (no national side
 * with play coming, no featured series with a table) are left out rather than guessed. */
export function startingBlocks(edition: Edition, ctx: EditionContext): HomeBlock[] {
  const side = edition.nationalSide ? ctx.cricketSides.find((s) => s.name === edition.nationalSide) : undefined;
  const sideBlock = side ? [cricketSideBlock(side)] : [];
  const seriesBlock = ctx.featuredCricketSeries ? [seriesStandingsBlock(ctx.featuredCricketSeries)] : [];
  switch (group(edition)) {
    case "cricket-first":
      return [liveBlock(), ...sideBlock, ...seriesBlock, standingsBlock("epl"), f1Block(), btsBlock()];
    case "us":
      return [liveBlock(), standingsBlock("nfl"), standingsBlock("nba"), standingsBlock("mlb"), standingsBlock("epl"), standingsBlock("ucl"), btsBlock()];
    case "uk":
      return [liveBlock(), standingsBlock("epl"), standingsBlock("ucl"), ...sideBlock, f1Block(), btsBlock()];
    case "cricket-south":
      return [liveBlock(), ...sideBlock, ...seriesBlock, f1Block(), btsBlock()];
    case "european":
      return [liveBlock(), standingsBlock(edition.domesticLeague as League), standingsBlock("ucl"), f1Block(), btsBlock()];
    case "world":
      return [liveBlock(), standingsBlock("epl"), standingsBlock("ucl"), f1Block(), btsBlock()];
  }
}

export function editionNote(edition: Edition): string {
  return edition.key === "world"
    ? "A starting set of picks. Keep them, trim them, or start blank."
    : `${edition.name} picks, because that is where you are browsing from. Keep them, trim them, or start blank.`;
}

export function editionToggleLabel(edition: Edition): string {
  return edition.key === "world" ? "Start with suggested picks" : `Start with ${edition.name} picks`;
}
