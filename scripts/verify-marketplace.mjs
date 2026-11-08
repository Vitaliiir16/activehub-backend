import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createPool } from "../src/infrastructure/database.ts";
import { runBookingJobs } from "../src/infrastructure/booking-jobs.ts";
import { withinCutoff } from "../src/modules/marketplace/policies.ts";

if (process.env.ACTIVEHUB_TEST_WRITES !== "true")
  throw Error("Use an isolated database and set ACTIVEHUB_TEST_WRITES=true");
const base = process.env.API_BASE_URL ?? "http://127.0.0.1:3000",
  origin = (process.env.APP_ORIGINS ?? process.env.APP_ORIGIN).split(",")[0],
  pool = createPool();
class Browser {
  cookies = new Map();
  headers() {
    return {
      Origin: origin,
      Cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "),
    };
  }
  async raw(path, method = "GET", body, headers = {}) {
    const r = await fetch(base + path, {
      method,
      headers: {
        ...this.headers(),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
    for (const raw of r.headers.getSetCookie()) {
      const part = raw.split(";")[0],
        i = part.indexOf("=");
      this.cookies.set(part.slice(0, i), part.slice(i + 1));
    }
    const data = r.status === 204 ? null : await r.json();
    return { status: r.status, data };
  }
  async csrf() {
    return (await this.call("/api/auth/csrf")).token;
  }
  async call(path, method = "GET", body, status = 200, key = randomUUID()) {
    const headers =
      method === "GET"
        ? {}
        : { "X-CSRF-Token": await this.csrf(), "Idempotency-Key": key };
    const r = await this.raw(path, method, body, headers);
    assert.equal(
      r.status,
      status,
      `${method} ${path}: ${JSON.stringify(r.data)}`,
    );
    return r.data;
  }
}
const run = randomUUID(),
  password = "MarketTestPassword123",
  org = new Browser(),
  user = new Browser(),
  other = new Browser(),
  guest = new Browser();
const card = {
  number: "4242424242424242",
  holder: "Test Member",
  expiryMonth: 12,
  expiryYear: new Date().getUTCFullYear() + 1,
  cvv: "123",
};
try {
  const city = (await org.call("/api/cities?pageSize=100")).items[0].id,
    direction = (await org.call("/api/directions?pageSize=100")).items[0].id;
  await org.call(
    "/api/auth/register/organizer",
    "POST",
    {
      email: `org-${run}@example.test`,
      password,
      passwordConfirmation: password,
      name: "Integration Sports",
      type: "CLUB",
      phone: "+380501234567",
      cityId: city,
      directionIds: [direction],
    },
    201,
  );
  for (const [b, name] of [
    [user, "one"],
    [other, "two"],
  ])
    await b.call(
      "/api/auth/register/user",
      "POST",
      {
        email: `${name}-${run}@example.test`,
        password,
        passwordConfirmation: password,
        firstName: "Test",
        lastName: name,
        phone: "+380501234567",
        cityId: city,
        gender: "UNDISCLOSED",
      },
      201,
    );
  await user.call("/api/auth/logout", "POST", undefined, 204);
  await user.call("/api/auth/login", "POST", {
    email: `one-${run}@example.test`,
    password,
  });
  assert.equal((await user.call("/api/auth/session")).role, "USER");
  const create = async ({
    price = 10000,
    capacity = 2,
    kind = "TRAINING",
    mode = "AUTO",
    hours = 48,
  } = {}) =>
    org.call(
      "/api/organizer/events",
      "POST",
      {
        title: `Activity ${randomUUID()}`,
        description: "Real API integration activity",
        kind,
        directionId: direction,
        cityId: city,
        address: "12 Sports Street",
        skill: "ANY",
        age: "ANY",
        priceMinor: price,
        seatsPerSession: capacity,
        confirmationMode: mode,
        sessions: [
          {
            startsAt: new Date(Date.now() + hours * 3600000).toISOString(),
            endsAt: new Date(Date.now() + (hours + 1) * 3600000).toISOString(),
            seatsTotal: capacity,
          },
        ],
      },
      201,
    );
  const reserve = (b, e, seats = 1) =>
    b.call(
      "/api/bookings",
      "POST",
      { sessionId: e.nextSession.id, seats, paymentMethod: "CARD" },
      201,
    );
  const pay = (b, id, input = card, key = randomUUID(), status = 201) =>
    b.call(`/api/bookings/${id}/payments`, "POST", input, status, key);
  const cancel = (b, id, owned = false) =>
    b.call(`/api/${owned ? "organizer/" : ""}bookings/${id}/cancel`, "POST", {
      reason: "Integration cancellation",
    });
  const event = await create();
  assert.ok(
    (
      await user.call(
        `/api/events?cityId=all&title=${encodeURIComponent(event.title)}`,
      )
    ).items.some((e) => e.id === event.id),
  );
  const booking = await reserve(user, event),
    paymentKey = randomUUID(),
    paid = await pay(user, booking.id, card, paymentKey);
  assert.equal(paid.status, "SUCCEEDED");
  assert.equal((await pay(user, booking.id, card, paymentKey)).id, paid.id);
  await pay(user, booking.id, card, randomUUID(), 409);
  await cancel(user, booking.id);
  await cancel(user, booking.id);
  const refunded = await user.call(`/api/bookings/${booking.id}`);
  assert.equal(refunded.payments[0].status, "REFUNDED");
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM refunds WHERE payment_id=$1",
        [paid.id],
      )
    ).rows[0].n,
    1,
  );
  assert.equal(
    (await user.call(`/api/events/${event.id}`)).nextSession.seatsAvailable,
    2,
  );
  console.log(
    "PASS: organizer creation → discovery → reservation → payment → cancellation → one refund; login smoke",
  );
  const manual = await create({ mode: "MANUAL" }),
    pending = await reserve(user, manual);
  assert.equal(pending.status, "PENDING");
  const approved = await org.call(
    `/api/organizer/bookings/${pending.id}/decision`,
    "POST",
    { decision: "APPROVE" },
  );
  assert.equal(approved.status, "AWAITING_PAYMENT");
  const rejected = await reserve(other, manual);
  await org.call(`/api/organizer/bookings/${rejected.id}/decision`, "POST", {
    decision: "REJECT",
    reason: "No instructor",
  });
  const redacted = await org.call(`/api/organizer/bookings/${rejected.id}`);
  assert.ok(!("email" in redacted.user));
  const free = await reserve(user, await create({ price: 0 }));
  assert.equal(free.status, "CONFIRMED");
  assert.equal(free.canPay, false);
  const retry = await reserve(user, await create());
  const failedKey = randomUUID(),
    failed = await pay(
      user,
      retry.id,
      { ...card, number: "4000000000000002" },
      failedKey,
    );
  assert.equal(failed.status, "FAILED");
  assert.equal(
    (
      await pay(
        user,
        retry.id,
        { ...card, number: "4000000000000002" },
        failedKey,
      )
    ).id,
    failed.id,
  );
  assert.equal((await pay(user, retry.id)).status, "SUCCEEDED");
  console.log(
    "PASS: manual approve/reject and contact privacy, free booking, declined payment and retry",
  );
  async function compete(e, a = user, b = other) {
    const ta = await a.csrf(),
      tb = a === b ? ta : await b.csrf();
    const body = {
      sessionId: e.nextSession.id,
      seats: 1,
      paymentMethod: "CARD",
    };
    const responses = await Promise.all([
      a.raw("/api/bookings", "POST", body, {
        "X-CSRF-Token": ta,
        "Idempotency-Key": randomUUID(),
      }),
      b.raw("/api/bookings", "POST", body, {
        "X-CSRF-Token": tb,
        "Idempotency-Key": randomUUID(),
      }),
    ]);
    assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]);
    return responses.find((r) => r.status === 201).data;
  }
  await compete(await create({ capacity: 1 }));
  const hall = await create({ kind: "HALL_RENTAL", capacity: 20 });
  await compete(hall);
  assert.equal(
    (await user.call(`/api/events/${hall.id}`)).nextSession.seatsAvailable,
    0,
  );
  await compete(await create({ capacity: 4 }), user, user);
  const team = await create({ kind: "TEAM_SEARCH" });
  await user.call(
    "/api/bookings",
    "POST",
    { sessionId: team.nextSession.id, seats: 2, paymentMethod: "CARD" },
    422,
  );
  console.log(
    "PASS: concurrent last place, exclusive hall and duplicate active user booking; team unit validation",
  );
  await guest.call("/api/bookings", "GET", undefined, 401);
  await org.call(
    "/api/bookings",
    "POST",
    { sessionId: event.nextSession.id, seats: 1, paymentMethod: "CARD" },
    403,
  );
  await other.call(`/api/bookings/${retry.id}`, "GET", undefined, 404);
  await user.call(
    `/api/organizer/bookings/${retry.id}/decision`,
    "POST",
    { decision: "APPROVE" },
    403,
  );
  await other.call(
    `/api/organizer/events/${event.id}`,
    "PATCH",
    { title: "Unauthorized" },
    403,
  );
  assert.equal(
    (
      await user.raw(
        "/api/bookings",
        "POST",
        { sessionId: event.nextSession.id, seats: 1, paymentMethod: "CARD" },
        { "Idempotency-Key": randomUUID() },
      )
    ).status,
    403,
  );
  const now = new Date(),
    boundary = new Date(now.getTime() + 1800000);
  assert.equal(withinCutoff(boundary, now, 1800), true);
  assert.equal(
    withinCutoff(new Date(boundary.getTime() - 1), now, 1800),
    false,
  );
  assert.equal(withinCutoff(new Date(boundary.getTime() + 1), now, 1800), true);
  const late = await create({ hours: 0.49 });
  await user.call(
    "/api/bookings",
    "POST",
    { sessionId: late.nextSession.id, seats: 1, paymentMethod: "CARD" },
    409,
  );
  await reserve(user, await create({ hours: 0.51 }));
  console.log(
    "PASS: guest/role/owner/CSRF denial and inclusive cutoff predicate with real API either side",
  );
  for (const change of ["address", "time"]) {
    const e = await create({ hours: 2 }),
      b = await reserve(user, e);
    await pay(user, b.id);
    await user.call(`/api/bookings/${b.id}/cancel`, "POST", {}, 409);
    if (change === "address")
      await org.call(`/api/organizer/events/${e.id}`, "PATCH", {
        address: "14 Updated Street",
      });
    else
      await org.call(`/api/organizer/sessions/${e.nextSession.id}`, "PATCH", {
        startsAt: new Date(Date.now() + 3 * 3600000).toISOString(),
        endsAt: new Date(Date.now() + 4 * 3600000).toISOString(),
        seatsTotal: 2,
      });
    assert.equal(
      (await user.call(`/api/bookings/${b.id}`)).changeRefundEligible,
      true,
    );
    await cancel(user, b.id);
    assert.equal(
      (await user.call(`/api/bookings/${b.id}`)).payments[0].status,
      "REFUNDED",
    );
  }
  for (const kind of ["session", "event"]) {
    const e = await create(),
      b = await reserve(user, e);
    await pay(user, b.id);
    const path =
      kind === "session"
        ? `/api/organizer/sessions/${e.nextSession.id}/cancel`
        : `/api/organizer/events/${e.id}/cancel`;
    await org.call(path, "POST", { reason: "Venue closed" });
    await org.call(path, "POST", { reason: "Venue closed" });
    const dto = await user.call(`/api/bookings/${b.id}`);
    assert.equal(dto.status, "CANCELLED");
    assert.equal(dto.payments[0].status, "REFUNDED");
  }
  console.log(
    "PASS: changed time/address cancellation exception and session/event cancellation cascade with refunds",
  );
  const expiring = await reserve(user, await create()),
    expiringPending = await reserve(user, await create({ mode: "MANUAL" }));
  await pool.query(
    "UPDATE bookings SET deadline_at=clock_timestamp()-interval '1 second' WHERE id=ANY($1::uuid[])",
    [[expiring.id, expiringPending.id]],
  );
  await pay(user, expiring.id, card, randomUUID(), 409);
  const ended = await reserve(user, await create({ price: 0 }));
  await pool.query(
    "UPDATE event_sessions SET starts_at=clock_timestamp()-interval '2 hours',ends_at=clock_timestamp()-interval '1 hour' WHERE id=$1",
    [ended.sessionId],
  );
  await pool.query(
    "UPDATE background_runs SET next_run_at=now() WHERE name='bookings'",
  );
  await runBookingJobs(pool);
  await pool.query(
    "UPDATE background_runs SET next_run_at=now() WHERE name='bookings'",
  );
  await runBookingJobs(pool);
  for (const id of [expiring.id, expiringPending.id])
    assert.equal((await user.call(`/api/bookings/${id}`)).status, "EXPIRED");
  assert.equal(
    (await user.call(`/api/bookings/${ended.id}`)).status,
    "COMPLETED",
  );
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM booking_history WHERE booking_id=$1 AND to_status='EXPIRED'",
        [expiring.id],
      )
    ).rows[0].n,
    1,
  );
  const dbDump =
    JSON.stringify(
      (await pool.query("SELECT row_to_json(p) FROM payments p")).rows,
    ) +
    JSON.stringify(
      (
        await pool.query(
          "SELECT row_to_json(i) FROM idempotency_records i WHERE scope LIKE 'payBooking:%'",
        )
      ).rows,
    );
  assert.ok(
    !dbDump.includes(card.number) &&
      !dbDump.includes('"cvv"') &&
      !dbDump.includes('"number"'),
  );
  assert.ok(!JSON.stringify(refunded).includes(card.number));
  console.log(
    "PASS: persisted expiry/completion, worker retry without duplicate transitions and no stored PAN/CVV",
  );
} finally {
  await pool.end();
}
