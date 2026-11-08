import { writeFile, rm } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { createPool, assertDatabaseReady } from "../src/infrastructure/database";

const heartbeatPath = process.env.WORKER_HEARTBEAT_PATH ?? "/tmp/activehub-worker.json";
const stop = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => stop.abort());
const pool = createPool();
try {
  await assertDatabaseReady(pool);
  console.log("Worker started; business jobs are not implemented");
  while (!stop.signal.aborted) {
    await assertDatabaseReady(pool);
    await writeFile(heartbeatPath, JSON.stringify({ status: "ready", checkedAt: Date.now() }), { mode: 0o600 });
    try {
      await delay(10_000, undefined, { signal: stop.signal });
    } catch (error) {
      if (!stop.signal.aborted) throw error;
    }
  }
} finally {
  await pool.end();
  await rm(heartbeatPath, { force: true });
  console.log("Worker stopped; database connections closed");
}
