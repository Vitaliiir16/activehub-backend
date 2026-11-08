import { z } from "zod";
import type { PoolClient } from "pg";
import { hashPassword, verifyPassword } from "../../../scripts/lib/password";
import { database } from "../../infrastructure/database";
import { HttpError, invalid, jsonBody, transaction } from "./http";
import {
  actor,
  checkOrigin,
  cookieValue,
  csrf,
  digest,
  guest,
  rateLimit,
  setCookie,
  startSession,
  token,
} from "./security";
import type { Actor, Role } from "./security";
import {
  adminInput,
  loginInput,
  organizerRegistration,
  passwordInput,
  profileSchemas,
  settingsInput,
  statusInput,
  userRegistration,
  pageInput,
} from "./validation";
import { dictionaries, ownedImage, profile, setDirections } from "./profiles";

export async function welcome(client: PoolClient, id: string, email: string) {
  const notification = await client.query(
    `INSERT INTO notifications (account_id,event_key,type,category,title,body,link,email_status)
    VALUES ($1,$2,'WELCOME','ACCOUNT','Welcome to ActiveHub','Your account is ready. Complete your profile and make room for movement.','/profile','QUEUED') ON CONFLICT (event_key) DO NOTHING RETURNING id`,
    [id, `welcome:${id}`],
  );
  if (notification.rowCount)
    await client.query(
      "INSERT INTO email_outbox (notification_id,recipient,subject,body) VALUES ($1,$2,'Welcome to ActiveHub','Your ActiveHub account is ready. Sign in to complete your profile. Welcome aboard.') ON CONFLICT DO NOTHING",
      [notification.rows[0].id, email],
    );
}
export async function getCsrf(request: Request) {
  checkOrigin(request, false);
  return transaction(async (client) => {
    const value = token(),
      session = cookieValue(request, "activehub_session");
    if (session) {
      const result = await client.query(
        "UPDATE account_sessions s SET csrf_hash=$1 FROM accounts a WHERE s.account_id=a.id AND a.status='ACTIVE' AND s.token_hash=$2 AND s.expires_at>now() RETURNING s.expires_at",
        [digest(value), digest(session)],
      );
      if (result.rowCount)
        return Response.json({
          token: value,
          expiresAt: result.rows[0].expires_at,
        });
    }
    const context = token();
    await client.query(
      "INSERT INTO csrf_contexts (token_hash,csrf_hash,expires_at) VALUES ($1,$2,now()+interval '1 hour')",
      [digest(context), digest(value)],
    );
    const response = Response.json({
      token: value,
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    });
    setCookie(response, "activehub_csrf", context, 3600);
    return response;
  });
}
export async function register(request: Request, role: "USER" | "ORGANIZER") {
  const raw = await jsonBody(request);
  const input =
    role === "USER"
      ? userRegistration.parse(raw)
      : organizerRegistration.parse(raw);
  const limited = await transaction((client) =>
    rateLimit(client, `register:${input.email}`, 10),
  );
  if (!limited)
    throw new HttpError(429, "RATE_LIMITED", "Please wait before trying again");
  return transaction(async (client) => {
    await guest(request, client);
    await dictionaries(
      client,
      input.cityId,
      "directionIds" in input ? input.directionIds : [],
    );
    const hash = await hashPassword(input.password);
    const id = (
      await client.query(
        "INSERT INTO accounts (email,password_hash,role) VALUES ($1,$2,$3) RETURNING id",
        [input.email, hash, role],
      )
    ).rows[0].id;
    if ("firstName" in input)
      await client.query(
        "INSERT INTO user_profiles (account_id,first_name,last_name,phone,city_id,gender) VALUES ($1,$2,$3,$4,$5,$6)",
        [
          id,
          input.firstName,
          input.lastName,
          input.phone,
          input.cityId,
          input.gender,
        ],
      );
    else {
      await client.query(
        "INSERT INTO organizer_profiles (account_id,name,type,phone,city_id,description) VALUES ($1,$2,$3,$4,$5,$6)",
        [
          id,
          input.name,
          input.type,
          input.phone,
          input.cityId,
          input.description ?? "",
        ],
      );
      await setDirections(client, id, input.directionIds);
    }
    await client.query(
      "INSERT INTO notification_settings (account_id) VALUES ($1)",
      [id],
    );
    await welcome(client, id, input.email);
    const response = await startSession(client, id, role, request);
    return new Response(response.body, {
      status: 201,
      headers: response.headers,
    });
  });
}
const dummyHash = "scrypt$131072$8$1$" + "0".repeat(64) + "$" + "0".repeat(128);
export async function login(request: Request) {
  const input = loginInput.parse(await jsonBody(request));
  const limited = await transaction((client) =>
    rateLimit(client, `login:${input.email}`),
  );
  if (!limited)
    throw new HttpError(429, "RATE_LIMITED", "Please wait before trying again");
  return transaction(async (client) => {
    await guest(request, client);
    const row = (
      await client.query(
        "SELECT id,role,status,password_hash FROM accounts WHERE lower(email)=$1 FOR UPDATE",
        [input.email],
      )
    ).rows[0];
    const valid = await verifyPassword(
      input.password,
      row?.password_hash ?? dummyHash,
    );
    if (!row || !valid || row.status === "DELETED")
      throw new HttpError(
        401,
        "UNAUTHENTICATED",
        "Email or password is incorrect",
      );
    if (row.status === "BLOCKED")
      throw new HttpError(
        403,
        "ACCOUNT_BLOCKED",
        "Your account is blocked. Contact an administrator",
      );
    return startSession(client, row.id, row.role, request);
  });
}
export function protectedAction(
  request: Request,
  action: (client: PoolClient, current: Actor) => Promise<Response>,
  roles?: Role[],
  unsafe = false,
) {
  return transaction(async (client) => {
    const current = await actor(request, client, roles);
    if (unsafe) await csrf(request, client, current);
    return action(client, current);
  });
}
export const getSession = (request: Request) =>
  protectedAction(request, async (_client, current) =>
    Response.json({
      accountId: current.id,
      role: current.role,
      expiresAt: current.expiresAt,
    }),
  );
