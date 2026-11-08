import pg from "pg";

export function createPool(connectionString = process.env.DATABASE_URL) {
  if (!connectionString && !process.env.PGHOST) throw new Error("DATABASE_URL or PGHOST is required");
  const pool = new pg.Pool({
    connectionString,
    max: 5,
    connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 10_000,
    query_timeout: 3000,
    statement_timeout: 3000,
  });
  pool.on("error", () => console.error("Database connection became unavailable"));
  return pool;
}

const shared = globalThis as typeof globalThis & { activeHubPool?: pg.Pool };

export function database() {
  shared.activeHubPool ??= createPool();
  return shared.activeHubPool;
}

export async function assertDatabaseReady(pool: pg.Pool) {
  const result = await pool.query<{ ready: boolean }>(
    "SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE name = '001_bootstrap.sql') AS ready",
  );
  if (!result.rows[0]?.ready) throw new Error("Database migration is incomplete");
}
