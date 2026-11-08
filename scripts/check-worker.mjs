import { readFile } from "node:fs/promises";

try {
  const heartbeat = JSON.parse(await readFile(process.env.WORKER_HEARTBEAT_PATH ?? "/tmp/activehub-worker.json", "utf8"));
  if (heartbeat.status !== "ready" || !Number.isFinite(heartbeat.checkedAt) || Date.now() - heartbeat.checkedAt > 30_000) process.exitCode = 1;
} catch {
  process.exitCode = 1;
}
