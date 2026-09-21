// How a cricket rate is written. Statsguru (and Cricinfo's career tables) truncate an average, a strike
// rate or an economy rate at the second decimal instead of rounding it: 2609 runs in 44 dismissals is
// 59.2955, which they print as 59.29 and a rounding formatter prints as 59.30; an economy of 3.6667
// reads 3.66. A site that rounds disagrees with the reference on roughly one figure in three.
//
// Only career and season rates use this. A match scorecard's per-innings strike rate and economy
// come from ESPN already written, and Cricinfo's own scorecards round those, so scorecards keep what
// the feed gave.

/**
 * The number cut (not rounded) to `digits` decimals, always with that many digits: 59.2955 is "59.29".
 * null, undefined, NaN and infinities (a rate with nothing to divide by) print `missing`.
 * Read through a 10-place decimal string first, so a value that is 0.29 in exact terms but
 * 0.28999999999999998 in floating point still reads 0.29.
 */
export function trunc2(value: number | null | undefined, digits = 2, missing = "-"): string {
  if (value == null || !Number.isFinite(value)) return missing;
  const [whole, fraction = ""] = value.toFixed(10).split(".");
  const cut = digits > 0 ? `${whole}.${fraction.slice(0, digits)}` : whole;
  // -0.001 cuts to "-0.00": a negative zero is not a number anyone writes.
  return /^-0(\.0*)?$/.test(cut) ? cut.slice(1) : cut;
}
