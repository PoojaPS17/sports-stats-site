import "./env";
import { Pool } from "pg";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set (expected in .env.local)");
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// An idle connection the server (or PgBouncer) closes is emitted here; without a listener Node
// treats it as fatal and the scraper exits mid-job (the 2026-09-30 daily run died this way while
// fetch-player-stats idled on ESPN). The pool has already discarded that client and opens a new
// one on the next query, so logging is all that is needed. Same listener as src/lib/db.ts.
pool.on("error", (err) => console.warn(`[db] idle connection lost: ${err.message}`));
