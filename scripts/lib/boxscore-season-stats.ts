// Season totals summed from per-game box scores, for competitions the athlete
// season-stats feed does not cover. ESPN's soccer athlete endpoint only returns
// domestic-league rows (checked: a Champions League regular's history lists esp.1
// seasons and nothing else), so the Champions League's leaders, player comparisons
// and season tables are built from the box scores stored in player_game_stats. The
// rows land in player_season_stats in the same shape the athlete feed produces, so
// every page reads them unchanged.
import { pool } from "./db";
import type { League } from "./espn";

export function seasonStatsFromBoxScores(league: League): boolean {
  return league === "ucl";
}

// Box-score labels (see extractSoccer) and the season category each is summed into.
const OUTFIELD_LABELS = ["APP", "G", "A", "SHOT", "SOG", "FC", "FA", "YC", "RC", "OG"];
const KEEPER_LABELS = ["APP", "SV", "GA"];
const ALL_LABELS = [...new Set([...OUTFIELD_LABELS, ...KEEPER_LABELS])];

const num = (label: string) => `coalesce(nullif(regexp_replace(coalesce(pgs.stats->'match'->>'${label}', ''), '[^0-9.-]', '', 'g'), '')::numeric, 0)`;

function positiveOrNull(n: number): number | null {
  return n > 0 ? n : null;
}

/** Rebuilds player_season_stats for one season (or every season when null). Returns rows written. */
export async function rebuildSeasonStatsFromBoxScores(league: League, season: number | null): Promise<number> {
  const sums = ALL_LABELS.map((l) => `sum(${num(l)})::numeric as "${l}"`).join(",\n              ");
  const { rows } = await pool.query(
    `select pgs.player_espn_id, g.season_year as season,
            (array_agg(pgs.team_espn_id order by g.date desc))[1] as team_espn_id,
            ${sums}
     from player_game_stats pgs
     join games g on g.league = pgs.league and g.espn_id = pgs.game_espn_id
     where pgs.league = $1 and g.season_year is not null and ($2::int is null or g.season_year = $2)
     group by pgs.player_espn_id, g.season_year`,
    [league, season]
  );

  let written = 0;
  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const values: unknown[] = [];
    const tuples = chunk.map((r, j) => {
      const total = (l: string) => Number(r[l] ?? 0);
      const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
      const categories: Record<string, { labels: string[]; values: string[] }> = {
        offensive: { labels: OUTFIELD_LABELS, values: OUTFIELD_LABELS.map((l) => fmt(total(l))) },
      };
      if (total("SV") > 0 || total("GA") > 0) categories.goalkeeping = { labels: KEEPER_LABELS, values: KEEPER_LABELS.map((l) => fmt(total(l))) };
      values.push(league, r.season, r.player_espn_id, r.team_espn_id, JSON.stringify(categories), positiveOrNull(total("G")), positiveOrNull(total("A")));
      const b = j * 7;
      return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7}, now())`;
    });
    await pool.query(
      `insert into player_season_stats (league, season, player_espn_id, team_espn_id, categories, goals, assists, updated_at)
       values ${tuples.join(",")}
       on conflict (league, season, player_espn_id) do update set
         team_espn_id = excluded.team_espn_id, categories = excluded.categories,
         goals = excluded.goals, assists = excluded.assists, updated_at = now()`,
      values
    );
    written += chunk.length;
  }
  return written;
}
