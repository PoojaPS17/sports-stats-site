import type { Pool } from "pg";
import { pool } from "./db";
import { slugify } from "./espn";

// `league` is just a scoping string here (not constrained to the team-sports `League`
// union) so this also works for tennis tours ("atp"/"wta"), which aren't a `League`.
//
// `db` is where the check reads. A caller that inserts players inside a transaction must pass
// that transaction's client, or the check cannot see the players it has just inserted and two
// same-named players get the same slug (violating unique (league, slug)).
export async function uniqueSlugFor(league: string, espnId: string, name: string, db: Pick<Pool, "query"> = pool): Promise<string> {
  const base = slugify(name);
  const { rows } = await db.query(
    `select 1 from players where league = $1 and slug = $2 and espn_id != $3 limit 1`,
    [league, base, espnId]
  );
  return rows.length === 0 ? base : `${base}-${espnId}`;
}
