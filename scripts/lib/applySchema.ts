// Applies db/schema.sql only when the file changed since the last run, and rides out a deadlock.
//
// Why: the schema file is replayed by every scrape job and every deploy (about 27 times a day on
// the VM). Replaying it as one multi-statement query is one transaction that takes an exclusive
// lock on every table an `alter table ... add column if not exists` names, even when the column
// exists, and holds them until the whole file is done. On 2026-10-04 08:17 UTC that collided
// with a session holding a lock the other way round and Postgres aborted migrate with
// "deadlock detected" (SQLSTATE 40P01). Skipping an unchanged file removes the locks from the
// routine runs; a changed file is still applied, and a deadlock on a real change is retried,
// since Postgres aborts a deadlocked transaction at once and the retry normally goes through.
import { createHash } from "node:crypto";

export const DEADLOCK_DETECTED = "40P01";

export interface Queryable {
  query(text: string, values?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}

export interface ApplySchemaOptions {
  /** Attempts in total, deadlocks included. */
  attempts?: number;
  /** Pause between attempts, in milliseconds. */
  pauseMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export interface ApplySchemaResult {
  outcome: "applied" | "unchanged";
  hash: string;
  attempts: number;
}

/** sha256 of the schema text; the recorded value stays readable in the table and the log. */
export function schemaHash(sql: string): string {
  return createHash("sha256").update(sql).digest("hex");
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function applySchema(db: Queryable, sql: string, opts: ApplySchemaOptions = {}): Promise<ApplySchemaResult> {
  const attempts = opts.attempts ?? 3;
  const pauseMs = opts.pauseMs ?? 5000;
  const sleep = opts.sleep ?? defaultSleep;
  const hash = schemaHash(sql);

  // A small table of its own, created here rather than in schema.sql, so the recorded hash is the
  // file's alone. Creating a table that exists takes no lock on any live table.
  await db.query("create table if not exists schema_applied (hash text primary key, applied_at timestamptz not null default now())");
  const { rows } = await db.query("select hash from schema_applied order by applied_at desc limit 1");
  if (rows[0]?.hash === hash) return { outcome: "unchanged", hash, attempts: 0 };

  let attempt = 0;
  for (;;) {
    attempt += 1;
    try {
      await db.query(sql);
      break;
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code !== DEADLOCK_DETECTED || attempt >= attempts) throw err;
      await sleep(pauseMs);
    }
  }
  await db.query("insert into schema_applied (hash) values ($1) on conflict (hash) do update set applied_at = now()", [hash]);
  return { outcome: "applied", hash, attempts: attempt };
}
