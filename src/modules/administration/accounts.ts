// ActiveHub account administration: search, details, contact edits, block/unblock and safe soft deletion of users and organizers.
import { z } from "zod";
import type { PoolClient } from "pg";
import { invalid, jsonBody } from "../accounts/http";
import { profile } from "../accounts/profiles";
import { applyProfile } from "../accounts/service";
import { profileSchemas, statusInput } from "../accounts/validation";
import { access, activeStatuses, conflict, idempotent, missing, notify, page } from "../marketplace/core";
import { lockBooking, transition } from "../marketplace/bookings";
import { cancelEventCascade, eventRow } from "../marketplace/catalog";
import { pagination, reason } from "../marketplace/validation";
import { audit } from "./audit";

type Target = "USER" | "ORGANIZER";
type SummaryRow = {
  id: string;
  created_at: Date;
  updated_at: Date;
  email: string;
  role: string;
  status: string;
  last_login_at: Date | null;
  display_name: string;
  city_id: string | null;
};
const summarySql = `SELECT a.id,a.created_at,a.updated_at,a.email,a.role,a.status,a.last_login_at,
  CASE a.role WHEN 'USER' THEN up.first_name||' '||up.last_name WHEN 'ORGANIZER' THEN op.name ELSE ap.display_name END AS display_name,
  coalesce(up.city_id,op.city_id) AS city_id
  FROM accounts a LEFT JOIN user_profiles up ON up.account_id=a.id LEFT JOIN organizer_profiles op ON op.account_id=a.id
  LEFT JOIN admin_profiles ap ON ap.account_id=a.id`;
export const summaryDto = (r: SummaryRow) => ({
  id: r.id,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  email: r.email,
  role: r.role,
  status: r.status,
  displayName: r.display_name,
  cityId: r.city_id,
  lastLoginAt: r.last_login_at,
});
async function summary(client: PoolClient, id: string) {
  return summaryDto((await client.query<SummaryRow>(`${summarySql} WHERE a.id=$1`, [id])).rows[0]);
}
async function detail(client: PoolClient, id: string, role: Target) {
  return { account: await summary(client, id), profile: await profile(client, { id, role }) };
}
/** Loads and locks a user or organizer; administrators and unknown identifiers look like missing records. */
async function lockTarget(client: PoolClient, id: string, role: Target) {
  z.uuid().parse(id);
  const row = (
    await client.query<{ id: string; status: string; email: string }>(
      "SELECT id,status,email FROM accounts WHERE id=$1 AND role=$2 FOR UPDATE",
      [id, role],
    )
  ).rows[0];
  if (!row) missing(role === "USER" ? "User not found" : "Organizer not found");
  return row;
}

const kyivStart = (n: string) => `(${n}::date::timestamp AT TIME ZONE 'Europe/Kyiv')`;
const statuses = z.enum(["ACTIVE", "BLOCKED", "DELETED"]);
const userQuery = z.strictObject({
  ...pagination,
  id: z.uuid().optional(),
  search: z.string().trim().max(100).optional(),
  cityId: z.uuid().optional(),
  status: statuses.optional(),
  registeredFrom: z.iso.date().optional(),
  registeredTo: z.iso.date().optional(),
  sort: z.enum(["newest", "oldest"]).default("newest"),
});
const organizerQuery = z.strictObject({
  ...pagination,
  id: z.uuid().optional(),
  name: z.string().trim().max(100).optional(),
  type: z.enum(["TRAINER", "CLUB", "VENUE", "ORGANIZER"]).optional(),
  cityId: z.uuid().optional(),
  directionId: z.uuid().optional(),
  status: statuses.optional(),
  sort: z.enum(["newest", "oldest"]).default("newest"),
});

