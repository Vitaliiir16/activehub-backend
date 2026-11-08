// Checks the configured SMTP server and optionally sends one test email. Prints no credentials.
import { renderEmail } from "../src/infrastructure/email-templates";
import { SmtpMailTransport } from "../src/infrastructure/mail";

const recipient = process.argv[2];
if (recipient && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
  console.error("Usage: npm run mail:check -- [recipient@example.com]");
  process.exit(2);
}
const hint = (code: string) =>
  ({
    EAUTH: "The server rejected the credentials. For Gmail use an app password, not your account password.",
    "535": "The server rejected the credentials. For Gmail use an app password, not your account password.",
    ECONNECTION: "Cannot connect. Check SMTP_HOST, SMTP_PORT and your network or firewall.",
    ETIMEDOUT: "The server did not answer in time. Check SMTP_HOST, SMTP_PORT and your network or firewall.",
    ESOCKET: "The TLS handshake failed. Check SMTP_PORT (587 uses STARTTLS, 465 needs SMTP_SECURE=true).",
    ESTREAM: "The connection was interrupted. Check SMTP_PORT and SMTP_SECURE.",
  })[code] ?? "See the SMTP settings in README.md.";
try {
  const mail = new SmtpMailTransport();
  console.log(`Email server: ${mail.description}`);
  await mail.verify();
  console.log(mail.authenticated ? "Connection and credentials accepted." : "Connection accepted.");
  if (recipient) {
    const content = renderEmail({
      title: "ActiveHub test email",
      body: "If you can read this, ActiveHub can send email through your configured server.",
      link: "/profile",
      category: "ACCOUNT",
    });
    await mail.send({ id: `check-${Date.now()}`, recipient, subject: "ActiveHub test email", ...content });
    console.log("Test email accepted by the server. Check the inbox (and the spam folder).");
  }
} catch (error) {
  const e = error as { code?: string; responseCode?: number; message?: string };
  const code = String(e.responseCode ?? e.code ?? "UNKNOWN");
  console.error(`Email check failed (${code}). ${hint(code)}`);
  process.exit(1);
}
