import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";

const port = process.env.SMOKE_PORT ?? "3100";
const baseUrl = `http://127.0.0.1:${port}`;
const child = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", port],
  {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
  },
);
let output = "";
child.stdout.on("data", (chunk) => {
  output += chunk.toString();
});
child.stderr.on("data", (chunk) => {
  output += chunk.toString();
});
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (child.exitCode !== null)
      throw new Error(`Server exited before readiness: ${output}`);
    try {
      const response = await fetch(`${baseUrl}/api/health`, {
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      await delay(500);
      continue;
    }
    await delay(500);
  }
  if (!ready) throw new Error(`Server did not become ready: ${output}`);
  process.env.API_BASE_URL = baseUrl;
  await import("./check-health");
  await import("./check-health-contract.mjs");
  if (process.env.VERIFY_ACCOUNTS === "true") await import("./verify-accounts");
  const secretValues = [
    process.env.INITIAL_ADMIN_PASSWORD,
    "ActiveHubTest123",
    "UpdatedActiveHub123",
  ].filter((value): value is string => !!value);
  if (
    secretValues.some((value) => output.includes(value)) ||
    /password_hash|token_hash|csrf_hash|scrypt\$/.test(output)
  )
    throw new Error("Server logs exposed a secret");
} finally {
  if (child.exitCode === null) {
    const exited = once(child, "exit");
    child.kill("SIGTERM");
    await exited;
  }
}
