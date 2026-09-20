const SHAPE = /^\d{4}-\d{2}-\d{2}$/;

// True only for a real calendar day written YYYY-MM-DD. The shape alone is not enough: month 13
// makes a Date invalid, and JavaScript rolls a day the month lacks (2025-02-30) over into the
// next month, so the round trip back to a string must give the same text.
export function isValidIsoDate(date: string): boolean {
  if (!SHAPE.test(date)) return false;
  const parsed = new Date(`${date}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}
