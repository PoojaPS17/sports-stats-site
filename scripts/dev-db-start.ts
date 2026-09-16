import EmbeddedPostgres from "embedded-postgres";
import { resolve } from "node:path";

const DB_NAME = "sports";
const PORT = 5433;

const pg = new EmbeddedPostgres({
  databaseDir: resolve(process.cwd(), ".pgdata"),
  port: PORT,
  user: "postgres",
  password: "password",
  persistent: true,
});

async function main() {
  await pg.initialise();
  await pg.start();
  try {
    await pg.createDatabase(DB_NAME);
  } catch {
    // already exists
  }
  console.log(`[dev-db] ready at postgres://postgres:password@localhost:${PORT}/${DB_NAME}`);
  console.log("[dev-db] leave this process running; press Ctrl+C to stop");
  process.stdin.resume();
}

main().catch((err) => {
  console.error("[dev-db] failed to start:", err);
  process.exit(1);
});
