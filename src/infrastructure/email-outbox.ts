// ActiveHub email outbox dispatcher: claims one queued row, sends it through the MailTransport port and records the outcome.
import type { Pool } from "pg";
import { renderEmail } from "./email-templates";
import { MailDeliveryError, type MailTransport } from "./mail";

export const maxAttempts = () => {
  const value = Number(process.env.EMAIL_MAX_ATTEMPTS ?? 50);
  if (!Number.isInteger(value) || value < 1 || value > 1000)
    throw new Error("Invalid EMAIL_MAX_ATTEMPTS configuration");
  return value;
};

export type DispatchResult = "SENT" | "FAILED" | "DEFERRED" | "IDLE";

/** Sends the oldest due message and reports what happened to it. */
export async function dispatchNextEmail(
  pool: Pool,
  mail: MailTransport,
): Promise<DispatchResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const row = (
      await client.query(
        "SELECT e.*,n.category,n.link,n.title FROM email_outbox e JOIN notifications n ON n.id=e.notification_id WHERE e.state='PENDING' AND e.next_attempt_at<=now() ORDER BY e.created_at,e.id LIMIT 1 FOR UPDATE OF e SKIP LOCKED",
      )
    ).rows[0];
    if (!row) {
      await client.query("COMMIT");
      return "IDLE";
    }
    let result: DispatchResult = "SENT";
    try {
      const content = renderEmail({
        title: row.subject,
        body: row.body,
        link: row.link,
        category: row.category,
      });
      await mail.send({
        id: row.notification_id,
        recipient: row.recipient,
        subject: row.subject,
        ...content,
      });
      await client.query(
        "UPDATE email_outbox SET state='SENT',sent_at=now(),attempts=attempts+1,last_error=NULL WHERE id=$1",
        [row.id],
      );
      await client.query(
        "UPDATE notifications SET email_status='SENT',updated_at=now() WHERE id=$1",
        [row.notification_id],
      );
    } catch (error) {
      const failure =
        error instanceof MailDeliveryError ? error : new MailDeliveryError("INTERNAL", false);
      const final = failure.permanent || row.attempts + 1 >= maxAttempts();
      result = final ? "FAILED" : "DEFERRED";
      await client.query(
        "UPDATE email_outbox SET attempts=attempts+1,last_error=$2,state=CASE WHEN $3 THEN 'FAILED' ELSE state END,next_attempt_at=now()+LEAST(300,power(2,LEAST(attempts+1,8))::int)*interval '1 second' WHERE id=$1",
        [row.id, failure.code, final],
      );
      await client.query(
        "UPDATE notifications SET email_status='FAILED',updated_at=now() WHERE id=$1",
        [row.notification_id],
      );
      console.error(
        `Email delivery ${final ? "failed permanently" : "deferred"} (${failure.code}, attempt ${row.attempts + 1})`,
      );
    }
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Sends due messages until the queue is empty or the limit is reached. A temporary failure ends the batch,
 * because the mail server is probably unavailable and further attempts would only delay the worker.
 */
export async function dispatchEmails(pool: Pool, mail: MailTransport, limit = 25) {
  let handled = 0;
  while (handled < limit) {
    const result = await dispatchNextEmail(pool, mail);
    if (result === "IDLE") break;
    handled++;
    if (result === "DEFERRED") break;
  }
  return handled;
}
