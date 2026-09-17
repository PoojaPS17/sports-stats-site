import { pool } from "./db";
import { slugify } from "./espn";

// `league` is just a scoping string here (not constrained to the team-sports `League`
// union) so this also works for tennis tours ("atp"/"wta"), which aren't a `League`.
export async function uniqueSlugFor(league: string, espnId: string, name: string): Promise<string> {
  const base = slugify(name);
  const { rows } = await pool.query(
    `select 1 from players where league = $1 and slug = $2 and espn_id != $3 limit 1`,
    [league, base, espnId]
  );
  return rows.length === 0 ? base : `${base}-${espnId}`;
}