export const getProfile = (request: Request) =>
  protectedAction(request, async (client, current) =>
    Response.json(await profile(client, current)),
  );
export const logout = (request: Request) =>
  protectedAction(
    request,
    async (client, current) => {
      await client.query("DELETE FROM account_sessions WHERE id=$1", [
        current.sessionId,
      ]);
      const response = new Response(null, { status: 204 });
      setCookie(response, "activehub_session", "", 0);
      setCookie(response, "activehub_csrf", "", 0);
      return response;
    },
    undefined,
    true,
  );
export async function updateProfile(request: Request) {
  const body = await jsonBody(request);
  return protectedAction(
    request,
    async (client, current) => {
      const input = profileSchemas[current.role].parse(body);
      if (!Object.keys(input).length)
        invalid("form", "Change at least one field");
      if (
        "cityId" in input ||
        "directionIds" in input ||
        "preferredDirectionIds" in input
      )
        await dictionaries(
          client,
          "cityId" in input ? input.cityId : undefined,
          "directionIds" in input
            ? input.directionIds
            : "preferredDirectionIds" in input
              ? input.preferredDirectionIds
              : undefined,
          current.id,
        );
      await ownedImage(
        client,
        current.id,
        "photoId" in input
          ? input.photoId
          : "logoId" in input
            ? input.logoId
            : undefined,
      );
      if (input.email)
        await client.query("UPDATE accounts SET email=$1 WHERE id=$2", [
          input.email,
          current.id,
        ]);
      const columns: Record<string, string> = {
        firstName: "first_name",
        lastName: "last_name",
        phone: "phone",
        cityId: "city_id",
        gender: "gender",
        photoId: "photo_id",
        name: "name",
        type: "type",
        description: "description",
        logoId: "logo_id",
        displayName: "display_name",
      };
      const entries = Object.entries(input).filter(([key]) => key in columns);
      const table =
        current.role === "USER"
          ? "user_profiles"
          : current.role === "ORGANIZER"
            ? "organizer_profiles"
            : "admin_profiles";
      if (entries.length)
        await client.query(
          `UPDATE ${table} SET ${entries.map(([key], i) => `${columns[key]}=$${i + 1}`).join(",")},updated_at=now() WHERE account_id=$${entries.length + 1}`,
          [...entries.map(([, value]) => value), current.id],
        );
      const directionIds =
        "directionIds" in input
          ? input.directionIds
          : "preferredDirectionIds" in input
            ? input.preferredDirectionIds
            : undefined;
      if (directionIds) await setDirections(client, current.id, directionIds);
      await client.query("UPDATE accounts SET updated_at=now() WHERE id=$1", [
        current.id,
      ]);
      return Response.json(await profile(client, current));
    },
    undefined,
    true,
  );
}
export async function changePassword(request: Request) {
  const input = passwordInput.parse(await jsonBody(request));
  return protectedAction(
    request,
    async (client, current) => {
      const row = (
        await client.query("SELECT password_hash FROM accounts WHERE id=$1", [
          current.id,
        ])
      ).rows[0];
      if (!(await verifyPassword(input.currentPassword, row.password_hash)))
        invalid("currentPassword", "Current password is incorrect");
      await client.query(
        "UPDATE accounts SET password_hash=$1,updated_at=now() WHERE id=$2",
        [await hashPassword(input.newPassword), current.id],
      );
      await client.query("DELETE FROM account_sessions WHERE account_id=$1", [
        current.id,
      ]);
      const session = await startSession(
        client,
        current.id,
        current.role,
        request,
      );
    session.headers.delete("Content-Type");
    return new Response(null, { status: 204, headers: session.headers });
    },
    undefined,
    true,
  );
}
export const getSettings = (request: Request) =>
  protectedAction(request, async (client, current) =>
    Response.json(
      (
        await client.query(
          'SELECT reminders_email AS "remindersEmail",promotions_email AS "promotionsEmail",loyalty_email AS "loyaltyEmail",messages_email AS "messagesEmail" FROM notification_settings WHERE account_id=$1',
          [current.id],
        )
      ).rows[0],
    ),
  );
