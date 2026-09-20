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
  const previousUrl = process.env.DATABASE_URL;
  let server: EmbeddedPostgres | undefined;
  let started = false;
  let pool: Pool | undefined;
  try {
    const port = await freePort();
    server = new EmbeddedPostgres({
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
    started = true;
    await server.createDatabase("t");
    const url = `postgres://postgres:password@localhost:${port}/t`;
    process.env.DATABASE_URL = url;
    pool = new Pool({ connectionString: url });
    await pool.query(readFileSync(resolve(process.cwd(), "db/schema.sql"), "utf8"));
    const livePool = pool;
    const liveServer = server;
    return {
      pool: livePool,
      url,
      async stop() {
        if (previousUrl === undefined) delete process.env.DATABASE_URL;
        else process.env.DATABASE_URL = previousUrl;
        await livePool.end();
        await liveServer.stop();
        rmSync(dir, { recursive: true, force: true });
      },
    };
  } catch (err) {
    // Tear down whatever was set up so a failed start does not leak a server, a pool or the temp dir.
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
    await pool?.end().catch(() => {});
    if (started) await server?.stop().catch(() => {});
    rmSync(dir, { recursive: true, force: true });
    throw err;
  }
}
