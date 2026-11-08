// ActiveHub platform statistics for administrators: chosen-period totals and breakdowns (requirements 7.12).
import { z } from "zod";
import type { PoolClient } from "pg";
import { access } from "../marketplace/core";
import { buckets, bucketsWithDays } from "./queries";
import { inKyivRange, ratio, resolveRange, type Range } from "./period";
export const statisticsQuery = z.strictObject({
  period: z.enum(["7d", "30d", "90d", "custom"]).optional(),
  dateFrom: z.iso.date().optional(),
  dateTo: z.iso.date().optional(),
});

export async function platformStatistics(client: PoolClient, range: Range) {
  const from = "$1",
    to = "$2",
    values = [range.dateFrom, range.dateTo];
  const at = (column: string) => inKyivRange(column, from, to);
  const totals = (
    await client.query(
      `SELECT
        (SELECT count(*) FROM accounts WHERE role='USER' AND ${at("created_at")}) AS users,
        (SELECT count(*) FROM accounts WHERE role='ORGANIZER' AND ${at("created_at")}) AS organizers,
        (SELECT count(*) FROM events WHERE status='ACTIVE' AND ${at("created_at")}) AS active_events,
        (SELECT count(*) FROM bookings WHERE ${at("created_at")}) AS bookings,
        (SELECT count(*) FROM bookings b WHERE ${at("b.created_at")} AND EXISTS(
           SELECT 1 FROM booking_history h WHERE h.booking_id=b.id AND h.to_status='CONFIRMED')) AS confirmed,
        (SELECT coalesce(sum(amount_minor),0) FROM payments WHERE status IN ('SUCCEEDED','REFUNDED') AND ${at("created_at")}) AS paid,
        (SELECT coalesce(sum(amount_minor),0) FROM refunds WHERE ${at("created_at")}) AS refunded`,
      values,
    )
  ).rows[0];
  const bookingsAt = `FROM bookings b JOIN event_sessions s ON s.id=b.session_id JOIN events e ON e.id=s.event_id WHERE ${at("b.created_at")}`;
  const eventsAt = `FROM events e WHERE ${at("e.created_at")}`;
  const accountsAt = `FROM accounts a WHERE ${at("a.created_at")}`;
  const usersAt = `FROM accounts a JOIN user_profiles p ON p.account_id=a.id WHERE a.role='USER' AND ${at("a.created_at")}`;
  const [bookingsByDay, bookingsByStatus, bookingsByDirection, bookingsByCity, topEvents] = [
    await bucketsWithDays(client, range.days, `SELECT to_char(b.created_at AT TIME ZONE 'Europe/Kyiv','YYYY-MM-DD') AS key, count(*) AS count ${bookingsAt} GROUP BY 1`, values),
    await buckets(client, `SELECT b.status AS key, count(*) AS count FROM bookings b WHERE ${at("b.created_at")} GROUP BY b.status ORDER BY count DESC, key`, values),
    await buckets(client, `SELECT d.id AS key, d.name AS label, count(*) AS count FROM bookings b JOIN event_sessions s ON s.id=b.session_id JOIN events e ON e.id=s.event_id JOIN directions d ON d.id=e.direction_id WHERE ${at("b.created_at")} GROUP BY d.id,d.name ORDER BY count DESC, label`, values),
    await buckets(client, `SELECT c.id AS key, c.name AS label, count(*) AS count FROM bookings b JOIN event_sessions s ON s.id=b.session_id JOIN events e ON e.id=s.event_id JOIN cities c ON c.id=e.city_id WHERE ${at("b.created_at")} GROUP BY c.id,c.name ORDER BY count DESC, label`, values),
    await buckets(client, `SELECT e.id AS key, e.title AS label, count(*) AS count ${bookingsAt} GROUP BY e.id,e.title ORDER BY count DESC, label, key LIMIT 10`, values),
  ];
  const [eventsByDay, eventsByKind, eventsByDirection, eventsByCity] = [
    await bucketsWithDays(client, range.days, `SELECT to_char(e.created_at AT TIME ZONE 'Europe/Kyiv','YYYY-MM-DD') AS key, count(*) AS count ${eventsAt} GROUP BY 1`, values),
    await buckets(client, `SELECT e.kind AS key, count(*) AS count ${eventsAt} GROUP BY e.kind ORDER BY count DESC, key`, values),
    await buckets(client, `SELECT d.id AS key, d.name AS label, count(*) AS count FROM events e JOIN directions d ON d.id=e.direction_id WHERE ${at("e.created_at")} GROUP BY d.id,d.name ORDER BY count DESC, label`, values),
    await buckets(client, `SELECT c.id AS key, c.name AS label, count(*) AS count FROM events e JOIN cities c ON c.id=e.city_id WHERE ${at("e.created_at")} GROUP BY c.id,c.name ORDER BY count DESC, label`, values),
  ];
  const [registrationsByDay, registrationsByRole, usersByCity, usersByGender, usersByCard] = [
    await bucketsWithDays(client, range.days, `SELECT to_char(a.created_at AT TIME ZONE 'Europe/Kyiv','YYYY-MM-DD') AS key, count(*) AS count ${accountsAt} GROUP BY 1`, values),
    await buckets(client, `SELECT a.role AS key, count(*) AS count ${accountsAt} GROUP BY a.role ORDER BY count DESC, key`, values),
    await buckets(client, `SELECT c.id AS key, c.name AS label, count(*) AS count FROM accounts a JOIN user_profiles p ON p.account_id=a.id JOIN cities c ON c.id=p.city_id WHERE a.role='USER' AND ${at("a.created_at")} GROUP BY c.id,c.name ORDER BY count DESC, label`, values),
    await buckets(client, `SELECT p.gender AS key, count(*) AS count ${usersAt} GROUP BY p.gender ORDER BY count DESC, key`, values),
    await buckets(client, `SELECT p.loyalty_level AS key, count(*) AS count ${usersAt} GROUP BY p.loyalty_level ORDER BY count DESC, key`, values),
  ];
  const paid = Number(totals.paid), refunded = Number(totals.refunded);
  return {
    dateFrom: range.dateFrom,
    dateTo: range.dateTo,
    users: Number(totals.users),
    organizers: Number(totals.organizers),
    activeEvents: Number(totals.active_events),
    bookings: Number(totals.bookings),
    netRevenueMinor: paid - refunded,
    bookingConversion: ratio(Number(totals.confirmed), Number(totals.bookings)),
    bookingsByDay,
    bookingsByStatus,
    bookingsByDirection,
    bookingsByCity,
    topEvents,
    eventsByDay,
    eventsByKind,
    eventsByDirection,
    eventsByCity,
    registrationsByDay,
    registrationsByRole,
    usersByCity,
    usersByGender,
    usersByCard,
  };
}

export function getStatistics(request: Request) {
  const input = statisticsQuery.parse(Object.fromEntries(new URL(request.url).searchParams));
  return access(
    request,
    async (client) => Response.json(await platformStatistics(client, resolveRange(input))),
    ["ADMIN"],
  );
}
