// ActiveHub reminder job: persisted schedule, one reminder per booking and lead time.
import type { Pool } from "pg";
import { lockBooking } from "../modules/marketplace/bookings";
import { integerSetting, notify } from "../modules/marketplace/core";

export const reminderSettings = () => ({
  firstSeconds: integerSetting("REMINDER_FIRST_SECONDS", 86400),
  secondSeconds: integerSetting("REMINDER_SECOND_SECONDS", 7200),
  intervalSeconds: integerSetting("REMINDER_WORKER_INTERVAL_SECONDS", 60),
});

const startsAt = (at: Date) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Kyiv",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(at);
const transient = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  ["40P01", "40001", "55P03"].includes(String(error.code));

/**
 * Sends the first reminder to confirmed bookings made before that lead time and the second reminder likewise.
 * The first is skipped once the second is due, so a delayed job never sends both. The notification key
 * `reminder:<booking>:<kind>` makes every reminder a single delivery, even after a retry or restart.
 */
export async function runReminderJobs(pool: Pool) {
  const settings = reminderSettings();
  const claim = await pool.query(
    "UPDATE background_runs SET next_run_at=clock_timestamp()+($1*interval '1 second'),finished_at=clock_timestamp() WHERE name='reminders' AND next_run_at<=clock_timestamp() RETURNING name",
    [settings.intervalSeconds],
  );
  if (!claim.rowCount) return 0;
  const due = (
    await pool.query<{ id: string; kind: "FIRST" | "SECOND" }>(
      `SELECT b.id,'SECOND' AS kind FROM bookings b JOIN event_sessions s ON s.id=b.session_id
       WHERE b.status='CONFIRMED' AND s.status='SCHEDULED' AND s.starts_at>clock_timestamp()
         AND s.starts_at-($2*interval '1 second')<=clock_timestamp() AND b.created_at<=s.starts_at-($2*interval '1 second')
         AND NOT EXISTS(SELECT 1 FROM notifications n WHERE n.event_key='reminder:'||b.id||':2h')
       UNION ALL
       SELECT b.id,'FIRST' FROM bookings b JOIN event_sessions s ON s.id=b.session_id
       WHERE b.status='CONFIRMED' AND s.status='SCHEDULED' AND s.starts_at-($2*interval '1 second')>clock_timestamp()
         AND s.starts_at-($1*interval '1 second')<=clock_timestamp() AND b.created_at<=s.starts_at-($1*interval '1 second')
         AND NOT EXISTS(SELECT 1 FROM notifications n WHERE n.event_key='reminder:'||b.id||':24h')
       LIMIT 500`,
      [settings.firstSeconds, settings.secondSeconds],
    )
  ).rows;
  let sent = 0;
  for (const row of due) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { booking: b, event: e, session: s } = await lockBooking(client, row.id);
      const now = new Date();
      if (b.status === "CONFIRMED" && s.status === "SCHEDULED" && s.starts_at > now) {
        await notify(client, {
          accountId: b.user_id,
          key: `reminder:${b.id}:${row.kind === "FIRST" ? "24h" : "2h"}`,
          type: row.kind === "FIRST" ? "REMINDER_24H" : "REMINDER_2H",
          category: "REMINDERS",
          title: "Activity reminder",
          body: `${e.title} starts on ${startsAt(s.starts_at)} (Europe/Kyiv) at ${e.address}.`,
          link: `/bookings/${b.id}`,
        });
        sent++;
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      if (!transient(error)) throw error;
      console.log(`Reminder ${row.id} will be retried after a lock conflict`);
    } finally {
      client.release();
    }
  }
  return sent;
}
