// ActiveHub organizer dashboard: counters and a 30-day chart built only from the organizer's own records (requirements 7.3.1).
import { z } from "zod";
import type { PoolClient } from "pg";
import { access, missing } from "../marketplace/core";
import { bucketsWithDays } from "./queries";
import { inKyivRange, kyivDate, monthRange, resolveRange } from "./period";

/** Dashboard counters for one organizer account; `organizerId` is always the owner being read. */
export async function organizerDashboard(client: PoolClient, organizerId: string, now = new Date()) {
  const month = monthRange(now);
  const today = kyivDate(now);
  const last30 = resolveRange({ period: "30d" }, now);
  const counters = (
    await client.query(
      `SELECT
        (SELECT count(*) FROM events WHERE organizer_id=$1 AND status<>'DELETED') AS total_events,
        (SELECT count(*) FROM events WHERE organizer_id=$1 AND status='ACTIVE') AS active_events,
        (SELECT count(*) FROM events WHERE organizer_id=$1 AND status='PAUSED') AS paused_events,
        (SELECT count(*) FROM events e WHERE e.organizer_id=$1 AND e.status NOT IN ('DELETED','CANCELLED')
           AND NOT EXISTS(SELECT 1 FROM event_sessions s WHERE s.event_id=e.id AND s.status='SCHEDULED' AND NOT s.is_deleted AND s.starts_at>now())) AS completed_events,
        (SELECT count(*) FROM event_sessions s JOIN events e ON e.id=s.event_id
           WHERE e.organizer_id=$1 AND e.status NOT IN ('DELETED','CANCELLED') AND s.status='SCHEDULED' AND NOT s.is_deleted AND s.starts_at>now()) AS future_sessions,
        (SELECT count(*) FROM bookings b JOIN event_sessions s ON s.id=b.session_id JOIN events e ON e.id=s.event_id
           WHERE e.organizer_id=$1 AND s.starts_at>now() AND b.status IN ('PENDING','AWAITING_PAYMENT','CONFIRMED')) AS active_future_bookings,
        (SELECT count(*) FROM bookings b JOIN event_sessions s ON s.id=b.session_id JOIN events e ON e.id=s.event_id
           WHERE e.organizer_id=$1 AND s.starts_at>now() AND b.status='PENDING') AS pending_requests,
        (SELECT count(*) FROM messages m JOIN conversations c ON c.id=m.conversation_id
           WHERE c.organizer_id=$1 AND m.sender_id<>$1 AND m.read_at IS NULL) AS unread_messages,
        (SELECT coalesce(sum(p.amount_minor),0) FROM payments p JOIN bookings b ON b.id=p.booking_id
           JOIN event_sessions s ON s.id=b.session_id JOIN events e ON e.id=s.event_id
           WHERE e.organizer_id=$1 AND p.status IN ('SUCCEEDED','REFUNDED') AND ${inKyivRange("p.created_at", "$2", "$3")}) AS month_paid,
        (SELECT coalesce(sum(r.amount_minor),0) FROM refunds r JOIN payments p ON p.id=r.payment_id JOIN bookings b ON b.id=p.booking_id
           JOIN event_sessions s ON s.id=b.session_id JOIN events e ON e.id=s.event_id
           WHERE e.organizer_id=$1 AND ${inKyivRange("r.created_at", "$2", "$3")}) AS month_refunded`,
      [organizerId, month.dateFrom, month.dateTo],
    )
  ).rows[0];
  const bookingsLast30Days = await bucketsWithDays(
    client,
    last30.days,
    `SELECT to_char(b.created_at AT TIME ZONE 'Europe/Kyiv','YYYY-MM-DD') AS key, count(*) AS count
     FROM bookings b JOIN event_sessions s ON s.id=b.session_id JOIN events e ON e.id=s.event_id
     WHERE e.organizer_id=$1 AND ${inKyivRange("b.created_at", "$2", "$3")} GROUP BY 1`,
    [organizerId, last30.dateFrom, today],
  );
  return {
    totalEvents: Number(counters.total_events),
    activeEvents: Number(counters.active_events),
    pausedEvents: Number(counters.paused_events),
    completedEvents: Number(counters.completed_events),
    futureSessions: Number(counters.future_sessions),
    activeFutureBookings: Number(counters.active_future_bookings),
    pendingRequests: Number(counters.pending_requests),
    currentMonthNetRevenueMinor: Number(counters.month_paid) - Number(counters.month_refunded),
    unreadMessages: Number(counters.unread_messages),
    bookingsLast30Days,
  };
}

/** Own dashboard for the signed-in organizer. */
export function getOrganizerDashboard(request: Request) {
  return access(
    request,
    async (client, current) => Response.json(await organizerDashboard(client, current.id)),
    ["ORGANIZER"],
  );
}

/** Administrator view of one organizer; other roles and unknown identifiers look missing. */
export function getAdminOrganizerStatistics(request: Request, id: string) {
  z.uuid().parse(id);
  return access(
    request,
    async (client) => {
      const exists = (await client.query("SELECT 1 FROM accounts WHERE id=$1 AND role='ORGANIZER'", [id])).rowCount;
      if (!exists) missing("Organizer not found");
      return Response.json(await organizerDashboard(client, id));
    },
    ["ADMIN"],
  );
}
