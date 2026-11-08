import type { Pool } from "pg";
import { lockBooking, transition } from "../modules/marketplace/bookings";
import { settings } from "../modules/marketplace/core";
export async function runBookingJobs(pool: Pool) {
  const client = await pool.connect();
  let processed = 0;
  try {
    await client.query("BEGIN");
    const claim = await client.query(
      "SELECT name FROM background_runs WHERE name='bookings' AND next_run_at<=clock_timestamp() FOR UPDATE SKIP LOCKED",
    );
    if (!claim.rowCount) {
      await client.query("COMMIT");
      return 0;
    }
    const due = (
      await client.query(
        "SELECT b.id FROM bookings b JOIN event_sessions s ON s.id=b.session_id WHERE (b.status IN ('PENDING','AWAITING_PAYMENT') AND (b.deadline_at<=clock_timestamp() OR s.starts_at<=clock_timestamp())) OR (b.status='CONFIRMED' AND s.ends_at<=clock_timestamp()) ORDER BY s.event_id,s.id,b.id LIMIT 200",
      )
    ).rows;
    for (const row of due) {
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
    }
    await client.query(
      "UPDATE event_sessions SET status='COMPLETED',updated_at=now() WHERE status='SCHEDULED' AND ends_at<=clock_timestamp() AND NOT EXISTS(SELECT 1 FROM bookings b WHERE b.session_id=event_sessions.id AND b.status IN ('PENDING','AWAITING_PAYMENT','CONFIRMED'))",
    );
    await client.query(
      "UPDATE background_runs SET next_run_at=clock_timestamp()+($1*interval '1 second'),finished_at=clock_timestamp(),processed=$2 WHERE name='bookings'",
      [settings().workerSeconds, processed],
    );
    await client.query("COMMIT");
    return processed;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
