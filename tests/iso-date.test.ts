import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidIsoDate } from "../src/lib/isoDate";

// The scores-by-date route takes its date from the URL. A shape check alone lets month 13
// through to toLocaleDateString, which throws (a 500 that makes Googlebot back off), and
// JavaScript's Date silently rolls 2025-02-30 over to March 2, which would give one day two URLs.
test("real dates pass", () => {
  for (const d of ["2025-01-01", "2025-12-31", "2024-02-29", "2000-02-29", "2025-04-30", "2015-08-08"]) assert.equal(isValidIsoDate(d), true, d);
});

test("month 13 and day 45 fail", () => {
  assert.equal(isValidIsoDate("2025-13-45"), false);
  assert.equal(isValidIsoDate("2025-13-01"), false);
  assert.equal(isValidIsoDate("2025-00-10"), false);
  assert.equal(isValidIsoDate("2025-01-00"), false);
  assert.equal(isValidIsoDate("2025-01-32"), false);
});

test("a day the month does not have fails, not rolled into the next month", () => {
  assert.equal(isValidIsoDate("2025-02-30"), false);
  assert.equal(isValidIsoDate("2025-04-31"), false);
  assert.equal(isValidIsoDate("2025-06-31"), false);
});

test("Feb 29 is valid only in a leap year", () => {
  assert.equal(isValidIsoDate("2024-02-29"), true);
  assert.equal(isValidIsoDate("2025-02-29"), false);
  assert.equal(isValidIsoDate("1900-02-29"), false);
  assert.equal(isValidIsoDate("2000-02-29"), true);
});

test("garbage and wrong shapes fail", () => {
  for (const d of ["", "abc", "2025-1-1", "25-01-01", "2025/01/01", "2025-01-01T00:00:00Z", " 2025-01-01", "2025-01-01 ", "2025-01-011", "+2025-01-01", "20250101", "2025-ab-cd"]) {
    assert.equal(isValidIsoDate(d), false, JSON.stringify(d));
  }
});
