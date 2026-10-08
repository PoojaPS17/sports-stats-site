// The team chips of the picker's second step ("Any team or player?"): for each team sport, the sides at the top of the
// table in the competition now being played, read from the stored standings (a table only counts once a game in it has
// been played, so a preseason zero-zero table names nobody). Nothing here is a hand-picked list; a sport with no table
// to read has no chips, and the visitor can still search. The same data for everyone, so the homepage stays one cached document.
import { unstable_cache } from "next/cache";
import { pool } from "./db";
import { blockId, type HomeBlock } from "./blockTypes";
import type { League } from "./leagues";
import { teamDisplayName } from "./teamName";
import type { SportPick } from "./sportPicks";

export interface PopularFollow {
  block: HomeBlock;
  /** The team's name as chips print it. */
  name: string;
  /** ESPN's team colour, bare hex. */
  color: string | null;
}

/** Leagues read for each picker sport, and how many of the table's top sides each contributes. */
const SOURCES: { sport: SportPick; league: League; take: number }[] = [
  { sport: "football", league: "epl", take: 2 },
  { sport: "football", league: "laliga", take: 1 },
  { sport: "football", league: "bundesliga", take: 1 },
  { sport: "nfl", league: "nfl", take: 3 },
  { sport: "nba", league: "nba", take: 3 },
  { sport: "mlb", league: "mlb", take: 3 },
];

async function read(): Promise<Partial<Record<SportPick, PopularFollow[]>>> {
  const out: Partial<Record<SportPick, PopularFollow[]>> = {};
  const rows = await Promise.all(
    SOURCES.map(async (src) => {
      const { rows } = await pool.query<{ name: string; slug: string; color: string | null }>(
        `select t.name, t.slug, t.color
         from standings s join teams t on t.league = s.league and t.espn_id = s.team_espn_id
         where s.league = $1 and s.season = (select max(season) from standings where league = $1)
           and coalesce(s.wins, 0) + coalesce(s.losses, 0) + coalesce(s.draws, 0) > 0
         order by coalesce(s.points, 0) desc, coalesce(s.win_percent, 0) desc, coalesce(s.wins, 0) desc, t.name
         limit $2`,
        [src.league, src.take]
      );
      return { src, rows };
    })
  );
  for (const { src, rows: teams } of rows) {
    for (const t of teams) {
      const name = teamDisplayName(t.name);
      const params = { league: src.league as string, team: t.slug };
      out[src.sport] = [...(out[src.sport] ?? []), { name, color: t.color, block: { id: blockId("team-next", params), type: "team-next", params, label: `${name}: next three` } }];
    }
  }
  return out;
}

const cached = unstable_cache(read, ["home-popular-follows"], { revalidate: 3600 });

export async function getPopularFollows(): Promise<Partial<Record<SportPick, PopularFollow[]>>> {
  try {
    return await cached();
  } catch {
    return {};
  }
}

