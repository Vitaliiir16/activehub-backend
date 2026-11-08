import assert from "node:assert/strict";
import { createPool } from "../src/infrastructure/database";
import { seed, seedConfiguration, cities, directions } from "./lib/seed";
import { migrate } from "./lib/migrate";
import { verifyPassword } from "./lib/password";

const config = seedConfiguration();
const pool = createPool();
const tables = ["accounts", "admin_profiles", "cities", "directions", "loyalty_level_config", "loyalty_free_directions", "loyalty_rules", "schema_migrations"];
try {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(42817, 1)");
    const snapshot = async () => {
      const values: Record<string, unknown[]> = {};
      for (const table of tables) values[table] = (await client.query(`SELECT to_jsonb(t) AS row FROM ${table} t ORDER BY to_jsonb(t)::text`)).rows;
      return values;
    };
    const before = await snapshot();
    await migrate(client);
    await seed(client, config);
    await seed(client, { ...config, password: "ChangedPassword123", displayName: "Changed Name" });
    assert.deepEqual(await snapshot(), before, "Rerunning seeds must not duplicate or replace rows");
    assert.equal((await client.query("SELECT count(*)::int AS count FROM cities WHERE code = ANY($1)", [cities.map((name) => name.toLowerCase().replaceAll(" ", "-"))])).rows[0].count, 15);
    assert.equal((await client.query("SELECT count(*)::int AS count FROM directions WHERE code = ANY($1)", [directions.map((name) => name.toLowerCase().replaceAll(" ", "-"))])).rows[0].count, 16);
    assert.equal((await client.query("SELECT count(*)::int AS count FROM loyalty_level_config")).rows[0].count, 3);
    assert.equal((await client.query("SELECT count(*)::int AS count FROM loyalty_rules")).rows[0].count, 1);
    const admin = (await client.query("SELECT password_hash, role FROM accounts WHERE lower(email) = $1", [config.email])).rows[0];
    assert.equal(admin.role, "ADMIN");
    assert.equal(await verifyPassword(config.password, admin.password_hash), true);
    assert.equal(await verifyPassword("WrongPassword123", admin.password_hash), false);
    await client.query("UPDATE loyalty_level_config SET discount_percent = 7 WHERE level = 'PREMIUM'");
    await client.query("DELETE FROM loyalty_free_directions");
    await client.query("UPDATE cities SET name = 'Kyiv edited', is_active = false WHERE code = 'kyiv'");
    await seed(client, config);
    assert.equal((await client.query("SELECT discount_percent FROM loyalty_level_config WHERE level = 'PREMIUM'")).rows[0].discount_percent, "7.00");
    assert.equal((await client.query("SELECT count(*)::int AS count FROM loyalty_free_directions")).rows[0].count, 0);
    assert.equal((await client.query("SELECT name FROM cities WHERE code = 'kyiv'")).rows[0].name, "Kyiv edited");
    await client.query("ROLLBACK");
    console.log("PASS: required seeds, password hashing, idempotency and preservation of edited values (test changes rolled back)");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
