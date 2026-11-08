import { createPool } from "../src/infrastructure/database";
import { migrate } from "./lib/migrate";
import { seed, seedConfiguration } from "./lib/seed";

const config = seedConfiguration();
const pool = createPool();
try {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout = '60s'");
    await client.query("SELECT pg_advisory_xact_lock(42817, 1)");
    await migrate(client);
    await seed(client, config);
    await client.query("COMMIT");
    console.log("Database migrations and required seeds are ready");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
