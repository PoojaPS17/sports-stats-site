// refresh-cricket-cards.ts takes exactly one cricket league and only its known flags: a misspelt
// flag must not turn a dry run into a real write.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRefreshArgs } from "../scripts/lib/cricket-cards-refresh";

test("a league alone, and with each known flag", () => {
  assert.deepEqual(parseRefreshArgs(["odi"]), { league: "odi", dryRun: false, sinceYear: null });
  assert.deepEqual(parseRefreshArgs(["odi", "--dry-run"]), { league: "odi", dryRun: true, sinceYear: null });
  assert.deepEqual(parseRefreshArgs(["--dry-run", "wbbl", "--since-year", "2019"]), { league: "wbbl", dryRun: true, sinceYear: 2019 });
  assert.deepEqual(parseRefreshArgs(["--since-year", "2015", "test"]), { league: "test", dryRun: false, sinceYear: 2015 });
});

test("--espn-cards-only is accepted and changes nothing", () => {
  assert.deepEqual(parseRefreshArgs(["ipl", "--espn-cards-only"]), parseRefreshArgs(["ipl"]));
  assert.deepEqual(parseRefreshArgs(["--espn-cards-only", "bbl", "--dry-run"]), { league: "bbl", dryRun: true, sinceYear: null });
});

test("a misspelt or unknown flag is an error, not a silent real write", () => {
  for (const bad of ["--dry-run=true", "--dryrun", "--dry_run", "--espn-cards-only=1", "--force", "-n"]) {
    assert.ok("error" in parseRefreshArgs(["odi", bad]), bad);
  }
});

test("exactly one known cricket league", () => {
  assert.ok("error" in parseRefreshArgs([]));
  assert.ok("error" in parseRefreshArgs(["--dry-run"]));
  assert.ok("error" in parseRefreshArgs(["nba"]));
  assert.ok("error" in parseRefreshArgs(["epl", "--dry-run"]));
  assert.ok("error" in parseRefreshArgs(["odi", "t20i"]));
  assert.ok("error" in parseRefreshArgs(["ODI"]));
});

test("--since-year takes a 4-digit year and nothing else", () => {
  for (const bad of [["odi", "--since-year"], ["odi", "--since-year", "15"], ["odi", "--since-year", "20155"], ["odi", "--since-year", "abc"], ["odi", "--since-year", "--dry-run"], ["odi", "--since-year", "2015", "--since-year", "2016"]]) {
    assert.ok("error" in parseRefreshArgs(bad), bad.join(" "));
  }
  // A year read as the league was the old failure: `--since-year 2015 test` ran with league "2015".
  assert.deepEqual(parseRefreshArgs(["--since-year", "2015", "test"]), { league: "test", dryRun: false, sinceYear: 2015 });
});
