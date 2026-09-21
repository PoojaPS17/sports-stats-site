// Reading ESPN's competitor status and statistics (scripts/lib/f1-competitor.ts), on real 2016 Bahrain records.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { f1CompetitorDetail, f1SessionHasStatuses, isPracticeOnlyCompetitor, lapsOf, statusNameOf } from "../scripts/lib/f1-competitor";

const bahrain = JSON.parse(readFileSync("tests/fixtures/f1/espn-race-competitors-2016-bahrain.json", "utf8"));
const competitor = (id: string) => bahrain.competitors.find((c: { id: string }) => c.id === id);
function fetcher() {
  const byRef = new Map<string, unknown>();
  for (const c of bahrain.competitors) {
    byRef.set(c.status.$ref, bahrain.status[c.id]);
    byRef.set(c.statistics.$ref, bahrain.statistics[c.id]);
  }
  const asked: string[] = [];
  return { asked, fetchRef: async (ref: string) => (asked.push(ref), byRef.get(ref)) };
}

test("status name and laps completed are read from ESPN's status and statistics resources", () => {
  assert.equal(statusNameOf(bahrain.status["4686"]), "STATUS_RETIRED");
  assert.equal(statusNameOf(bahrain.status["783"]), "STATUS_CLASSIFIED");
  assert.equal(statusNameOf(bahrain.status["4734"]), "STATUS_FREE_PRACTICE");
  assert.equal(statusNameOf(undefined), null);
  assert.equal(lapsOf(bahrain.statistics["4686"]), 29);
  assert.equal(lapsOf(bahrain.statistics["864"]), 0);
  assert.equal(lapsOf(undefined), null);
  assert.equal(lapsOf([{ name: "lapsCompleted", value: 51.0 }]), 51);
});

test("only a Race or a sprint has statuses; a driver with startOrder 0 and no order is Friday-only", () => {
  assert.ok(f1SessionHasStatuses("Race") && f1SessionHasStatuses("SR") && f1SessionHasStatuses("Sprint"));
  assert.ok(!f1SessionHasStatuses("Qual") && !f1SessionHasStatuses("FP1") && !f1SessionHasStatuses(undefined));
  assert.ok(isPracticeOnlyCompetitor(competitor("4734")));
  assert.ok(!isPracticeOnlyCompetitor(competitor("4686"))); // retired, startOrder 11
  assert.ok(!isPracticeOnlyCompetitor({ id: "x", order: 20, startOrder: 0 })); // a driver with a finishing order is in the race
});

test("a finisher costs one request (status), the winner and a retirement two (status and laps), a Friday-only driver none", async () => {
  const f = fetcher();
  assert.deepEqual(await f1CompetitorDetail(competitor("4623"), f.fetchRef), { status: "STATUS_CLASSIFIED", laps: null }); // Magnussen, 11th
  assert.equal(f.asked.length, 1);
  // the winner's laps are the race distance the 90% classification line is measured from
  assert.deepEqual(await f1CompetitorDetail(competitor("783"), f.fetchRef), { status: "STATUS_CLASSIFIED", laps: 57 });
  assert.equal(f.asked.length, 3);
  assert.deepEqual(await f1CompetitorDetail(competitor("4686"), f.fetchRef), { status: "STATUS_RETIRED", laps: 29 });
  assert.equal(f.asked.length, 5);
  assert.deepEqual(await f1CompetitorDetail(competitor("4734"), f.fetchRef), { status: null, laps: null });
  assert.equal(f.asked.length, 5);
});

test("a stored final status is not asked for again; a status ESPN left mid-session is; a laps-less retirement or winner is", async () => {
  const f = fetcher();
  assert.deepEqual(await f1CompetitorDetail(competitor("4686"), f.fetchRef, { status: "STATUS_RETIRED", laps: 29 }), { status: "STATUS_RETIRED", laps: 29 });
  assert.deepEqual(await f1CompetitorDetail(competitor("4623"), f.fetchRef, { status: "STATUS_CLASSIFIED", laps: null }), { status: "STATUS_CLASSIFIED", laps: null });
  assert.deepEqual(await f1CompetitorDetail(competitor("783"), f.fetchRef, { status: "STATUS_CLASSIFIED", laps: 57 }), { status: "STATUS_CLASSIFIED", laps: 57 });
  assert.equal(f.asked.length, 0);
  await f1CompetitorDetail(competitor("4686"), f.fetchRef, { status: "STATUS_IN_PIT", laps: 29 });
  await f1CompetitorDetail(competitor("4686"), f.fetchRef, { status: "STATUS_RETIRED", laps: null });
  assert.equal(f.asked.length, 4);
  await f1CompetitorDetail(competitor("783"), f.fetchRef, { status: "STATUS_CLASSIFIED", laps: null }); // a winner stored before laps were read for him
  assert.equal(f.asked.length, 6);
});

test("a failed request leaves the status unknown instead of failing the run, and is reported", async () => {
  const failed: string[] = [];
  const failing = async () => { throw new Error("ESPN down"); };
  assert.deepEqual(await f1CompetitorDetail(competitor("4686"), failing, undefined, (ref) => failed.push(ref)), { status: null, laps: null });
  assert.equal(failed.length, 1); // the status read failed, so laps are not tried
  assert.ok(failed[0].includes("/competitors/4686/status"));
  assert.deepEqual(await f1CompetitorDetail(competitor("4686")), { status: null, laps: null }); // no fetcher: a bare feed
  // status read but laps failed: the status is kept
  const laps = async (ref: string) => { if (ref.includes("/statistics")) throw new Error("ESPN down"); return bahrain.status["4686"]; };
  assert.deepEqual(await f1CompetitorDetail(competitor("4686"), laps, undefined, (ref) => failed.push(ref)), { status: "STATUS_RETIRED", laps: null });
  assert.equal(failed.length, 2);
});
