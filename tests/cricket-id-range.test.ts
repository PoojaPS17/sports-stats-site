// import-cricket-espn.ts --ids FROM-TO: the argument parsing and the skip rule (resumable, oldest first), and the
// --league-days day list of fetch-cricket-series.ts. Pure functions, no database or network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ID_MODE_DEFAULTS, idsToFetch, parseIdModeArgs, parseIdRange, retriesForAttempts } from "../scripts/lib/cricket-id-range";
import { distinctDays, parseLeagueDays, parseRequestDelay, RETRY_BACKOFF_CAP_MS, retryBackoffs, UNFILED_EXTRA_DAYS } from "../scripts/lib/cricket-series-days";

test("a range, a single id, and nothing else parse as ids", () => {
  assert.deepEqual(parseIdRange("62387-63862"), { from: 62387, to: 63862 });
  assert.deepEqual(parseIdRange("62396"), { from: 62396, to: 62396 });
  for (const bad of [undefined, "", "abc", "5-", "-5", "9-3", "0", "1-2-3", "1e3", " 5", "5.5"]) assert.equal(parseIdRange(bad), null, String(bad));
});

test("no --ids means the other modes, untouched", () => {
  assert.equal(parseIdModeArgs([]), null);
  assert.equal(parseIdModeArgs(["--since", "2025-01-01", "--league", "odi"]), null);
  assert.equal(parseIdModeArgs(["--reconcile", "--cap", "5"]), null);
});

test("defaults are the gentle ones: test league, 2 workers, 400 ms, 8 attempts, no force", () => {
  assert.deepEqual(parseIdModeArgs(["--ids", "62387-63862"]), { from: 62387, to: 63862, league: "test", force: false, dryRun: false, workers: 2, delayMs: 400, attempts: 8 });
  assert.deepEqual(ID_MODE_DEFAULTS, { workers: 2, delayMs: 400, attempts: 8, league: "test" });
});

test("every option is read, in any order", () => {
  assert.deepEqual(parseIdModeArgs(["--force", "--workers", "3", "--ids", "10-20", "--delay", "250", "--attempts", "5", "--dry-run", "--league", "odi"]), {
    from: 10, to: 20, league: "odi", force: true, dryRun: true, workers: 3, delayMs: 250, attempts: 5,
  });
  assert.equal((parseIdModeArgs(["--ids", "1-2", "--delay", "0"]) as { delayMs: number }).delayMs, 0);
});

test("a misspelt flag or a bad value is an error, never a silent default", () => {
  for (const bad of [
    ["--ids", "5-1"],
    ["--ids"],
    ["--ids", "--force"],
    ["--ids", "1-2", "--worker", "3"],
    ["--ids", "1-2", "--workers", "0"],
    ["--ids", "1-2", "--workers", "two"],
    ["--ids", "1-2", "--delay", "-5"],
    ["--ids", "1-2", "--attempts", "0"],
    ["--ids", "1-2", "--league", "nba"],
    ["--ids", "1-2", "extra"],
    ["--ids", "1-2", "--force=true"],
  ]) {
    const r = parseIdModeArgs(bad);
    assert.ok(r && "error" in r, bad.join(" "));
  }
});

test("stored ids are skipped, the rest come oldest first; --force takes all", () => {
  assert.deepEqual(idsToFetch(10, 14, ["11", "13", "99"], false), ["10", "12", "14"]);
  assert.deepEqual(idsToFetch(10, 12, [], false), ["10", "11", "12"]);
  assert.deepEqual(idsToFetch(10, 12, ["10", "11", "12"], false), []);
  assert.deepEqual(idsToFetch(10, 12, ["10", "11"], true), ["10", "11", "12"]);
  assert.deepEqual(idsToFetch(7, 7, new Set(["7"]), false), []);
});

test("attempts count total tries: 8 attempts is 7 retries after the first", () => {
  assert.equal(retriesForAttempts(8), 7);
  assert.equal(retriesForAttempts(1), 0);
});

