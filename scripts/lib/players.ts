import { pool } from "./db";
import { slugify, type League } from "./espn";

export async function uniqueSlugFor(league: League, espnId: string, name: string): Promise<string> {
  const base = slugify(name);
  const { rows } = await pool.query(
    `select 1 from players where league = $1 and slug = $2 and espn_id != $3 limit 1`,
    [league, base, espnId]
  );
  return rows.length === 0 ? base : `${base}-${espnId}`;
}
