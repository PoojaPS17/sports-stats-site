import EmbeddedPostgres from "embedded-postgres";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Pool } from "pg";

function freePort(): Promise<number> {
  return new Promise((ok, fail) => {
    const srv = createServer();
    srv.once("error", fail);
    srv.listen(0, () => {
      const { port } = srv.address() as { port: number };
      srv.close(() => ok(port));
    });
  });
}

export interface TestDb {
  pool: Pool;
  url: string;
  stop(): Promise<void>;
}

/** Throwaway Postgres with db/schema.sql applied. Sets DATABASE_URL so scripts/lib/db.ts points at it. */
export async function startTestDb(): Promise<TestDb> {
  const dir = mkdtempSync(join(tmpdir(), "sportsdb-test-"));
  const port = await freePort();
  const server = new EmbeddedPostgres({
    databaseDir: dir,
    port,
    user: "postgres",
    password: "password",
    persistent: false,
    onLog: () => {},
    onError: () => {},
  });
  await server.initialise();
  await server.start();
  await server.createDatabase("t");
  const url = `postgres://postgres:password@localhost:${port}/t`;
  process.env.DATABASE_URL = url;
  const pool = new Pool({ connectionString: url });
  await pool.query(readFileSync(resolve(process.cwd(), "db/schema.sql"), "utf8"));
  return {
    pool,
    url,
    async stop() {
      await pool.end();
      await server.stop();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