export async function updateSettings(request: Request) {
  const input = settingsInput.parse(await jsonBody(request));
  return protectedAction(
    request,
    async (client, current) => {
      await client.query(
        "UPDATE notification_settings SET reminders_email=$1,promotions_email=$2,loyalty_email=$3,messages_email=$4 WHERE account_id=$5",
        [
          input.remindersEmail,
          input.promotionsEmail,
          input.loyaltyEmail,
          input.messagesEmail,
          current.id,
        ],
      );
      return Response.json(input);
    },
    undefined,
    true,
  );
}
export async function listDictionary(
  request: Request,
  table: "cities" | "directions",
) {
  const query = pageInput.parse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  const count = Number(
    (await database().query(`SELECT count(*) FROM ${table} WHERE is_active`))
      .rows[0].count,
  );
  const items = (
    await database().query(
      `SELECT id,name,is_active AS "isActive" FROM ${table} WHERE is_active ORDER BY created_at ${query.sort === "newest" ? "DESC" : "ASC"},id LIMIT $1 OFFSET $2`,
      [query.pageSize, (query.page - 1) * query.pageSize],
    )
  ).rows;
  return Response.json({
    items,
    meta: {
      page: query.page,
      pageSize: query.pageSize,
      totalItems: count,
      totalPages: Math.ceil(count / query.pageSize),
    },
  });
}
export async function createAdministrator(request: Request) {
  const input = adminInput.parse(await jsonBody(request));
  return transaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(42817,4)");
    const current = await actor(request, client, ["ADMIN"]);
    await csrf(request, client, current);
    const id = (
      await client.query(
        "INSERT INTO accounts (email,password_hash,role) VALUES ($1,$2,'ADMIN') RETURNING id",
        [input.email, await hashPassword(input.password)],
      )
    ).rows[0].id;
    await client.query(
      "INSERT INTO admin_profiles (account_id,display_name,created_by) VALUES ($1,$2,$3)",
      [id, input.displayName, current.id],
    );
    await client.query(
      "INSERT INTO notification_settings (account_id) VALUES ($1)",
      [id],
    );
    return Response.json(await profile(client, { id, role: "ADMIN" }), {
      status: 201,
    });
  });
}
export async function setAdminStatus(request: Request, id: string) {
  z.uuid().parse(id);
  const input = statusInput.parse(await jsonBody(request));
  return transaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(42817,4)");
    const current = await actor(request, client, ["ADMIN"]);
    await csrf(request, client, current);
    const target = (
      await client.query(
        "SELECT * FROM accounts WHERE id=$1 AND role='ADMIN' AND status<>'DELETED' FOR UPDATE",
        [id],
      )
    ).rows[0];
    if (!target)
      throw new HttpError(404, "NOT_FOUND", "Administrator not found");
    if (
      input.status === "BLOCKED" &&
      (id === current.id ||
        Number(
          (
            await client.query(
              "SELECT count(*) FROM accounts WHERE role='ADMIN' AND status='ACTIVE'",
            )
          ).rows[0].count,
        ) <= 1)
    )
      throw new HttpError(
        409,
        "CONFLICT",
        "You cannot block yourself or the last active administrator",
      );
    await client.query(
      "UPDATE accounts SET status=$1,updated_at=now() WHERE id=$2",
      [input.status, id],
    );
    return Response.json({
      id: target.id,
      email: target.email,
      role: "ADMIN",
      status: input.status,
      displayName: (
        await client.query(
          "SELECT display_name FROM admin_profiles WHERE account_id=$1",
          [id],
        )
      ).rows[0].display_name,
      cityId: null,
      lastLoginAt: target.last_login_at,
      createdAt: target.created_at,
      updatedAt: new Date().toISOString(),
    });
  });
}
