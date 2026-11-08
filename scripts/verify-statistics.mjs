import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createPool } from "../src/infrastructure/database.ts";

if (process.env.ACTIVEHUB_TEST_WRITES !== "true")
  throw Error("Use an isolated database and set ACTIVEHUB_TEST_WRITES=true");
assert.ok(process.env.INITIAL_ADMIN_EMAIL && process.env.INITIAL_ADMIN_PASSWORD, "Administrator credentials are required");
const base = process.env.API_BASE_URL ?? "http://127.0.0.1:3000",
  origin = (process.env.APP_ORIGINS ?? process.env.APP_ORIGIN).split(",")[0],
  pool = createPool();
class Browser {
  cookies = new Map();
  async raw(path, method = "GET", body, headers = {}) {
    const r = await fetch(base + path, {
      method,
      headers: {
        Origin: origin,
        Cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    for (const raw of r.headers.getSetCookie()) {
      const part = raw.split(";")[0],
        i = part.indexOf("=");
      this.cookies.set(part.slice(0, i), part.slice(i + 1));
    }
    return {
      status: r.status,
      data: r.status === 204 ? null : await r.json(),
      cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "),
    };
  }
  async send(path, method, body, key = randomUUID()) {
    const csrf = await this.raw("/api/auth/csrf");
    return this.raw(path, method, body, { "X-CSRF-Token": csrf.data.token, Cookie: csrf.cookie, "Idempotency-Key": key });
  }
  async call(path, method = "GET", body, status = 200, key = randomUUID()) {
    const r = method === "GET" ? await this.raw(path, method, body) : await this.send(path, method, body, key);
    assert.equal(r.status, status, `${method} ${path}: ${JSON.stringify(r.data)}`);
    return r.data;
  }
}
const run = randomUUID(),
  password = "StatsTestPassword123",
  email = (name) => `stats-${name}-${run}@example.test`;
const good = { number: "4242424242424242", holder: "Stats Member", expiryMonth: 12, expiryYear: new Date().getUTCFullYear() + 1, cvv: "123" };
const declined = { ...good, number: "4000000000000002" };
const kyivToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Kyiv", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const count = async (sql, values) => Number((await pool.query(sql, values)).rows[0].n);
const bucket = (list, key) => list.find((b) => b.key === key)?.count ?? 0;

try {
  const admin = new Browser();
  await admin.call("/api/auth/login", "POST", { email: process.env.INITIAL_ADMIN_EMAIL, password: process.env.INITIAL_ADMIN_PASSWORD });
  const guest = new Browser(),
    org = new Browser(),
    org2 = new Browser(),
    members = Array.from({ length: 8 }, () => new Browser());
  const city = (await org.call("/api/cities?pageSize=100")).items[0].id,
    directions = (await org.call("/api/directions?pageSize=100")).items,
    dir = directions[0].id;
  const register = async (b, role, name) => {
    await b.call(`/api/auth/register/${role}`, "POST", {
      email: email(name), password, passwordConfirmation: password, phone: "+380501234567", cityId: city,
      ...(role === "user"
        ? { firstName: name[0].toUpperCase() + name.slice(1), lastName: "Stats", gender: "UNDISCLOSED" }
        : { name: `${name} Stats Club`, type: "CLUB", directionIds: [dir] }),
    }, 201);
    return (await b.call("/api/me")).id;
  };
  const orgId = await register(org, "organizer", "alpha");
  const org2Id = await register(org2, "organizer", "beta");
  const m = [];
  for (let i = 0; i < members.length; i++) m.push(await register(members[i], "user", `m${i + 1}`));
  const [M1, M2, M3, M4, M5, M6, M7] = members;
  const create = (b, { price = 10000, capacity = 5, mode = "AUTO", direction = dir, title } = {}) =>
    b.call("/api/organizer/events", "POST", {
      title: title ?? `Stats ${randomUUID()}`, description: "Statistics integration activity", kind: "TRAINING",
      directionId: direction, cityId: city, address: "3 Statistics Lane", skill: "ANY", age: "ANY", priceMinor: price,
      seatsPerSession: capacity, confirmationMode: mode,
      sessions: [{ startsAt: new Date(Date.now() + 48 * 3600000).toISOString(), endsAt: new Date(Date.now() + 49 * 3600000).toISOString(), seatsTotal: capacity }],
    }, 201);
  const book = (b, e, seats = 1, paymentMethod = "CARD") =>
    b.call("/api/bookings", "POST", { sessionId: e.nextSession.id, seats, paymentMethod }, 201);
  const pay = (b, id, card = good, status = 201) => b.call(`/api/bookings/${id}/payments`, "POST", card, status);
  const cancel = (b, id) => b.call(`/api/bookings/${id}/cancel`, "POST", { reason: "Statistics check" });

  // Platform statistics before the fixtures of this run, with the same day as the window.
  const before = await admin.call(`/api/admin/statistics?period=custom&dateFrom=${kyivToday}&dateTo=${kyivToday}`);

  const E1 = await create(org), E2 = await create(org, { price: 0 }), E3 = await create(org, { mode: "MANUAL" });
  const E4 = await create(org2, { price: 5000 });
  const M1b = await book(M1, E1);
  await pay(M1, M1b.id);
  await cancel(M1, M1b.id);
  const M2b = await book(M2, E1);
  await cancel(M2, M2b.id);
  const M3b = await book(M3, E2);
  const M4b = await book(M4, E1);
  await pay(M4, M4b.id, declined, 201);
  const M5b = await book(M5, E1, 2);
  await pay(M5, M5b.id);
  const M6b = await book(M6, E3);
  const M7b = await book(M7, E4);
  await pay(M7, M7b.id);
  assert.equal(M3b.status, "CONFIRMED");
  assert.equal(M4b.status, "AWAITING_PAYMENT");
  assert.equal(M6b.status, "PENDING");

  const after = await admin.call(`/api/admin/statistics?period=custom&dateFrom=${kyivToday}&dateTo=${kyivToday}`);
  assert.equal(after.bookings - before.bookings, 7, "every booking created today is counted once");
  // Successful payments: 10 000 (M1, later refunded) + 20 000 (M5) + 5 000 (M7); refund 10 000 in the same day.
  assert.equal(after.netRevenueMinor - before.netRevenueMinor, 25000, "net revenue is payments minus refunds");
  const statusDelta = (key) => bucket(after.bookingsByStatus, key) - bucket(before.bookingsByStatus, key);
  assert.equal(statusDelta("CANCELLED"), 2);
  assert.equal(statusDelta("AWAITING_PAYMENT"), 1);
  assert.equal(statusDelta("CONFIRMED"), 3);
  assert.equal(statusDelta("PENDING"), 1);
  assert.equal(bucket(after.bookingsByDay, kyivToday) - bucket(before.bookingsByDay, kyivToday), 7);
  assert.equal(after.bookingsByDay.length, 1, "a one-day window has exactly one bucket");
  const e1Top = after.topEvents.find((e) => e.key === E1.id);
  assert.equal(e1Top?.count, 4, "E1 has four bookings: two cancelled, one awaiting payment and one with two places");
  assert.equal(e1Top.label, E1.title);
  // Conversion: bookings ever confirmed over bookings created, four decimals, half up.
  const createdToday = await count("SELECT count(*)::int AS n FROM bookings b WHERE b.created_at>=($1::date::timestamp AT TIME ZONE 'Europe/Kyiv') AND b.created_at<(($1::date+1)::timestamp AT TIME ZONE 'Europe/Kyiv')", [kyivToday]);
  const confirmedToday = await count(
    "SELECT count(*)::int AS n FROM bookings b WHERE b.created_at>=($1::date::timestamp AT TIME ZONE 'Europe/Kyiv') AND b.created_at<(($1::date+1)::timestamp AT TIME ZONE 'Europe/Kyiv') AND EXISTS(SELECT 1 FROM booking_history h WHERE h.booking_id=b.id AND h.to_status='CONFIRMED')",
    [kyivToday],
  );
  assert.equal(after.bookingConversion, (Math.round((confirmedToday / createdToday) * 10000) / 10000).toFixed(4));
  assert.match(after.bookingConversion, /^\d+\.\d{4}$/);
  assert.equal(after.eventsByKind.find((k) => k.key === "TRAINING").count - (before.eventsByKind.find((k) => k.key === "TRAINING")?.count ?? 0), 4);
  console.log("PASS: platform totals, net revenue, status and day breakdowns, top events and exact conversion match the fixtures");

  // Organizer dashboard: exact counters for the organizer's own records.
  await org.call(`/api/organizer/events/${E2.id}/status`, "PATCH", { status: "PAUSED" });
  const sendFrom = await M5.call("/api/conversations", "POST", { organizerId: orgId }, 201);
  await M5.call(`/api/conversations/${sendFrom.id}/messages`, "POST", { text: "Is the hall free on Friday?" }, 201, randomUUID());
  const dash = await org.call("/api/organizer/dashboard");
  assert.deepEqual(
    {
      totalEvents: dash.totalEvents,
      activeEvents: dash.activeEvents,
      pausedEvents: dash.pausedEvents,
      completedEvents: dash.completedEvents,
      futureSessions: dash.futureSessions,
      activeFutureBookings: dash.activeFutureBookings,
      pendingRequests: dash.pendingRequests,
      currentMonthNetRevenueMinor: dash.currentMonthNetRevenueMinor,
      unreadMessages: dash.unreadMessages,
    },
    {
      totalEvents: 3,
      activeEvents: 2,
      pausedEvents: 1,
      completedEvents: 0,
      futureSessions: 3,
      activeFutureBookings: 4,
      pendingRequests: 1,
      currentMonthNetRevenueMinor: 20000,
      unreadMessages: 1,
    },
  );
  assert.equal(dash.bookingsLast30Days.length, 30);
  assert.equal(bucket(dash.bookingsLast30Days, kyivToday), 6, "the organizer's six bookings today; E4 belongs to another organizer");
  assert.equal(dash.bookingsLast30Days.at(-1).key, kyivToday);
  // Another organizer sees only its own numbers.
  const dash2 = await org2.call("/api/organizer/dashboard");
  assert.equal(dash2.totalEvents, 1);
  assert.equal(dash2.activeFutureBookings, 1);
  assert.equal(dash2.currentMonthNetRevenueMinor, 5000);
  assert.equal(dash2.unreadMessages, 0);
  assert.equal(bucket(dash2.bookingsLast30Days, kyivToday), 1);
  // The administrator's view of an organizer uses the same definitions.
  assert.deepEqual(await admin.call(`/api/admin/organizers/${orgId}/statistics`), dash);
  assert.equal((await admin.call(`/api/admin/organizers/${org2Id}/statistics`)).totalEvents, 1);
  console.log("PASS: organizer dashboard counters, 30-day chart and cross-organizer isolation match the fixtures; the administrator view is identical");

  // Access and validation.
  await guest.call("/api/admin/statistics", "GET", undefined, 401);
  await guest.call("/api/organizer/dashboard", "GET", undefined, 401);
  await members[0].call("/api/admin/statistics", "GET", undefined, 403);
  await members[0].call("/api/organizer/dashboard", "GET", undefined, 403);
  await org.call("/api/admin/statistics", "GET", undefined, 403);
  await admin.call("/api/organizer/dashboard", "GET", undefined, 403);
  await members[0].call(`/api/admin/organizers/${orgId}/statistics`, "GET", undefined, 403);
  await admin.call(`/api/admin/organizers/${m[0]}/statistics`, "GET", undefined, 404);
  await admin.call(`/api/admin/organizers/${randomUUID()}/statistics`, "GET", undefined, 404);
  await admin.call("/api/admin/statistics?period=1y", "GET", undefined, 422);
  await admin.call("/api/admin/statistics?period=custom&dateFrom=2026-01-01", "GET", undefined, 422);
  await admin.call("/api/admin/statistics?period=custom&dateFrom=2026-05-01&dateTo=2026-01-01", "GET", undefined, 422);
  await admin.call("/api/admin/statistics?period=custom&dateFrom=2024-01-01&dateTo=2026-01-01", "GET", undefined, 422);
  await admin.call("/api/admin/statistics?period=7d&dateFrom=2026-01-01", "GET", undefined, 422);
  const week = await admin.call("/api/admin/statistics?period=7d");
  assert.equal(week.bookingsByDay.length, 7, "empty days are included");
  assert.equal(new Set(week.bookingsByDay.map((b) => b.key)).size, 7);
  const ninety = await admin.call("/api/admin/statistics?period=90d");
  assert.equal(ninety.bookingsByDay.length, 90);
  assert.equal((await admin.call("/api/admin/statistics")).bookingsByDay.length, 30, "the default is 30 days");
  console.log("PASS: administrator-only and organizer-only access, ownership and period validation");

  // Recommendations without preferences: live and finished bookings count, cancelled ones do not.
  const newcomer = members[7];
  const popularA = await create(org), ghost = await create(org), liveAfter = await create(org);
  // popularA: two live bookings; ghost: only cancelled bookings; liveAfter: one live booking.
  await book(M1, popularA);
  await book(M2, popularA);
  const ghostBooking = await book(M3, ghost), ghost2 = await book(M4, ghost);
  await cancel(M3, ghostBooking.id);
  await cancel(M4, ghost2.id);
  await book(M5, liveAfter);
  let found = {};
  for (let page = 1; page <= 10 && Object.keys(found).length < 3; page++) {
    const list = await newcomer.call(`/api/me/recommendations?pageSize=100&page=${page}`);
    list.items.forEach((event, index) => {
      if ([popularA.id, ghost.id, liveAfter.id].includes(event.id)) found[event.id] = page * 1000 + index;
    });
    if (page >= list.meta.totalPages) break;
  }
  assert.ok(found[popularA.id] !== undefined && found[liveAfter.id] !== undefined && found[ghost.id] !== undefined, "all fixtures are listed");
  assert.ok(found[popularA.id] < found[liveAfter.id], "two live bookings rank above one");
  assert.ok(found[liveAfter.id] < found[ghost.id], "cancelled bookings do not make an event popular");
  console.log("PASS: recommendations without preferences rank by live and completed bookings only");
} finally {
  await pool.end();
}
