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
const actual = [];
const files = await readdir("src/app/api", { recursive: true });
for (const file of files.filter((file) => file.endsWith("route.ts"))) {
  const normalized = file.replaceAll("\\", "/");
  const source = await readFile(`src/app/api/${normalized}`, "utf8");
  const path = "/api/" + normalized.replace(/\/route\.ts$/, "").replace(/\[([^\]]+)\]/g, "{$1}");
  for (const match of source.matchAll(/export\s+(?:const\s+|async\s+function\s+)(GET|POST|PATCH|PUT|DELETE)\b/g)) actual.push(`${match[1]} ${path}`);
}
assert.deepEqual(implemented.sort(), actual.sort(), "OpenAPI implemented status must match real route exports");
const operations = Object.values(spec.paths).flatMap((item) => Object.values(item));
const listed = (key) => new Set(operations.flatMap((operation) => operation[key] ?? []));
for (const id of ["Q-01", "Q-02", "Q-04"]) assert.ok(listed("x-decisions").has(id), `Missing approved decision ${id}`);
for (const id of listed("x-open-questions")) assert.ok(!listed("x-decisions").has(id), `Decision ${id} is both open and approved`);
assert.ok(listed("x-open-questions").has("Q-05"), "Missing unresolved decision Q-05");
console.log(`PASS: ${count} operations; ${implemented.length} implemented route exports match OpenAPI; access and CSRF declarations checked`);
