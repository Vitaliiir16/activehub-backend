import assert from "node:assert/strict";

const baseUrl = process.env.API_BASE_URL ?? "http://127.0.0.1:3000";
const response = await fetch(`${baseUrl}/api/health`, {
  signal: AbortSignal.timeout(10_000),
});
assert.equal(response.status, 200);
assert.match(response.headers.get("content-type") ?? "", /application\/json/);
assert.equal(response.headers.get("cache-control"), "no-store");
const health = await response.json();
assert.equal(health.status, "ok");
assert.equal(health.service, "activehub-api");
assert.equal(health.version, "0.1.0");
console.log("PASS: real backend health response");
