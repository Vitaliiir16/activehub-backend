import { createHmac } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import { transaction, HttpError } from "../accounts/http";
import { actor, csrf, type Actor, type Role } from "../accounts/security";

export const activeStatuses = ["PENDING", "AWAITING_PAYMENT", "CONFIRMED"];
export type Result = { status: number; body: unknown };
export function conflict(message: string): never {
  throw new HttpError(409, "CONFLICT", message);
}
export function missing(message = "Record not found"): never {
  throw new HttpError(404, "NOT_FOUND", message);
}
export async function access(
  request: Request,
  action: (client: PoolClient, current: Actor) => Promise<Response>,
  roles: Role[] = ["USER", "ORGANIZER", "ADMIN"],
  unsafe = false,
) {
  return transaction(async (client) => {
    const current = await actor(request, client, roles);
    if (unsafe) await csrf(request, client, current);
    return action(client, current);
  });
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
export async function idempotent(
  client: PoolClient,
  current: Actor,
  request: Request,
  scope: string,
  input: unknown,
  action: () => Promise<Result>,
) {
  const key = z.uuid().parse(request.headers.get("idempotency-key"));
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
    `${current.id}:${scope}:${key}`,
  ]);
  const secret =
    process.env.IDEMPOTENCY_SECRET ??
    (
      await client.query(
        "SELECT secret FROM idempotency_secret WHERE singleton",
      )
    ).rows[0].secret;
  const fingerprint = createHmac("sha256", secret)
    .update(canonical(input))
    .digest("hex");
  await client.query(
    "DELETE FROM idempotency_records WHERE actor_id=$1 AND scope=$2 AND key=$3 AND expires_at<=now()",
    [current.id, scope, key],
  );
  const cached = (
    await client.query(
      "SELECT * FROM idempotency_records WHERE actor_id=$1 AND scope=$2 AND key=$3",
      [current.id, scope, key],
    )
  ).rows[0];
  if (cached) {
    if (cached.fingerprint !== fingerprint)
      throw new HttpError(
        409,
        "IDEMPOTENCY_MISMATCH",
        "Use a new idempotency key for a different request",
      );
    return new Response(
      cached.response_status === 204
        ? null
        : JSON.stringify(cached.response_body),
      {
        status: cached.response_status,
        headers:
          cached.response_status === 204
            ? {}
            : { "Content-Type": "application/json" },
      },
    );
  }
  const result = await action();
  await client.query(
    "INSERT INTO idempotency_records(actor_id,scope,key,fingerprint,response_status,response_body) VALUES($1,$2,$3,$4,$5,$6)",
    [
      current.id,
      scope,
      key,
      fingerprint,
      result.status,
      JSON.stringify(result.body),
    ],
  );
  return result.status === 204
    ? new Response(null, { status: 204 })
    : Response.json(result.body, { status: result.status });
}
export async function notify(
  client: PoolClient,
  input: {
    accountId: string;
    key: string;
    type: string;
    title: string;
    body: string;
    link: string;
    category?: string;
    email?: boolean;
    /** Loyalty upgrades email by default until the user explicitly changes the LOYALTY preference. */
    emailUntilCustomized?: boolean;
  },
) {
  const category = input.category ?? "BOOKINGS";
  let email = input.email ?? true;
  const preference = {
    REMINDERS: "reminders_email",
    PROMOTIONS: "promotions_email",
    LOYALTY: "loyalty_email",
    MESSAGES: "messages_email",
  }[category];
  if (preference && email) {
    const setting = (
      await client.query(
        `SELECT ${preference} AS enabled,loyalty_email_customized AS customized FROM notification_settings WHERE account_id=$1`,
        [input.accountId],
      )
    ).rows[0];
    email =
      !!setting?.enabled ||
      (category === "LOYALTY" &&
        !!input.emailUntilCustomized &&
        setting?.customized === false);
  }
  const row = (
    await client.query(
      "INSERT INTO notifications(account_id,event_key,type,category,title,body,link,email_status) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(event_key) DO NOTHING RETURNING id",
      [
        input.accountId,
        input.key,
        input.type,
        category,
        input.title,
        input.body,
        input.link,
        email ? "QUEUED" : "NONE",
      ],
    )
  ).rows[0];
  if (row && email)
    await client.query(
      "INSERT INTO email_outbox(notification_id,recipient,subject,body) SELECT $1,email,$2,$3 FROM accounts WHERE id=$4 ON CONFLICT DO NOTHING",
      [row.id, input.title, input.body, input.accountId],
    );
}
export const page = (
  items: unknown[],
  total: number,
  p: number,
  size: number,
) => ({
  items,
  meta: {
    page: p,
    pageSize: size,
    totalItems: total,
    totalPages: Math.ceil(total / size),
  },
});
export function integerSetting(
  name: string,
  fallback: number,
  min = 1,
  max = 2147483647,
) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < min || value > max)
    throw new Error(`Invalid ${name} configuration`);
  return value;
}
export const settings = () => ({
  cutoffSeconds: integerSetting("BOOKING_CUTOFF_SECONDS", 1800),
  cancelSeconds: integerSetting("CANCELLATION_CUTOFF_SECONDS", 43200, 0),
  paymentSeconds: integerSetting("PAYMENT_DEADLINE_SECONDS", 3600),
  pendingSeconds: integerSetting("PENDING_DEADLINE_SECONDS", 172800),
  workerSeconds: integerSetting("BOOKING_WORKER_INTERVAL_SECONDS", 60),
});
