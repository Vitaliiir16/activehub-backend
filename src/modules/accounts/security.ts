import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { PoolClient } from "pg";
import { HttpError } from "./http";

export type Role = "USER" | "ORGANIZER" | "ADMIN";
export type Actor = {
  id: string;
  role: Role;
  email: string;
  sessionId: string;
  expiresAt: Date;
};
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const token = () => randomBytes(32).toString("hex");
export function cookieValue(request: Request, name: string) {
  const values = (request.headers.get("cookie") ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${name}=`));
  if (values.length !== 1) return undefined;
  const value = values[0].slice(name.length + 1);
  return /^[a-f0-9]{64}$/.test(value) ? value : undefined;
}
function origins() {
  const values = (
    process.env.APP_ORIGINS ??
    process.env.APP_ORIGIN ??
    "http://localhost:5173"
  ).split(",");
  return values.map((value) => new URL(value.trim()).origin);
}
export function checkOrigin(request: Request, required = true) {
  const origin = request.headers.get("origin");
  if (
    request.headers.get("sec-fetch-site") === "cross-site" ||
    (required && !origin) ||
    (origin && !origins().includes(origin))
  )
    throw new HttpError(403, "FORBIDDEN", "Request origin is not permitted");
}
export function setCookie(
  response: Response,
  name: string,
  value: string,
  seconds: number,
) {
  const secure = origins().every((origin) => origin.startsWith("https://"));
  if (
    !secure &&
    origins().some(
      (origin) =>
        !["localhost", "127.0.0.1", "[::1]"].includes(new URL(origin).hostname),
    )
  )
    throw new Error("HTTP cookies are allowed only for local development");
  response.headers.append(
    "Set-Cookie",
    `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${secure ? "; Secure" : ""}`,
  );
}
export async function actor(
  request: Request,
  client: PoolClient,
  roles: Role[] = ["USER", "ORGANIZER", "ADMIN"],
): Promise<Actor> {
  const value = cookieValue(request, "activehub_session");
  if (!value) throw new HttpError(401, "UNAUTHENTICATED", "Please sign in");
  const result = await client.query(
    `SELECT a.id,a.email,a.role,a.status,s.id AS session_id,s.expires_at FROM account_sessions s
    JOIN accounts a ON a.id=s.account_id WHERE s.token_hash=$1 AND s.expires_at>now() FOR NO KEY UPDATE OF a,s`,
    [digest(value)],
  );
  const row = result.rows[0];
  if (!row || row.status !== "ACTIVE")
    throw new HttpError(
      401,
      "UNAUTHENTICATED",
      "Your session has ended. Please sign in again",
    );
  if (!roles.includes(row.role))
    throw new HttpError(
      403,
      "FORBIDDEN",
      "Your account cannot perform this action",
    );
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    sessionId: row.session_id,
    expiresAt: row.expires_at,
  };
}
export async function csrf(
  request: Request,
  client: PoolClient,
  current?: Actor,
) {
  checkOrigin(request);
  const submitted = request.headers.get("x-csrf-token");
  if (!submitted || !/^[a-f0-9]{64}$/.test(submitted))
    throw new HttpError(403, "FORBIDDEN", "Refresh the page and try again");
  const context = cookieValue(request, "activehub_csrf");
  const result = current
    ? await client.query("SELECT csrf_hash FROM account_sessions WHERE id=$1", [
        current.sessionId,
      ])
    : context
      ? await client.query(
          "SELECT csrf_hash FROM csrf_contexts WHERE token_hash=$1 AND expires_at>now() FOR UPDATE",
          [digest(context)],
        )
      : { rows: [] };
  const stored = result.rows[0]?.csrf_hash;
  if (
    !stored ||
    !timingSafeEqual(
      Buffer.from(stored, "hex"),
      Buffer.from(digest(submitted), "hex"),
    )
  )
    throw new HttpError(403, "FORBIDDEN", "Refresh the page and try again");
}
export async function guest(request: Request, client: PoolClient) {
  const value = cookieValue(request, "activehub_session");
  if (
    value &&
    (
      await client.query(
        "SELECT s.id FROM account_sessions s JOIN accounts a ON a.id=s.account_id WHERE token_hash=$1 AND expires_at>now() AND a.status='ACTIVE'",
        [digest(value)],
      )
    ).rowCount
  )
    throw new HttpError(
      409,
      "CONFLICT",
      "Sign out before registering or signing in to another account",
    );
  await csrf(request, client);
}
export function sessionSeconds() {
  const value = Number(process.env.SESSION_TTL_SECONDS ?? 604800);
  if (!Number.isInteger(value) || value < 60 || value > 2592000)
    throw new Error("Invalid session lifetime");
  return value;
}
export async function startSession(
  client: PoolClient,
  accountId: string,
  role: Role,
  request: Request,
) {
  const raw = token(),
    seconds = sessionSeconds();
  const result = await client.query(
    "INSERT INTO account_sessions (token_hash,account_id,expires_at) VALUES ($1,$2,now()+$3*interval '1 second') RETURNING expires_at",
    [digest(raw), accountId, seconds],
  );
  const previous = cookieValue(request, "activehub_session");
  if (previous)
    await client.query("DELETE FROM account_sessions WHERE token_hash=$1", [
      digest(previous),
    ]);
  const preauth = cookieValue(request, "activehub_csrf");
  if (preauth)
    await client.query("DELETE FROM csrf_contexts WHERE token_hash=$1", [
      digest(preauth),
    ]);
  await client.query("UPDATE accounts SET last_login_at=now() WHERE id=$1", [
    accountId,
  ]);
  const response = Response.json({
    accountId,
    role,
    expiresAt: result.rows[0].expires_at,
  });
  setCookie(response, "activehub_session", raw, seconds);
  setCookie(response, "activehub_csrf", "", 0);
  return response;
}
export async function rateLimit(client: PoolClient, key: string, maximum = 20) {
  const result = await client.query(
    `INSERT INTO auth_rate_limits (key_hash,attempts,resets_at) VALUES ($1,1,now()+interval '15 minutes')
    ON CONFLICT (key_hash) DO UPDATE SET attempts=CASE WHEN auth_rate_limits.resets_at<now() THEN 1 ELSE auth_rate_limits.attempts+1 END,
    resets_at=CASE WHEN auth_rate_limits.resets_at<now() THEN now()+interval '15 minutes' ELSE auth_rate_limits.resets_at END RETURNING attempts`,
    [digest(key)],
  );
  return result.rows[0].attempts <= maximum;
}
