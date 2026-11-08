// ActiveHub outgoing email: SMTP configuration and the transport port used by the outbox dispatcher.
import nodemailer from "nodemailer";

export type OutgoingMail = {
  id: string;
  recipient: string;
  subject: string;
  text: string;
  html: string;
};
export interface MailTransport {
  send(mail: OutgoingMail): Promise<void>;
}
export class MailDeliveryError extends Error {
  constructor(
    public readonly code: string,
    public readonly permanent: boolean,
  ) {
    super(`Email delivery failed (${code})`);
  }
}

export type SmtpSettings = {
  host: string;
  port: number;
  secure: boolean;
  requireTls: boolean;
  ignoreTls: boolean;
  rejectUnauthorized: boolean;
  user?: string;
  password?: string;
  fromAddress: string;
  fromName: string;
  external: boolean;
};

const localHosts = new Set(["mailpit", "localhost", "127.0.0.1", "::1"]);
const flag = (value: string | undefined, fallback: boolean) =>
  value === undefined || value.trim() === ""
    ? fallback
    : ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());

/**
 * Reads SMTP settings. Without SMTP_USER the default is local capture (Mailpit): no authentication and no TLS.
 * With a user or a non-local host the connection must be encrypted: implicit TLS on port 465, otherwise STARTTLS.
 */
export function smtpSettings(env: Record<string, string | undefined> = process.env): SmtpSettings {
  const host = (env.SMTP_HOST ?? "mailpit").trim();
  const port = Number(env.SMTP_PORT ?? 1025);
  if (!host || /\s/.test(host)) throw new Error("Invalid SMTP_HOST configuration");
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("Invalid SMTP_PORT configuration");
  const user = env.SMTP_USER?.trim() || undefined;
  const password = env.SMTP_PASSWORD || undefined;
  if (!!user !== !!password)
    throw new Error("Set both SMTP_USER and SMTP_PASSWORD, or neither");
  const external = !localHosts.has(host.toLowerCase()) || !!user;
  const secure = flag(env.SMTP_SECURE, port === 465);
  const fromAddress = (env.SMTP_FROM?.trim() || user || "notifications@activehub.test").toLowerCase();
  if (!/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(fromAddress))
    throw new Error("SMTP_FROM must be a plain email address");
  const fromName = (env.SMTP_FROM_NAME ?? "ActiveHub").replace(/[\r\n"<>]/g, "").trim() || "ActiveHub";
  return {
    host,
    port,
    secure,
    requireTls: external && !secure && flag(env.SMTP_REQUIRE_TLS, true),
    ignoreTls: !external,
    rejectUnauthorized: flag(env.SMTP_TLS_REJECT_UNAUTHORIZED, true),
    user,
    password,
    fromAddress,
    fromName,
    external,
  };
}

export const describeSmtp = (s: SmtpSettings) =>
  s.external
    ? `${s.host}:${s.port} (${s.secure ? "TLS" : s.requireTls ? "STARTTLS" : "plain"}${s.user ? ", authenticated" : ""})`
    : `local capture ${s.host}:${s.port}`;

export function classifyError(error: unknown) {
  const e = error as { code?: string; responseCode?: number };
  const response = typeof e?.responseCode === "number" ? e.responseCode : 0;
  const code = response ? String(response) : String(e?.code ?? "UNKNOWN").slice(0, 40);
  // A rejected recipient or message will not succeed on retry; connection and credential problems may.
  const permanent =
    response >= 500 && response < 600 && response !== 535 && response !== 534 && e?.code !== "EAUTH";
  return { code, permanent };
}

// Adapter: SmtpMailTransport maps the MailTransport port to nodemailer SMTP (Mailpit locally, Gmail or any provider in production).
export class SmtpMailTransport implements MailTransport {
  private readonly settings: SmtpSettings;
  private readonly transport;
  constructor(settings: SmtpSettings = smtpSettings()) {
    this.settings = settings;
    this.transport = nodemailer.createTransport({
      host: settings.host,
      port: settings.port,
      secure: settings.secure,
      requireTLS: settings.requireTls,
      ignoreTLS: settings.ignoreTls,
      auth: settings.user ? { user: settings.user, pass: settings.password } : undefined,
      tls: { rejectUnauthorized: settings.rejectUnauthorized, minVersion: "TLSv1.2" },
      connectionTimeout: settings.external ? 15000 : 3000,
      greetingTimeout: settings.external ? 15000 : 3000,
      socketTimeout: settings.external ? 30000 : 5000,
      logger: false,
      debug: false,
    });
  }
  get description() {
    return describeSmtp(this.settings);
  }
  get authenticated() {
    return !!this.settings.user;
  }
  async verify() {
    await this.transport.verify();
  }
  async send(mail: OutgoingMail) {
    const domain = this.settings.fromAddress.split("@")[1];
    try {
      await this.transport.sendMail({
        from: { name: this.settings.fromName, address: this.settings.fromAddress },
        to: mail.recipient,
        subject: mail.subject.replace(/[\r\n]+/g, " ").slice(0, 200),
        text: mail.text,
        html: mail.html,
        messageId: `<${mail.id}@${domain}>`,
        disableFileAccess: true,
        disableUrlAccess: true,
      });
    } catch (error) {
      const { code, permanent } = classifyError(error);
      throw new MailDeliveryError(code, permanent);
    }
  }
}