export function listAccounts(request: Request, role: Target) {
  const q = (role === "USER" ? userQuery : organizerQuery).parse(
    Object.fromEntries(new URL(request.url).searchParams),
  ) as z.infer<typeof userQuery> & z.infer<typeof organizerQuery>;
  return access(
    request,
    async (client) => {
      const values: unknown[] = [role];
      const bind = (v: unknown) => {
        values.push(v);
        return `$${values.length}`;
      };
      const where = ["a.role=$1"];
      if (q.id) where.push(`a.id=${bind(q.id)}`);
      if (q.status) where.push(`a.status=${bind(q.status)}`);
      if (q.cityId) where.push(`coalesce(up.city_id,op.city_id)=${bind(q.cityId)}`);
      if (role === "USER") {
        if (q.search) {
          const term = bind(q.search);
          where.push(
            `(strpos(lower(up.first_name||' '||up.last_name),lower(${term}))>0 OR strpos(lower(a.email),lower(${term}))>0 OR strpos(replace(up.phone,' ',''),replace(${term},' ',''))>0)`,
          );
        }
        if (q.registeredFrom && q.registeredTo && q.registeredFrom > q.registeredTo)
          invalid("registeredTo", "End date must follow start date");
        if (q.registeredFrom) where.push(`a.created_at>=${kyivStart(bind(q.registeredFrom))}`);
        if (q.registeredTo) where.push(`a.created_at<(${kyivStart(bind(q.registeredTo))}+interval '1 day')`);
      } else {
        if (q.name) where.push(`strpos(lower(op.name),lower(${bind(q.name)}))>0`);
        if (q.type) where.push(`op.type=${bind(q.type)}`);
        if (q.directionId)
          where.push(
            `EXISTS(SELECT 1 FROM profile_directions d WHERE d.account_id=a.id AND d.direction_id=${bind(q.directionId)})`,
          );
      }
      const from = `${summarySql} WHERE ${where.join(" AND ")}`;
      const total = Number(
        (await client.query(`SELECT count(*) FROM (${from}) x`, values)).rows[0].count,
      );
      const rows = (
        await client.query<SummaryRow>(
          `${from} ORDER BY a.created_at ${q.sort === "newest" ? "DESC" : "ASC"},a.id LIMIT ${bind(q.pageSize)} OFFSET ${bind((q.page - 1) * q.pageSize)}`,
          values,
        )
      ).rows;
      return Response.json(page(rows.map(summaryDto), total, q.page, q.pageSize));
    },
    ["ADMIN"],
  );
}

export function getAccount(request: Request, id: string, role: Target) {
  z.uuid().parse(id);
  return access(
    request,
    async (client) => {
      if (!(await client.query("SELECT 1 FROM accounts WHERE id=$1 AND role=$2", [id, role])).rowCount)
        missing(role === "USER" ? "User not found" : "Organizer not found");
      return Response.json(await detail(client, id, role));
    },
    ["ADMIN"],
  );
}

const editSchemas = {
  USER: profileSchemas.USER.omit({ photoId: true, preferredDirectionIds: true }),
  ORGANIZER: profileSchemas.ORGANIZER.omit({ logoId: true }),
};
const notifyOrganizer = (
  client: PoolClient,
  id: string,
  key: string,
  type: string,
  title: string,
  body: string,
) =>
  notify(client, {
    accountId: id,
    key,
    type,
    category: "ACCOUNT",
    title,
    body,
    link: "/profile",
  });

export async function editAccount(request: Request, id: string, role: Target) {
  const input = editSchemas[role].parse(await jsonBody(request));
  if (!Object.keys(input).length) invalid("form", "Change at least one field");
  return access(
    request,
    async (client, admin) => {
      const target = await lockTarget(client, id, role);
      if (target.status === "DELETED") conflict("A deleted account cannot be edited");
      await applyProfile(client, { id, role }, input);
      const entry = await audit(client, admin.id, `${role}_EDIT`, role, id, null, { fields: Object.keys(input) });
      if (role === "ORGANIZER")
        await notifyOrganizer(
          client,
          id,
          `account:${id}:edited:${entry}`,
          "ACCOUNT_EDITED_BY_ADMIN",
          "An administrator updated your details",
          `Changed: ${Object.keys(input).join(", ")}.`,
        );
      return Response.json(await detail(client, id, role));
    },
    ["ADMIN"],
    true,
  );
}

