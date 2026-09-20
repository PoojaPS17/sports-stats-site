import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";
import { outcome } from "./helpers/nextErrors";

// /tennis/scores/<date> takes its date from the URL. tennis.ts casts it with $1::date, which Postgres rejects for
// an impossible day (a 500), and JavaScript's Date would let 2025-02-30 through to render as March 2. The route
// must answer 404 for such dates, from generateMetadata and from the page, before any query runs.
let db: TestDb;
before(async () => {
  db = await startTestDb();
});
after(async () => {
  await (await import("../src/lib/db")).pool.end();
  await db?.stop();
});

const BAD_DATES = ["2025-02-30", "2025-13-45", "2025-02-29", "2025-04-31", "garbage", "2025-1-1"];

test("an impossible or malformed date is a 404 from generateMetadata and from the page", async () => {
  const { generateMetadata, default: Page } = await import("../src/app/tennis/scores/[date]/page");
  for (const date of BAD_DATES) {
    const params = Promise.resolve({ date });
    assert.equal(await outcome(() => Promise.resolve(generateMetadata({ params }))), "not-found", `generateMetadata ${date}`);
    assert.equal(await outcome(() => Page({ params })), "not-found", `page ${date}`);
  }
});

test("a real date still gets its canonical", async () => {
  const { generateMetadata } = await import("../src/app/tennis/scores/[date]/page");
  for (const date of ["2025-02-28", "2024-02-29"]) {
    const m = await generateMetadata({ params: Promise.resolve({ date }) });
    assert.match(String((m.alternates as { canonical: string }).canonical), new RegExp(`/tennis/scores/${date}$`));
  }
});
