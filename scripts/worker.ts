import { writeFile, rm } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import {
  createPool,
  assertDatabaseReady,
} from "../src/infrastructure/database";
import {
  dispatchWelcome,
  MailpitWelcomeMail,
} from "../src/infrastructure/welcome-mail";

const heartbeatPath =
  process.env.WORKER_HEARTBEAT_PATH ?? "/tmp/activehub-worker.json";
const stop = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => stop.abort());
const pool = createPool();
const mail = new MailpitWelcomeMail();
try {
  await assertDatabaseReady(pool);
  console.log("Worker started; welcome email delivery is enabled");
  while (!stop.signal.aborted) {
    await assertDatabaseReady(pool);
    await writeFile(
      heartbeatPath,
      JSON.stringify({ status: "ready", checkedAt: Date.now() }),
      { mode: 0o600 },
    );
    await dispatchWelcome(pool, mail);
    await pool.query("DELETE FROM csrf_contexts WHERE expires_at<now()");
    await pool.query("DELETE FROM account_sessions WHERE expires_at<now()");
    await pool.query("DELETE FROM auth_rate_limits WHERE resets_at<now()");
    try {
      await delay(1000, undefined, { signal: stop.signal });
    } catch (error) {
      if (!stop.signal.aborted) throw error;
    }
  }
} finally {
  await pool.end();
  await rm(heartbeatPath, { force: true });
  console.log("Worker stopped; database connections closed");
}
