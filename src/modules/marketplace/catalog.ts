import { z } from "zod";
import type { PoolClient } from "pg";
import type { Actor } from "../accounts/security";
import { jsonBody, invalid } from "../accounts/http";
import { access, conflict, idempotent, missing, notify, page } from "./core";
import {
  eventCreate,
  eventPatch,
  eventQuery,
  organizerQuery,
  sessionInput,
  sessionQuery,
  reason,
} from "./validation";
import type { EventRow, SessionRow } from "./types";

import { cancelSessionBookings, notifyChanged } from "./bookings";
export const occupancy =
  "(SELECT coalesce(sum(b.seats),0) FROM bookings b WHERE b.session_id=s.id AND b.status IN ('PENDING','AWAITING_PAYMENT','CONFIRMED'))";
export async function eventRow(
  client: PoolClient,
  id: string,
  current?: Actor,
  lock = false,
) {
  z.uuid().parse(id);
  const row = (
    await client.query<EventRow>(
      `SELECT * FROM events WHERE id=$1 ${lock ? "FOR UPDATE" : ""}`,
      [id],
    )
  ).rows[0];
  if (
    !row ||
    (current && current.role !== "ADMIN" && row.organizer_id !== current.id)
  )
    missing("Event not found");
  return row;
}
export async function visibleEvent(
  client: PoolClient,
  id: string,
  current: Actor,
) {
  const row = await eventRow(client, id);
  if (current.role === "ADMIN" || current.id === row.organizer_id) return row;
  if (
    current.role === "USER" &&
    (
      await client.query(
        "SELECT b.id FROM bookings b JOIN event_sessions s ON s.id=b.session_id WHERE b.user_id=$1 AND s.event_id=$2 LIMIT 1",
        [current.id, id],
      )
    ).rowCount
  )
    return row;
  if (
    row.status !== "ACTIVE" ||
    !(
      await client.query(
        "SELECT id FROM accounts WHERE id=$1 AND status='ACTIVE'",
        [row.organizer_id],
      )
    ).rowCount
  )
    missing("Event is unavailable");
  return row;
}
export async function organizerDto(
  client: PoolClient,
  id: string,
  includeInactive = false,
) {
  const row = (
    await client.query(
      "SELECT a.id,a.created_at,a.updated_at,a.status,p.*,json_build_object('id',c.id,'name',c.name,'isActive',c.is_active) AS city FROM accounts a JOIN organizer_profiles p ON p.account_id=a.id JOIN cities c ON c.id=p.city_id WHERE a.id=$1",
      [id],
    )
  ).rows[0];
  if (!row || (!includeInactive && row.status !== "ACTIVE"))
    missing("Organizer not found");
  const directions = (
    await client.query(
      'SELECT d.id,d.name,d.is_active AS "isActive" FROM directions d JOIN profile_directions p ON p.direction_id=d.id WHERE p.account_id=$1 ORDER BY d.name',
      [id],
    )
  ).rows;
  return {
    id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    name: row.name,
    type: row.type,
    city: row.city,
    directions,
    description: row.description,
    phone: row.phone,
    logoUrl: row.logo_id ? `/api/organizers/${id}/logo` : null,
  };
}
export async function sessionDto(
  client: PoolClient,
  s: SessionRow,
  kind: string,
) {
  const count = Number(
    (
      await client.query(
        `SELECT ${occupancy} AS taken FROM event_sessions s WHERE s.id=$1`,
        [s.id],
      )
    ).rows[0].taken,
  );
  const taken = kind === "HALL_RENTAL" && count > 0 ? s.seats_total : count;
  return {
    id: s.id,
    eventId: s.event_id,
    startsAt: s.starts_at,
    endsAt: s.ends_at,
    status: s.status,
    seatsTotal: s.seats_total,
    seatsTaken: taken,
    seatsAvailable: Math.max(0, s.seats_total - taken),
    createdAt: s.created_at,
    updatedAt: s.updated_at,
  };
}
export async function eventDto(
  client: PoolClient,
  e: EventRow,
  nextId?: string,
) {
  const dictionaries = (
    await client.query(
      "SELECT json_build_object('id',c.id,'name',c.name,'isActive',c.is_active) AS city,json_build_object('id',d.id,'name',d.name,'isActive',d.is_active) AS direction FROM cities c,directions d WHERE c.id=$1 AND d.id=$2",
      [e.city_id, e.direction_id],
    )
  ).rows[0];
  const photos = (
    await client.query(
      "SELECT id,position FROM event_photos WHERE event_id=$1 ORDER BY position",
      [e.id],
    )
  ).rows.map((photo) => ({
    id: photo.id,
    url: `/api/event-photos/${photo.id}`,
    position: photo.position,
  }));
  const next = (
    await client.query<SessionRow>(
      `SELECT s.* FROM event_sessions s WHERE s.event_id=$1 AND NOT s.is_deleted AND s.status='SCHEDULED' AND s.starts_at>now() AND ($2::uuid IS NULL OR s.id=$2) ORDER BY CASE WHEN ${occupancy}<CASE WHEN $3='HALL_RENTAL' THEN 1 ELSE s.seats_total END THEN 0 ELSE 1 END,s.starts_at,s.id LIMIT 1`,
      [e.id, nextId ?? null, e.kind],
    )
  ).rows[0];
  const isFull = !(
    await client.query(
      `SELECT s.id FROM event_sessions s WHERE s.event_id=$1 AND NOT s.is_deleted AND s.status='SCHEDULED' AND s.starts_at>now() AND ${occupancy}<CASE WHEN $2='HALL_RENTAL' THEN 1 ELSE s.seats_total END LIMIT 1`,
      [e.id, e.kind],
    )
  ).rowCount;
  const effective =
    e.promo_price_minor !== null && e.promo_until && e.promo_until > new Date()
      ? e.promo_price_minor
      : e.price_minor;
  return {
    id: e.id,
    createdAt: e.created_at,
    updatedAt: e.updated_at,
    organizer: await organizerDto(client, e.organizer_id, true),
    title: e.title,
    description: e.description,
    kind: e.kind,
    ...dictionaries,
    address: e.address,
    skill: e.skill,
    age: e.age,
    priceMinor: e.price_minor,
    promoPriceMinor: e.promo_price_minor,
    promoUntil: e.promo_until,
    effectivePriceMinor: effective,
    seatsPerSession: e.seats_per_session,
    confirmationMode: e.confirmation_mode,
    photos,
    status: e.status,
    nextSession: next ? await sessionDto(client, next, e.kind) : null,
    isFull: isFull && !!next,
    isCompleted: !next,
    trainerName: e.trainer_name,
  };
}
export function listEvents(
  request: Request,
  owned = false,
  recommended = false,
) {
  const query = eventQuery.parse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  return access(
    request,
    async (client, current) => {
      const values: unknown[] = [];
      const bind = (value: unknown) => {
        values.push(value);
        return `$${values.length}`;
      };
      const clauses: string[] = [];
      if (owned) clauses.push(`e.organizer_id=${bind(current.id)}`);
      else clauses.push("e.status='ACTIVE'", "a.status='ACTIVE'");
      if (query.id) clauses.push(`e.id=${bind(query.id)}`);
      if (query.organizerId)
        clauses.push(`e.organizer_id=${bind(query.organizerId)}`);
      let city = query.cityId;
      if (!city && current.role === "USER" && !owned)
        city = (
          await client.query(
            "SELECT city_id FROM user_profiles WHERE account_id=$1",
            [current.id],
          )
        ).rows[0].city_id;
      if (city && city !== "all") clauses.push(`e.city_id=${bind(city)}`);
      if (query.directionId)
        clauses.push(`e.direction_id=${bind(query.directionId)}`);
      if (query.kind) clauses.push(`e.kind=${bind(query.kind)}`);
      if (query.skill)
        clauses.push(`(e.skill='ANY' OR e.skill=${bind(query.skill)})`);
      if (query.age) clauses.push(`(e.age='ANY' OR e.age=${bind(query.age)})`);
      if (query.title)
        clauses.push(`strpos(lower(e.title),lower(${bind(query.title)}))>0`);
      if (query.trainerName)
        clauses.push(
          `strpos(lower(e.trainer_name),lower(${bind(query.trainerName)}))>0`,
        );
      if (query.status) clauses.push(`e.status=${bind(query.status)}`);
      const price =
        "CASE WHEN e.promo_price_minor IS NOT NULL AND e.promo_until>now() THEN e.promo_price_minor ELSE e.price_minor END";
      if (query.minPriceMinor !== undefined)
        clauses.push(`(${price})>=${bind(query.minPriceMinor)}`);
      if (query.maxPriceMinor !== undefined)
        clauses.push(`(${price})<=${bind(query.maxPriceMinor)}`);
      if (query.dateFrom && query.dateTo && query.dateFrom > query.dateTo)
        invalid("dateTo", "End date must follow start date");
      const sessions = [
        "s.event_id=e.id",
        "NOT s.is_deleted",
        "s.status='SCHEDULED'",
        ...(!owned ? ["s.starts_at>now()"] : []),
      ];
      if (query.dateFrom)
        sessions.push(
          `s.starts_at>=(${bind(query.dateFrom)}::date::timestamp AT TIME ZONE 'Europe/Kyiv')`,
        );
      if (query.dateTo)
        sessions.push(
          `s.starts_at<((${bind(query.dateTo)}::date+1)::timestamp AT TIME ZONE 'Europe/Kyiv')`,
        );
      if (query.availableOnly === "true")
        sessions.push(
          `${occupancy}<CASE WHEN e.kind='HALL_RENTAL' THEN 1 ELSE s.seats_total END`,
        );
      const lateral = `LEFT JOIN LATERAL(SELECT s.id,s.starts_at FROM event_sessions s WHERE ${sessions.join(" AND ")} ORDER BY CASE WHEN ${occupancy}<CASE WHEN e.kind='HALL_RENTAL' THEN 1 ELSE s.seats_total END THEN 0 ELSE 1 END,s.starts_at,s.id LIMIT 1) next ON true`;
      if (
        !owned ||
        query.dateFrom ||
        query.dateTo ||
        query.availableOnly === "true"
      )
        clauses.push("next.id IS NOT NULL");
      let popularityFallback = false;
      if (recommended) {
        const preferences = await client.query(
          "SELECT direction_id FROM profile_directions WHERE account_id=$1",
          [current.id],
        );
        popularityFallback = !preferences.rowCount;
        if (preferences.rowCount)
          clauses.push(
            `e.direction_id=ANY(${bind(preferences.rows.map((row) => row.direction_id))}::uuid[])`,
          );
      }
      const from = `FROM events e JOIN accounts a ON a.id=e.organizer_id ${lateral} WHERE ${clauses.length ? clauses.join(" AND ") : "true"}`;
      const total = Number(
        (await client.query(`SELECT count(*) ${from}`, values)).rows[0].count,
      );
      const sort = popularityFallback
        ? "(SELECT count(*) FROM bookings b JOIN event_sessions s ON s.id=b.session_id WHERE s.event_id=e.id) DESC,next.starts_at ASC"
        : query.sort === "priceAsc"
          ? `(${price}) ASC`
          : query.sort === "priceDesc"
            ? `(${price}) DESC`
            : query.sort === "newest"
              ? "e.created_at DESC"
              : "next.starts_at ASC NULLS LAST";
      const rows = (
        await client.query<EventRow & { next_id: string }>(
          `SELECT e.*,next.id AS next_id ${from} ORDER BY ${sort},e.id LIMIT ${bind(query.pageSize)} OFFSET ${bind((query.page - 1) * query.pageSize)}`,
          values,
        )
      ).rows;
      const items = [];
      for (const row of rows)
        items.push(await eventDto(client, row, row.next_id ?? undefined));
      return Response.json(page(items, total, query.page, query.pageSize));
    },
    owned ? ["ORGANIZER"] : recommended ? ["USER"] : undefined,
  );
}
export function getEvent(
  request: Request,
  id: string,
  owned = false,
  admin = false,
) {
  return access(
    request,
    async (client, current) =>
      Response.json(
        await eventDto(
          client,
          owned || admin
            ? await eventRow(client, id, current)
            : await visibleEvent(client, id, current),
        ),
      ),
    admin ? ["ADMIN"] : owned ? ["ORGANIZER"] : undefined,
  );
}
async function activeDictionaries(
  client: PoolClient,
  cityId: string | undefined,
  directionId: string | undefined,
) {
  for (const [table, id, field] of [
    ["cities", cityId, "cityId"],
    ["directions", directionId, "directionId"],
  ] as const)
    if (
      id &&
      !(
        await client.query(
          `SELECT id FROM ${table} WHERE id=$1 AND is_active FOR SHARE`,
          [id],
        )
      ).rowCount
    )
      invalid(field, "Choose an active dictionary value");
}
async function validateSession(
  client: PoolClient,
  eventId: string,
  input: z.infer<typeof sessionInput>,
  exclude?: string,
) {
  if (new Date(input.startsAt) <= new Date())
    invalid("startsAt", "Start must be in the future");
  if (new Date(input.endsAt) <= new Date(input.startsAt))
    invalid("endsAt", "End must follow start");
  if (
    (
      await client.query(
        "SELECT id FROM event_sessions WHERE event_id=$1 AND status='SCHEDULED' AND NOT is_deleted AND ($4::uuid IS NULL OR id<>$4) AND starts_at<$3 AND ends_at>$2 LIMIT 1",
        [eventId, input.startsAt, input.endsAt, exclude ?? null],
      )
    ).rowCount
  )
    invalid("sessions", "Sessions must not overlap");
}
function validatePromo(
  price: number,
  promo: number | null,
  until: Date | string | null,
) {
  if ((promo === null) !== (until === null))
    invalid("promoPriceMinor", "Provide both a promotion price and end date");
  if (promo !== null && promo >= price)
    invalid("promoPriceMinor", "Promotion price must be below regular price");
}
export async function createEvent(request: Request) {
  const input = eventCreate.parse(await jsonBody(request));
  return access(
    request,
    async (client, current) =>
      idempotent(client, current, request, "createEvent", input, async () => {
        await activeDictionaries(client, input.cityId, input.directionId);
        validatePromo(
          input.priceMinor,
          input.promoPriceMinor ?? null,
          input.promoUntil ?? null,
        );
        const mode =
          input.confirmationMode ??
          (["HALL_RENTAL", "TEAM_SEARCH"].includes(input.kind)
            ? "MANUAL"
            : "AUTO");
        const row = (
          await client.query<EventRow>(
            "INSERT INTO events(organizer_id,title,description,kind,direction_id,city_id,address,skill,age,price_minor,promo_price_minor,promo_until,seats_per_session,confirmation_mode,trainer_name) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *",
            [
              current.id,
              input.title,
              input.description,
              input.kind,
              input.directionId,
              input.cityId,
              input.address,
              input.skill,
              input.age,
              input.priceMinor,
              input.promoPriceMinor ?? null,
              input.promoUntil ?? null,
              input.seatsPerSession,
              mode,
              input.trainerName ?? "",
            ],
          )
        ).rows[0];
        for (const session of input.sessions) {
          await validateSession(client, row.id, session);
          await client.query(
            "INSERT INTO event_sessions(event_id,starts_at,ends_at,seats_total) VALUES($1,$2,$3,$4)",
            [row.id, session.startsAt, session.endsAt, session.seatsTotal],
          );
        }
        await notify(client, {
          accountId: current.id,
          key: `event:${row.id}:created:owner`,
          type: "EVENT_CREATED",
          title: "Your event is published",
          body: row.title,
          link: `/organizer/events/${row.id}`,
        });
        await targetPromotion(client, row, "created");
        return { status: 201, body: await eventDto(client, row) };
      }),
    ["ORGANIZER"],
    true,
  );
}
async function targetPromotion(
  client: PoolClient,
  e: EventRow,
  version: string,
) {
  const users = (
    await client.query(
      "SELECT p.account_id FROM user_profiles p JOIN accounts a ON a.id=p.account_id WHERE a.status='ACTIVE' AND p.city_id=$1 AND EXISTS(SELECT 1 FROM profile_directions d WHERE d.account_id=p.account_id AND d.direction_id=$2)",
      [e.city_id, e.direction_id],
    )
  ).rows;
  for (const user of users)
    await notify(client, {
      accountId: user.account_id,
      key: `event:${e.id}:${version}:${user.account_id}`,
      type: version === "created" ? "NEW_EVENT" : "NEW_PROMOTION",
      category: "PROMOTIONS",
      title:
        version === "created"
          ? "A new activity for you"
          : "A new activity offer",
      body: e.title,
      link: `/events/${e.id}`,
    });
}
export async function updateEvent(request: Request, id: string, admin = false) {
  const input = eventPatch.parse(await jsonBody(request));
  return access(
    request,
    async (client, current) => {
      const old = await eventRow(client, id, current, true);
      if (!["ACTIVE", "PAUSED", "BLOCKED"].includes(old.status))
        conflict("This event can no longer be edited");
      await activeDictionaries(
        client,
        input.cityId !== old.city_id ? input.cityId : undefined,
        input.directionId !== old.direction_id ? input.directionId : undefined,
      );
      validatePromo(
        input.priceMinor ?? old.price_minor,
        input.promoPriceMinor === undefined
          ? old.promo_price_minor
          : input.promoPriceMinor,
        input.promoUntil === undefined ? old.promo_until : input.promoUntil,
      );
      const booked = !!(
        await client.query(
          "SELECT b.id FROM bookings b JOIN event_sessions s ON s.id=b.session_id WHERE s.event_id=$1 AND b.status IN ('PENDING','AWAITING_PAYMENT','CONFIRMED') LIMIT 1",
          [id],
        )
      ).rowCount;
      if (
        booked &&
        ((input.cityId && input.cityId !== old.city_id) ||
          (input.directionId && input.directionId !== old.direction_id))
      )
        conflict("City and direction cannot change with active bookings");
      if (
        input.seatsPerSession !== undefined &&
        (
          await client.query(
            `SELECT s.id FROM event_sessions s WHERE s.event_id=$1 AND s.status='SCHEDULED' AND s.starts_at>now() AND ${occupancy}>$2 LIMIT 1`,
            [id, input.seatsPerSession],
          )
        ).rowCount
      )
        conflict("Capacity cannot be below reserved places");
      const columns: Record<string, string> = {
        title: "title",
        description: "description",
        directionId: "direction_id",
        cityId: "city_id",
        address: "address",
        skill: "skill",
        age: "age",
        priceMinor: "price_minor",
        promoPriceMinor: "promo_price_minor",
        promoUntil: "promo_until",
        seatsPerSession: "seats_per_session",
        confirmationMode: "confirmation_mode",
        trainerName: "trainer_name",
      };
      const entries = Object.entries(input);
      const values = entries.map(([, v]) => v);
      const row = (
        await client.query<EventRow>(
          `UPDATE events SET ${entries.map(([k], i) => `${columns[k]}=$${i + 1}`).join(",")},address_version=address_version+${input.address && input.address !== old.address ? 1 : 0},updated_at=now() WHERE id=$${values.length + 1} RETURNING *`,
          [...values, id],
        )
      ).rows[0];
      if (input.address && input.address !== old.address)
        await notifyChanged(client, row);
      if (input.seatsPerSession !== undefined)
        await client.query(
          "UPDATE event_sessions SET seats_total=$1,updated_at=now() WHERE event_id=$2 AND status='SCHEDULED' AND starts_at>now()",
          [input.seatsPerSession, id],
        );
      if (
        (input.promoPriceMinor !== undefined ||
          input.promoUntil !== undefined) &&
        row.promo_price_minor !== null &&
        row.promo_until &&
        row.promo_until > new Date()
      )
        await targetPromotion(
          client,
          row,
          `promotion:${row.updated_at.toISOString()}`,
        );
      return Response.json(await eventDto(client, row));
    },
    admin ? ["ADMIN"] : ["ORGANIZER"],
    true,
  );
}
export async function setEventStatus(
  request: Request,
  id: string,
  admin = false,
) {
  const input = z
    .strictObject({
      status: z.enum(admin ? ["ACTIVE", "BLOCKED"] : ["ACTIVE", "PAUSED"]),
      reason: z.string().trim().min(1).max(500).optional(),
    })
    .parse(await jsonBody(request));
  return access(
    request,
    async (client, current) => {
      const row = await eventRow(client, id, current, true);
      if (["CANCELLED", "DELETED"].includes(row.status))
        conflict("A cancelled or deleted event cannot be resumed");
      if (!admin && row.status === "BLOCKED")
        conflict("Only an administrator can unblock this event");
      const updated = (
        await client.query<EventRow>(
          "UPDATE events SET status=$1,updated_at=now() WHERE id=$2 RETURNING *",
          [input.status, id],
        )
      ).rows[0];
      if (admin && row.status !== updated.status)
        await notify(client, {
          accountId: row.organizer_id,
          key: `event:${row.id}:moderated:${updated.updated_at.toISOString()}`,
          type: "EVENT_MODERATED",
          title: "Event publishing status changed",
          body: `${row.title}: ${updated.status.toLowerCase()}${input.reason ? `. ${input.reason}` : ""}`,
          link: `/organizer/events/${row.id}`,
        });
      return Response.json(await eventDto(client, updated));
    },
    admin ? ["ADMIN"] : ["ORGANIZER"],
    true,
  );
}
export async function cancelEvent(
  request: Request,
  id: string,
  remove = false,
  admin = false,
) {
  const input = reason.parse(await jsonBody(request));
  return access(
    request,
    async (client, current) =>
      idempotent(
        client,
        current,
        request,
        `${remove ? "delete" : "cancel"}Event:${id}`,
        input,
        async () => {
          const row = await eventRow(client, id, current, true);
          if (row.status !== "DELETED")
            await client.query(
              "UPDATE events SET status=$1,updated_at=now() WHERE id=$2",
              [remove ? "DELETED" : "CANCELLED", id],
            );
          const sessions = (
            await client.query<SessionRow>(
              "SELECT * FROM event_sessions WHERE event_id=$1 ORDER BY id FOR UPDATE",
              [id],
            )
          ).rows;
          for (const s of sessions)
            await cancelSessionBookings(
              client,
              row,
              s,
              { id: current.id, role: current.role },
              input.reason,
            );
          await client.query(
            "UPDATE event_sessions SET status='CANCELLED',updated_at=now() WHERE event_id=$1 AND status='SCHEDULED'",
            [id],
          );
          return {
            status: remove ? 204 : 200,
            body: remove
              ? null
              : await eventDto(client, await eventRow(client, id)),
          };
        },
      ),
    admin ? ["ADMIN"] : ["ORGANIZER"],
    true,
  );
}
export function listSessions(request: Request, id?: string, owned = false) {
  const query = sessionQuery.parse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  return access(
    request,
    async (client, current) => {
      let event: EventRow | undefined;
      if (id)
        event = owned
          ? await eventRow(client, id, current)
          : await visibleEvent(client, id, current);
      const values: unknown[] = [];
      const bind = (v: unknown) => {
        values.push(v);
        return `$${values.length}`;
      };
      const where = ["NOT s.is_deleted"];
      if (id) where.push(`s.event_id=${bind(id)}`);
      if (query.eventId) where.push(`s.event_id=${bind(query.eventId)}`);
      if (owned) where.push(`e.organizer_id=${bind(current.id)}`);
      else where.push("s.status='SCHEDULED'", "s.starts_at>now()");
      if (query.status) where.push(`s.status=${bind(query.status)}`);
      if (query.dateFrom)
        where.push(
          `s.starts_at>=(${bind(query.dateFrom)}::date::timestamp AT TIME ZONE 'Europe/Kyiv')`,
        );
      if (query.dateTo)
        where.push(
          `s.starts_at<((${bind(query.dateTo)}::date+1)::timestamp AT TIME ZONE 'Europe/Kyiv')`,
        );
      const from = `FROM event_sessions s JOIN events e ON e.id=s.event_id WHERE ${where.join(" AND ")}`;
      const total = Number(
        (await client.query(`SELECT count(*) ${from}`, values)).rows[0].count,
      );
      const rows = (
        await client.query<SessionRow & { kind: string }>(
          `SELECT s.*,e.kind ${from} ORDER BY s.starts_at ${["oldest", "startsAtAsc"].includes(query.sort) ? "ASC" : "DESC"},s.id LIMIT ${bind(query.pageSize)} OFFSET ${bind((query.page - 1) * query.pageSize)}`,
          values,
        )
      ).rows;
      const items = [];
      for (const row of rows)
        items.push(await sessionDto(client, row, event?.kind ?? row.kind));
      return Response.json(page(items, total, query.page, query.pageSize));
    },
    owned ? ["ORGANIZER"] : undefined,
  );
}
export async function createSession(request: Request, id: string) {
  const input = sessionInput.parse(await jsonBody(request));
  return access(
    request,
    async (client, current) =>
      idempotent(
        client,
        current,
        request,
        `createSession:${id}`,
        input,
        async () => {
          const e = await eventRow(client, id, current, true);
          if (!["ACTIVE", "PAUSED"].includes(e.status))
            conflict("This event cannot accept sessions");
          if (
            Number(
              (
                await client.query(
                  "SELECT count(*) FROM event_sessions WHERE event_id=$1 AND NOT is_deleted",
                  [id],
                )
              ).rows[0].count,
            ) >= 60
          )
            invalid("sessions", "An event may have at most 60 sessions");
          await validateSession(client, id, input);
          const s = (
            await client.query<SessionRow>(
              "INSERT INTO event_sessions(event_id,starts_at,ends_at,seats_total) VALUES($1,$2,$3,$4) RETURNING *",
              [id, input.startsAt, input.endsAt, input.seatsTotal],
            )
          ).rows[0];
          return { status: 201, body: await sessionDto(client, s, e.kind) };
        },
      ),
    ["ORGANIZER"],
    true,
  );
}
export async function sessionEventId(client: PoolClient, id: string) {
  z.uuid().parse(id);
  const row = (
    await client.query(
      "SELECT event_id FROM event_sessions WHERE id=$1 AND NOT is_deleted",
      [id],
    )
  ).rows[0];
  if (!row) missing("Session not found");
  return row.event_id as string;
}
export async function updateSession(request: Request, id: string) {
  const input = sessionInput.parse(await jsonBody(request));
  return access(
    request,
    async (client, current) => {
      const e = await eventRow(
        client,
        await sessionEventId(client, id),
        current,
        true,
      );
      const old = (
        await client.query<SessionRow>(
          "SELECT * FROM event_sessions WHERE id=$1 FOR UPDATE",
          [id],
        )
      ).rows[0];
      if (old.status !== "SCHEDULED")
        conflict("Only scheduled sessions may be edited");
      if (
        (
          await client.query(
            `SELECT s.id FROM event_sessions s WHERE s.id=$1 AND ${occupancy}>$2`,
            [id, input.seatsTotal],
          )
        ).rowCount
      )
        conflict("Capacity cannot be below reserved places");
      await validateSession(client, e.id, input, id);
      const changed =
        old.starts_at.toISOString() !==
          new Date(input.startsAt).toISOString() ||
        old.ends_at.toISOString() !== new Date(input.endsAt).toISOString();
      const s = (
        await client.query<SessionRow>(
          "UPDATE event_sessions SET starts_at=$1,ends_at=$2,seats_total=$3,time_version=time_version+$4,updated_at=now() WHERE id=$5 RETURNING *",
          [input.startsAt, input.endsAt, input.seatsTotal, changed ? 1 : 0, id],
        )
      ).rows[0];
      if (changed) await notifyChanged(client, e, s);
      return Response.json(await sessionDto(client, s, e.kind));
    },
    ["ORGANIZER"],
    true,
  );
}
export async function cancelSession(
  request: Request,
  id: string,
  remove = false,
) {
  const input = remove ? {} : reason.parse(await jsonBody(request));
  return access(
    request,
    async (client, current) => {
      const action = async () => {
        const e = await eventRow(
          client,
          await sessionEventId(client, id),
          current,
          true,
        );
        const before = (
          await client.query<SessionRow>(
            "SELECT * FROM event_sessions WHERE id=$1 FOR UPDATE",
            [id],
          )
        ).rows[0];
        if (
          remove &&
          (
            await client.query(
              `SELECT s.id FROM event_sessions s WHERE s.id=$1 AND ${occupancy}>0`,
              [id],
            )
          ).rowCount
        )
          conflict("Cancel active bookings before removing a session");
        if (!remove)
          await cancelSessionBookings(
            client,
            e,
            before,
            { id: current.id, role: current.role },
            "reason" in input ? (input.reason as string) : "Session cancelled",
          );
        const s = (
          await client.query<SessionRow>(
            `UPDATE event_sessions SET ${remove ? "is_deleted=true" : "status='CANCELLED'"},updated_at=now() WHERE id=$1 RETURNING *`,
            [id],
          )
        ).rows[0];
        return {
          status: remove ? 204 : 200,
          body: remove ? null : await sessionDto(client, s, e.kind),
        };
      };
      return remove
        ? new Response(null, { status: (await action()).status })
        : idempotent(
            client,
            current,
            request,
            `cancelSession:${id}`,
            input,
            action,
          );
    },
    ["ORGANIZER"],
    true,
  );
}
export function listOrganizers(request: Request) {
  const query = organizerQuery.parse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  return access(request, async (client) => {
    const values: unknown[] = [];
    const bind = (v: unknown) => {
      values.push(v);
      return `$${values.length}`;
    };
    const where = ["a.status='ACTIVE'"];
    if (query.name)
      where.push(`strpos(lower(p.name),lower(${bind(query.name)}))>0`);
    if (query.type) where.push(`p.type=${bind(query.type)}`);
    if (query.cityId) where.push(`p.city_id=${bind(query.cityId)}`);
    if (query.directionId)
      where.push(
        `EXISTS(SELECT 1 FROM profile_directions d WHERE d.account_id=a.id AND d.direction_id=${bind(query.directionId)})`,
      );
    const from = `FROM accounts a JOIN organizer_profiles p ON p.account_id=a.id WHERE ${where.join(" AND ")}`;
    const total = Number(
      (await client.query(`SELECT count(*) ${from}`, values)).rows[0].count,
    );
    const rows = (
      await client.query(
        `SELECT a.id ${from} ORDER BY a.created_at ${query.sort === "newest" ? "DESC" : "ASC"},a.id LIMIT ${bind(query.pageSize)} OFFSET ${bind((query.page - 1) * query.pageSize)}`,
        values,
      )
    ).rows;
    const items = [];
    for (const row of rows) items.push(await organizerDto(client, row.id));
    return Response.json(page(items, total, query.page, query.pageSize));
  });
}
export function getOrganizer(request: Request, id: string) {
  z.uuid().parse(id);
  return access(request, async (client) =>
    Response.json(await organizerDto(client, id)),
  );
}