export async function setAccountStatus(request: Request, id: string, role: Target) {
  const input = statusInput.parse(await jsonBody(request));
  return access(
    request,
    async (client, admin) => {
      const target = await lockTarget(client, id, role);
      if (target.status === "DELETED") conflict("A deleted account cannot be blocked or unblocked");
      if (target.status !== input.status) {
        // Blocking revokes every session through a database trigger; existing bookings are kept.
        await client.query("UPDATE accounts SET status=$2,updated_at=now() WHERE id=$1", [id, input.status]);
        const entry = await audit(
          client,
          admin.id,
          `${role}_${input.status === "BLOCKED" ? "BLOCK" : "UNBLOCK"}`,
          role,
          id,
          input.reason,
        );
        if (role === "ORGANIZER")
          await notifyOrganizer(
            client,
            id,
            `account:${id}:${input.status}:${entry}`,
            input.status === "BLOCKED" ? "ACCOUNT_BLOCKED" : "ACCOUNT_RESTORED",
            input.status === "BLOCKED" ? "Your account was blocked" : "Your account was restored",
            input.status === "BLOCKED"
              ? `Your events are hidden and new bookings are paused; existing bookings continue. Reason: ${input.reason}`
              : `You can sign in again and your events are visible. Note: ${input.reason}`,
          );
      }
      return Response.json(await detail(client, id, role));
    },
    ["ADMIN"],
    true,
  );
}

const whoAdmin = (id: string) => ({ id, role: "ADMIN" });
async function cancelUserBookings(client: PoolClient, userId: string, adminId: string, why: string) {
  const bookings = (
    await client.query<{ id: string }>(
      "SELECT b.id FROM bookings b JOIN event_sessions s ON s.id=b.session_id WHERE b.user_id=$1 AND b.status=ANY($2::text[]) ORDER BY s.event_id,s.id,b.id",
      [userId, activeStatuses],
    )
  ).rows;
  for (const row of bookings) {
    const { booking, event, session } = await lockBooking(client, row.id);
    if (activeStatuses.includes(booking.status))
      await transition(client, booking, event, session, "CANCELLED", whoAdmin(adminId), why);
  }
  return bookings.length;
}
async function cancelOrganizerEvents(client: PoolClient, organizerId: string, adminId: string, why: string) {
  // Only events that still have a future session or an active booking change state; finished history is untouched.
  const events = (
    await client.query<{ id: string }>(
      `SELECT e.id FROM events e WHERE e.organizer_id=$1 AND e.status NOT IN ('CANCELLED','DELETED') AND (
         EXISTS(SELECT 1 FROM event_sessions s WHERE s.event_id=e.id AND s.status='SCHEDULED' AND s.ends_at>now())
         OR EXISTS(SELECT 1 FROM bookings b JOIN event_sessions s ON s.id=b.session_id WHERE s.event_id=e.id AND b.status=ANY($2::text[])))
       ORDER BY e.id`,
      [organizerId, activeStatuses],
    )
  ).rows;
  for (const row of events) {
    const event = await eventRow(client, row.id, undefined, true);
    await cancelEventCascade(client, event, whoAdmin(adminId), why, "CANCELLED");
  }
  await client.query(
    "UPDATE subscription_plans SET status='ARCHIVED',updated_at=clock_timestamp() WHERE organizer_id=$1 AND status='ACTIVE'",
    [organizerId],
  );
  return events.length;
}

export async function deleteAccount(request: Request, id: string, role: Target) {
  const input = reason.parse(await jsonBody(request));
  return access(
    request,
    async (client, admin) =>
      idempotent(client, admin, request, `deleteAccount:${id}`, input, async () => {
        const target = await lockTarget(client, id, role);
        if (target.status === "DELETED") return { status: 204, body: null };
        const why = `The ${role === "USER" ? "account" : "organizer account"} was removed by an administrator. ${input.reason}`;
        const cancelled =
          role === "USER"
            ? await cancelUserBookings(client, id, admin.id, why)
            : await cancelOrganizerEvents(client, id, admin.id, why);
        // The status trigger revokes sessions; bookings, payments, points and chats remain as history.
        await client.query("UPDATE accounts SET status='DELETED',updated_at=now() WHERE id=$1", [id]);
        const entry = await audit(client, admin.id, `${role}_DELETE`, role, id, input.reason, { cancelled });
        if (role === "ORGANIZER")
          await notifyOrganizer(
            client,
            id,
            `account:${id}:deleted:${entry}`,
            "ACCOUNT_DELETED",
            "Your account was removed",
            `An administrator removed your account. Active bookings were cancelled and refunded. Reason: ${input.reason}`,
          );
        return { status: 204, body: null };
      }),
    ["ADMIN"],
    true,
  );
}
