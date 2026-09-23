// How a medal tally is ordered. Pure (no database), mirrors standingsOrder.ts: order
// logic lives on its own so it can be tested on its own and shared by the medal
// tally page and the scraper (scripts/lib/asianGamesMedals.ts), which stores the
// rank this file computes rather than whatever Wikipedia's own markup shows —
// that removes a class of parsing fragility across 20 differently-formatted
// historic tables, and it means the site's rank can never disagree with its own
// sort order.
export interface OrderableMedal {
  nation_slug: string;
  nation_name: string;
  gold: number;
  silver: number;
  bronze: number;
}

/** IOC convention: gold, then silver, then bronze, then name breaks a full tie. Returns new rows; the input is left alone. */
export function sortMedalTally<T extends OrderableMedal>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) => b.gold - a.gold || b.silver - a.silver || b.bronze - a.bronze || a.nation_name.localeCompare(b.nation_name)
  );
}

/**
 * 1-based rank per row of an already-sorted (sortMedalTally) list, ties sharing a
 * position (1, 1, 3) rather than each getting a distinct number.
 */
export function medalRanks<T extends OrderableMedal>(sorted: T[]): number[] {
  const ranks: number[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i === 0) {
      ranks.push(1);
      continue;
    }
    const prev = sorted[i - 1];
    const cur = sorted[i];
    const tied = cur.gold === prev.gold && cur.silver === prev.silver && cur.bronze === prev.bronze;
    ranks.push(tied ? ranks[i - 1] : i + 1);
  }
  return ranks;
}
