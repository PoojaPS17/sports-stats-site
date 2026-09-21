import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";
import type { saveBackfilledSession as SaveBackfilledSession } from "../scripts/lib/f1-session";

// BUG-5 close-out. A Grand Prix ESPN cancelled lists every session with an empty field and STATUS_CANCELED behind a bare status ref
// (2026 Bahrain 600057430 and Saudi Arabia 600057431, 2023 Emilia Romagna 600026753, 2022 Russia 600014143). The backfill reads that
// ref for an empty session; a failed read must not be turned into "Final".
let db: TestDb;
let save: typeof SaveBackfilledSession;
before(async () => {
  db = await startTestDb();
  ({ saveBackfilledSession: save } = await import("../scripts/lib/f1-session"));
});
after(async () => {
  await db.stop();
});
beforeEach(async () => {
  await db.pool.query(`delete from f1_sessions`);
});

const emptySession = { id: "s-bahrain-race", date: "2026-04-12T12:00Z", type: { abbreviation: "Race" }, competitors: [], status: { $ref: "http://ESPN/status" } };
const CANCELLED = { type: { state: "post", detail: "Canceled", completed: false } };
const stored = async () => (await db.pool.query(`select session_type, status_state, status_detail, completed from f1_sessions where espn_id = 's-bahrain-race'`)).rows[0];
const warnings = () => {
  const lines: string[] = [];
  return { lines, warn: (msg: string) => void lines.push(msg) };
};

test("an empty session reads its status: a cancelled round is stored Canceled, not Final", async () => {
  const w = warnings();
  assert.equal(await save(db.pool, "600057430", emptySession, async () => CANCELLED, w.warn), "saved");
  assert.deepEqual(await stored(), { session_type: "Race", status_state: "post", status_detail: "Canceled", completed: false });
  assert.deepEqual(w.lines, []);
});

test("a failed status read leaves the stored status alone, warns naming the event and session, and reports it", async () => {
  await save(db.pool, "600057430", emptySession, async () => CANCELLED, () => {});
  const w = warnings();
  const result = await save(db.pool, "600057430", { ...emptySession, date: "2026-04-12T13:00Z" }, async () => { throw new Error("ESPN 503"); }, w.warn);
  assert.equal(result, "status-unread");
  assert.deepEqual(await stored(), { session_type: "Race", status_state: "post", status_detail: "Canceled", completed: false }, "still Canceled");
  assert.equal(w.lines.length, 1);
  assert.match(w.lines[0], /WARNING/);
  assert.match(w.lines[0], /600057430/);
  assert.match(w.lines[0], /s-bahrain-race/);
  assert.match(w.lines[0], /ESPN 503/);
});

test("a status read that returns nothing usable counts as unread too", async () => {
  const w = warnings();
  assert.equal(await save(db.pool, "600057430", emptySession, async () => null, w.warn), "status-unread");
  assert.equal(await save(db.pool, "600057430", emptySession, async () => ({}), w.warn), "status-unread");
  assert.equal(w.lines.length, 2);
});

test("a session not stored yet whose status could not be read is stored with no status, never as Final", async () => {
  assert.equal(await save(db.pool, "600057430", emptySession, async () => { throw new Error("boom"); }, () => {}), "status-unread");
  assert.deepEqual(await stored(), { session_type: "Race", status_state: null, status_detail: null, completed: false });
});

test("a session with a field is final without asking ESPN", async () => {
  let asked = 0;
  const raced = { ...emptySession, competitors: [{ id: "d1" }] };
  assert.equal(await save(db.pool, "e1", raced, async () => (asked++, CANCELLED), () => {}), "saved");
  assert.equal(asked, 0);
  assert.deepEqual(await stored(), { session_type: "Race", status_state: "post", status_detail: "Final", completed: true });
});
