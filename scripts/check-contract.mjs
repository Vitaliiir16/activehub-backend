import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { parse } from "yaml";

const spec = parse(await readFile("docs/openapi.yaml", "utf8"));
const ids = new Set();
const implemented = [];
let count = 0;
for (const [path, item] of Object.entries(spec.paths)) {
  for (const [method, operation] of Object.entries(item)) {
    count++;
    assert.ok(!ids.has(operation.operationId), `Duplicate operation: ${operation.operationId}`);
    ids.add(operation.operationId);
    assert.ok(["planned", "implemented"].includes(operation["x-implementation-status"]));
    if (operation["x-implementation-status"] === "implemented") implemented.push(`${method.toUpperCase()} ${path}`);
    assert.ok(operation["x-roles"].length > 0);
    assert.ok(operation["x-ownership"]);
    if (!["get", "head", "options"].includes(method)) {
      assert.ok(operation.security.length > 0);
      assert.ok(operation.security.every((scheme) => "csrfToken" in scheme), `Missing CSRF: ${path}`);
    }
    if (!operation["x-roles"].includes("GUEST")) assert.ok(operation.security.every((scheme) => "sessionCookie" in scheme));
    if (path.includes("conversations")) assert.ok(!operation["x-roles"].includes("ADMIN"));
  }
}
assert.deepEqual(implemented, ["GET /api/health"]);
const files = await readdir("src/app/api", { recursive: true });
assert.deepEqual(files.filter((file) => file.endsWith("route.ts")).map((file) => file.replaceAll("\\", "/")), ["health/route.ts"]);
for (const id of ["Q-01", "Q-02", "Q-03", "Q-04", "Q-05"]) {
  assert.ok(JSON.stringify(spec.paths).includes(id), `Missing unresolved decision ${id}`);
}
console.log(`PASS: ${count} operations; only health is implemented; planned access and CSRF declarations checked`);
