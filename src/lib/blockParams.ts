// Validation of a block's parameters, kept out of the route handler so it is testable
// without a request, and the edge cache lifetime of each block type.
import { BLOCK_TYPES, type BlockType } from "./blockTypes";
import { hasStandings, isLeague } from "./leagues";

export const BLOCK_CACHE_SECONDS: Record<BlockType, number> = {
  live: 30,
  "team-next": 60,
  standings: 900,
  "series-standings": 900,
  "player-form": 900,
  "f1-drivers": 3600,
  bts: 3600,
};

export function isBlockType(value: string): value is BlockType {
  return (BLOCK_TYPES as readonly string[]).includes(value);
}

export type ParamCheck = { ok: true; params: Record<string, string> } | { ok: false; error: string };

const SLUG = /^[a-z0-9][a-z0-9-]{0,80}$/;
const SIDE_ID = /^[0-9]{1,12}$/;
const SERIES_ID = /^[0-9]{1,12}(-[0-9]{1,12})?$/;

const ok = (params: Record<string, string>): ParamCheck => ({ ok: true, params });
const fail = (error: string): ParamCheck => ({ ok: false, error });

export function validateBlockParams(type: BlockType, raw: Record<string, string | null | undefined>): ParamCheck {
  switch (type) {
    case "live":
    case "f1-drivers":
    case "bts":
      return ok({});
    case "team-next": {
      const league = raw.league ?? "";
      const team = raw.team ?? "";
      if (league === "cricket") return SIDE_ID.test(team) ? ok({ league, team }) : fail("team must be a cricket side id");
      if (!isLeague(league)) return fail("league must be a competition with teams, or cricket");
      return SLUG.test(team) ? ok({ league, team }) : fail("team must be a team slug");
    }
    case "standings": {
      const league = raw.league ?? "";
      return isLeague(league) && hasStandings(league) ? ok({ league }) : fail("league must have a table");
    }
    case "series-standings": {
      const series = raw.series ?? "";
      return SERIES_ID.test(series) ? ok({ series }) : fail("series must be a cricket series id");
    }
    case "player-form": {
      const league = raw.league ?? "";
      const player = raw.player ?? "";
      if (!isLeague(league)) return fail("league must be a competition with player pages");
      return SLUG.test(player) ? ok({ league, player }) : fail("player must be a player slug");
    }
  }
}

export function cacheHeader(type: BlockType): string {
  const s = BLOCK_CACHE_SECONDS[type];
  return `public, s-maxage=${s}, stale-while-revalidate=${s * 4}`;
}
