import { Pool } from "pg";

declare global {
  var __pgPool: Pool | undefined;
}

export const pool =
  global.__pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
  });

// An idle connection the server closes (a PostgreSQL restart, a network drop) is
// emitted here; without a listener Node treats it as fatal and the process exits.
// The pool has already discarded that client and opens a new one on the next query.
if (pool.listenerCount("error") === 0) {
  pool.on("error", (err) => console.warn(`[db] idle connection lost: ${err.message}`));
}

if (process.env.NODE_ENV !== "production") {
  global.__pgPool = pool;
}
