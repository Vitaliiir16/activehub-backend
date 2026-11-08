import assert from "node:assert/strict";
import test from "node:test";
import { hashPassword, verifyPassword } from "../scripts/lib/password";
import { seedConfiguration } from "../scripts/lib/seed";

test("bootstrap rejects missing credentials and does not accept demo mode", () => {
  assert.throws(() => seedConfiguration({}), /INITIAL_ADMIN_EMAIL/);
  const valid = { INITIAL_ADMIN_EMAIL: "Admin@example.test", INITIAL_ADMIN_PASSWORD: "LocalTestPassword123", INITIAL_ADMIN_NAME: "Initial Admin" };
  assert.equal(seedConfiguration(valid).email, "admin@example.test");
  assert.throws(() => seedConfiguration({ ...valid, INITIAL_ADMIN_PASSWORD: "weak" }), /INITIAL_ADMIN_PASSWORD/);
  assert.throws(() => seedConfiguration({ ...valid, SEED_DEMO: "true" }), /planned/);
});

test("password hashes use unique salts and reject incorrect or malformed inputs", async () => {
  const first = await hashPassword("LocalTestPassword123");
  const second = await hashPassword("LocalTestPassword123");
  assert.notEqual(first, second);
  assert.equal(first.includes("LocalTestPassword123"), false);
  assert.equal(await verifyPassword("LocalTestPassword123", first), true);
  assert.equal(await verifyPassword("AnotherPassword123", first), false);
  assert.equal(await verifyPassword("LocalTestPassword123", "malformed"), false);
});
