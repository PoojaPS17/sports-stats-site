import type { Pool } from "pg";
import type { League } from "./espn";
import { parseRound, parseStageFields } from "./games";

// The default team-schedule call returns only the regular season; the postseason needs
// seasontype=3, and the NBA's play-in tournament (2020-21 on) needs seasontype=5. Preseason
// (1) is deliberately not requested: those games are not counted anywhere and would only add
// box scores to fetch.
export function seasonTypesFor(league: League): (number | undefined)[] {
  if (league === "nba") return [undefined, 3, 5];
  if (league === "nfl") return [undefined, 3];
  return [undefined];
}

const day = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");

// Gives a season type to every stored NBA/NFL game that has none (games first stored by an
// earlier version of the scraper) by re-reading the scoreboard for its day. ESPN's scoreboard day
// runs on US time, so a late game is listed under the previous UTC date: both are asked.
export async function classifyUntypedGames(
  pool: Pick<Pool, "query">,
  league: League,
  fetchDay: (league: League, yyyymmdd: string) => Promise<{ events?: any[] }>
): Promise<{ dates: number; typed: number; stillUntyped: number }> {
  const { rows } = await pool.query(`select espn_id, date from games where league = $1 and season_type is null`, [league]);
  const wanted = new Set<string>(rows.map((r) => r.espn_id));
  const days = new Set<string>();
  for (const r of rows) {
    const d = new Date(r.date);
    days.add(day(d));
    days.add(day(new Date(d.getTime() - 86_400_000)));
  }
  let typed = 0;
  for (const yyyymmdd of [...days].sort()) {
    if (wanted.size === 0) break;
    let data: { events?: any[] };
    try {
      data = await fetchDay(league, yyyymmdd);
    } catch (err) {
      console.error(`[classify-untyped] ${league} ${yyyymmdd} failed:`, err instanceof Error ? err.message : err);
      continue;
    }
    for (const ev of data.events ?? []) {
      if (!wanted.has(String(ev.id))) continue;
      // Only the three classification columns are written. An exhibition (All-Star, Pro Bowl) is
      // typed in place too and never upserted: no teams, no new game rows. Scores, status and dates
      // are left alone: ESPN caches partly hydrated old seasons, and a thin day feed must not
      // overwrite results already stored.
      const stage = parseStageFields(league, ev);
      const res = await pool.query(
        `update games
            set season_type = coalesce($3, season_type),
                competition_type = coalesce($4, competition_type),
                round = coalesce($5, round)
          where league = $1 and espn_id = $2`,
        [league, String(ev.id), stage.seasonType, stage.competitionType, parseRound(league, ev)]
      );
      if (!res.rowCount) continue;
      wanted.delete(String(ev.id));
      typed += 1;
    }
  }
  const { rows: left } = await pool.query(`select count(*)::int as n from games where league = $1 and season_type is null`, [league]);
  return { dates: days.size, typed, stillUntyped: left[0].n };
}
