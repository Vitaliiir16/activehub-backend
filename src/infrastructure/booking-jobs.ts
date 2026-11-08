import type { Pool } from "pg";
import { lockBooking, transition } from "../modules/marketplace/bookings";
import { settings } from "../modules/marketplace/core";

const transient = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  ["40P01", "40001", "55P03"].includes(String(error.code));

export async function runBookingJobs(pool: Pool) {
  const claim = await pool.query(
    "UPDATE background_runs SET next_run_at=clock_timestamp()+($1*interval '1 second'),finished_at=clock_timestamp() WHERE name='bookings' AND next_run_at<=clock_timestamp() RETURNING name",
    [settings().workerSeconds],
  );
  if (!claim.rowCount) return 0;
  const due = (
    await pool.query(
      "SELECT b.id FROM bookings b JOIN event_sessions s ON s.id=b.session_id WHERE (b.status IN ('PENDING','AWAITING_PAYMENT') AND (b.deadline_at<=clock_timestamp() OR s.starts_at<=clock_timestamp())) OR (b.status='CONFIRMED' AND s.ends_at<=clock_timestamp()) ORDER BY s.event_id,s.id,b.id LIMIT 200",
    )
  ).rows;
  let processed = 0;
  for (const row of due) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const {
        booking: b,
        event: e,
        session: s,
      } = await lockBooking(client, row.id);
      if (
        ["PENDING", "AWAITING_PAYMENT"].includes(b.status) &&
        ((b.deadline_at && b.deadline_at <= new Date()) ||
          s.starts_at <= new Date())
      ) {
        await transition(
          client,
          b,
          e,
          s,
          "EXPIRED",
          { role: "SYSTEM" },
          "Booking deadline elapsed",
        );
        processed++;
      } else if (b.status === "CONFIRMED" && s.ends_at <= new Date()) {
        await transition(client, b, e, s, "COMPLETED", { role: "SYSTEM" });
        processed++;
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      if (!transient(error)) throw error;
      console.log(`Booking job ${row.id} will be retried after a lock conflict`);
    } finally {
      client.release();
    }
  }
  await pool.query(
    "UPDATE event_sessions SET status='COMPLETED',updated_at=now() WHERE status='SCHEDULED' AND ends_at<=clock_timestamp() AND NOT EXISTS(SELECT 1 FROM bookings b WHERE b.session_id=event_sessions.id AND b.status IN ('PENDING','AWAITING_PAYMENT','CONFIRMED'))",
  );
  await pool.query("UPDATE background_runs SET processed=$1 WHERE name='bookings'", [processed]);
  return processed;
}
