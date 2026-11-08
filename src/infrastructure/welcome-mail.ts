import nodemailer from "nodemailer";
import type { Pool } from "pg";

export interface WelcomeMail {
  send(input: {
    id: string;
    recipient: string;
    subject: string;
    body: string;
  }): Promise<void>;
}

// Adapter: MailpitWelcomeMail maps the welcome-mail port to local SMTP without exposing transport to account services.
export class MailpitWelcomeMail implements WelcomeMail {
  private transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? "mailpit",
    port: Number(process.env.SMTP_PORT ?? 1025),
    secure: false,
    ignoreTLS: true,
    connectionTimeout: 3000,
    greetingTimeout: 3000,
    socketTimeout: 5000,
    logger: false,
    debug: false,
  });
  async send(input: {
    id: string;
    recipient: string;
    subject: string;
    body: string;
  }) {
    await this.transport.sendMail({
      from: "ActiveHub <welcome@activehub.test>",
      to: input.recipient,
      subject: input.subject,
      text: input.body,
      messageId: `<welcome-${input.id}@activehub.test>`,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
  }
}
export async function dispatchWelcome(pool: Pool, mail: WelcomeMail) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const row = (
      await client.query(
        "SELECT * FROM email_outbox WHERE state='PENDING' AND next_attempt_at<=now() ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED",
      )
    ).rows[0];
    if (!row) {
      await client.query("COMMIT");
      return false;
    }
    try {
      await mail.send({
        id: row.id,
        recipient: row.recipient,
        subject: row.subject,
        body: row.body,
      });
      await client.query(
        "UPDATE email_outbox SET state='SENT',sent_at=now(),attempts=attempts+1 WHERE id=$1",
        [row.id],
      );
      await client.query(
        "UPDATE notifications SET email_status='SENT',updated_at=now() WHERE id=$1",
        [row.notification_id],
      );
    } catch {
      await client.query(
        "UPDATE email_outbox SET attempts=attempts+1,next_attempt_at=now()+LEAST(300,power(2,LEAST(attempts+1,8))::int)*interval '1 second' WHERE id=$1",
        [row.id],
      );
      await client.query(
        "UPDATE notifications SET email_status='FAILED',updated_at=now() WHERE id=$1",
        [row.notification_id],
      );
      console.error("Welcome email delivery deferred");
    }
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