test("--league-days reads one request per distinct start day, ascending, at noon UTC", () => {
  assert.equal(parseLeagueDays(["--since", "2000-01-01"]), null);
  assert.equal(parseLeagueDays(["--league-days", "test"]), "test");
  const bad = parseLeagueDays(["--league-days", "--since", "x"]);
  assert.ok(bad && typeof bad === "object");
  const days = distinctDays([new Date("1877-03-15T00:00:00Z"), "1877-03-15T23:30:00Z", "1999-12-26T04:00:00Z", "1912-06-10T10:00:00Z", "not a date"]);
  assert.deepEqual(days.map((d) => d.toISOString()), ["1877-03-15T12:00:00.000Z", "1912-06-10T12:00:00.000Z", "1999-12-26T12:00:00.000Z"]);
  // The second pass (--unfiled) also reads the next day: a New Zealand Test stored at 18:30 UTC is listed under the next UTC day.
  assert.deepEqual(
    distinctDays(["1930-01-23T18:30:00Z", "1930-01-24T05:00:00Z"], true).map((d) => d.toISOString().slice(0, 10)),
    ["1930-01-23", "1930-01-24", "1930-01-25"]
  );
  // ESPN's old listing names a Test on only some of its days: the 1990 Lord's Test (started 21 June) is listed 24-26 June.
  const unfiled = distinctDays(["1990-06-21T10:00:00Z"], UNFILED_EXTRA_DAYS).map((d) => d.toISOString().slice(0, 10));
  assert.equal(unfiled.length, UNFILED_EXTRA_DAYS + 1);
  for (const listed of ["1990-06-24", "1990-06-25", "1990-06-26"]) assert.ok(unfiled.includes(listed), listed);
});

// How fast fetch-cricket-series.ts reads the listing. A year is one request per calendar day, so the delay between
// days is the whole of the load ESPN sees: sweeping 2019 at the nightly 120ms failed 22% of its days, and a second
// pass started straight after failed 55%. The nightly top-up reads about a dozen days and keeps the default, so the
// flag exists to let a history sweep be slower without touching the job that runs every night.
test("parseRequestDelay: the flag, its default, and what is not a delay", () => {
  assert.equal(parseRequestDelay([], 120), 120, "no flag keeps the caller's pace");
  assert.equal(parseRequestDelay(["--since", "2019-01-01"], 120), 120);
  assert.equal(parseRequestDelay(["--delay", "500"], 120), 500);
  assert.equal(parseRequestDelay(["--since", "2019-01-01", "--delay", "750", "--until", "2019-12-31"], 120), 750);
  // Zero is a pace, not a missing value: it asks for no wait at all.
  assert.equal(parseRequestDelay(["--delay", "0"], 120), 0);
  for (const argv of [["--delay"], ["--delay", "--since"], ["--delay", "soon"], ["--delay", "-250"]]) {
    const got = parseRequestDelay(argv, 120);
    assert.ok(typeof got === "object", `accepted ${JSON.stringify(argv)} as a delay: ${got}`);
  }
});

test("retryBackoffs: doubles rather than stepping, never waits longer than the cap, and is empty without retries", () => {
  // The four attempts a run allows. The third was 3.6s while this stepped by the base; it doubles now, because a
  // request that has already failed twice is asking a feed that wants to be left alone.
  assert.deepEqual(retryBackoffs(4), [1200, 2400, 4800, 9600]);
  // Only the first three are ever waited (the run gives up after the last attempt), so a dead day costs 8.4s.
  assert.equal(
    retryBackoffs(4)
      .slice(0, 3)
      .reduce((a, b) => a + b, 0),
    8400
  );
  assert.deepEqual(retryBackoffs(0), []);
  const long = retryBackoffs(7);
  assert.ok(long.every((ms) => ms <= RETRY_BACKOFF_CAP_MS), `a wait over the cap: ${long.join(", ")}`);
  assert.equal(long[long.length - 1], RETRY_BACKOFF_CAP_MS);
});
