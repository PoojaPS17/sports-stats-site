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
  moments: 120,
};

/** Teams one moments request may name (a setup holds at most 12 blocks). */
export const MAX_MOMENT_TEAMS = 12;
/** How far back moments reach, whatever the visitor's last visit was. */
export const MOMENTS_LOOKBACK_DAYS = 7;

export function isBlockType(value: string): value is BlockType {
  return (BLOCK_TYPES as readonly string[]).includes(value);
}

export type ParamCheck = { ok: true; params: Record<string, string> } | { ok: false; error: string };

const SLUG = /^[a-z0-9][a-z0-9-]{0,80}$/;
const SIDE_ID = /^[0-9]{1,12}$/;
// An ESPN series id: the number, then the season, which spans two years for a season such as 2026-27 ("21284-2026-27").
const SERIES_ID = /^[0-9]{1,12}(-[0-9]{1,12}){0,2}$/;

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
    case "moments": {
      // teams: "epl:arsenal,cricket:6" (league:slug, or cricket:side-id); since: whole epoch seconds.
      const since = raw.since ?? "";
      if (!/^[0-9]{9,11}$/.test(since)) return fail("since must be epoch seconds");
      const entries = (raw.teams ?? "").split(",");
      if (entries.length > MAX_MOMENT_TEAMS) return fail(`teams must name at most ${MAX_MOMENT_TEAMS} teams`);
      const seen = new Set<string>();
      for (const entry of entries) {
        const [league = "", team = "", ...rest] = entry.split(":");
        const check = rest.length === 0 ? validateBlockParams("team-next", { league, team }) : fail("team entry must be league:team");
        if (!check.ok) return fail(`teams: ${check.error}`);
        seen.add(`${league}:${team}`);
      }
      return ok({ teams: [...seen].join(","), since });
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
