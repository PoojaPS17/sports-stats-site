// Read-side queries for the Asian Games medal tally pages. The scraper (write
// side) is scripts/lib/asianGamesMedals.ts — same domain-name split as F1's
// src/lib/f1.ts (reads) vs scripts/lib/f1.ts (writes, via fetch-f1-*.ts).
import { pool } from "./db";
import { sortMedalTally, medalRanks, type OrderableMedal } from "./medalTallyOrder";

interface StoredMedalRow extends OrderableMedal {
  source_url: string | null;
  updated_at: string;
}

export interface MedalTallyRow extends StoredMedalRow {
  rank: number;
}

/** Every edition with stored medal data, most recent first. */
export async function getMedalTallyEditions(): Promise<number[]> {
  const { rows } = await pool.query(`select distinct edition_year from medal_tally order by edition_year desc`);
  return rows.map((r) => r.edition_year as number);
}

/** One edition's medal tally, ordered and ranked (medalTallyOrder.ts) — the stored
 * `rank` column is already this, but recomputing here means the page can never
 * show a rank that disagrees with the order it renders in. */
export async function getMedalTally(editionYear: number): Promise<MedalTallyRow[]> {
  const { rows } = await pool.query<StoredMedalRow>(
    `select nation_slug, nation_name, gold, silver, bronze, source_url, updated_at
     from medal_tally where edition_year = $1`,
    [editionYear]
  );
  const sorted = sortMedalTally(rows);
  const ranks = medalRanks(sorted);
  return sorted.map((r, i) => ({ ...r, rank: ranks[i] }));
}
