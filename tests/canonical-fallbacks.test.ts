import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";
import { absoluteUrl } from "../src/lib/site";

// The cricket match page renders from ESPN's live summary for a match that is not stored yet, so its
// metadata must still carry a canonical when the stored row is missing.
let db: TestDb;
before(async () => {
  db = await startTestDb();
});
after(async () => {
  await (await import("../src/lib/db")).pool.end();
  await db?.stop();
});

test("a cricket match with no stored row still gets its canonical", async () => {
  const { generateMetadata } = await import("../src/app/cricket/matches/[id]/page");
  const m = await generateMetadata({ params: Promise.resolve({ id: "1234567" }) });
  assert.deepEqual(m.alternates, { canonical: absoluteUrl("/cricket/matches/1234567") });
  assert.equal(m.robots, undefined, "no robots override: the layout's indexable directive applies");
});
