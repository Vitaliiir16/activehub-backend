import { writeFile, rm } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import {
  createPool,
  assertDatabaseReady,
} from "../src/infrastructure/database";
import { dispatchEmails } from "../src/infrastructure/email-outbox";
import { SmtpMailTransport } from "../src/infrastructure/mail";
import { runBookingJobs } from "../src/infrastructure/booking-jobs";
import { runReminderJobs } from "../src/infrastructure/reminder-jobs";
import { expireSubscriptions } from "../src/modules/marketplace/subscriptions";
const heartbeatPath =
  process.env.WORKER_HEARTBEAT_PATH ?? "/tmp/activehub-worker.json";
const stop = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => stop.abort());
const pool = createPool();
const mail = new SmtpMailTransport();
try {
  await assertDatabaseReady(pool);
  console.log(
    `Worker started; email delivery, reminders and booking lifecycle jobs are enabled. Email: ${mail.description}`,
  );
  await mail.verify().then(
    () => console.log("Email server connection verified"),
    (error: { code?: string; responseCode?: number }) =>
      console.error(
        `Email server check failed (${error.responseCode ?? error.code ?? "unknown"}); messages stay queued and are retried`,
      ),
  );
  while (!stop.signal.aborted) {
    await assertDatabaseReady(pool);
    await writeFile(
      heartbeatPath,
      JSON.stringify({ status: "ready", checkedAt: Date.now() }),
      { mode: 0o600 },
    );
    await expireSubscriptions(pool);
    await runBookingJobs(pool);
    await runReminderJobs(pool);
    await dispatchEmails(pool, mail);
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
