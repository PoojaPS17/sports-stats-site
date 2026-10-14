import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { STALE_AFTER_MINUTES, formatRelative, isStale } from "../src/components/LastUpdated";

const MIN = 60_000;
const ago = (minutes: number, now = Date.now()) => new Date(now - minutes * MIN).toISOString();

// The header badge sat on a green dot beside "Updated 1h ago": the dot meant "healthy" and the text said
// the opposite. The dot now follows the same age the text reports.
test("the badge is stale once two 15-minute scraper ticks have been missed", () => {
  const now = Date.now();
  assert.equal(isStale(ago(2, now), now), false);
  assert.equal(isStale(ago(STALE_AFTER_MINUTES, now), now), false);
  assert.equal(isStale(ago(STALE_AFTER_MINUTES + 1, now), now), true);
  assert.equal(isStale(ago(60, now), now), true);
});

test("the badge reads in minutes, hours and days", () => {
  assert.equal(formatRelative(ago(0)), "just now");
  assert.equal(formatRelative(ago(12)), "12m ago");
  assert.equal(formatRelative(ago(120)), "2h ago");
  assert.equal(formatRelative(ago(60 * 48)), "2d ago");
});

// getLastUpdated used to be max(games.updated_at), which only moves when a game row changes, so any quiet
// stretch read "1h ago" with the scrapers running on time. It must read the heartbeat the status page uses.
test("getLastUpdated reads the scrape-tick heartbeat, not just the newest game row", () => {
  const src = readFileSync(new URL("../src/lib/queries.ts", import.meta.url), "utf8");
  const body = src.slice(src.indexOf("export async function getLastUpdated"));
  assert.match(body.slice(0, body.indexOf("\n}\n")), /scrape_runs[^`]*'scrape-tick'/);
});
