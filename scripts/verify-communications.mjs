import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { createPool } from "../src/infrastructure/database.ts";
import { runBookingJobs } from "../src/infrastructure/booking-jobs.ts";
import { runReminderJobs } from "../src/infrastructure/reminder-jobs.ts";
import { dispatchEmails, dispatchNextEmail } from "../src/infrastructure/email-outbox.ts";
import { MailDeliveryError, SmtpMailTransport } from "../src/infrastructure/mail.ts";

if (process.env.ACTIVEHUB_TEST_WRITES !== "true")
  throw Error("Use an isolated database and set ACTIVEHUB_TEST_WRITES=true");
assert.ok(process.env.INITIAL_ADMIN_EMAIL && process.env.INITIAL_ADMIN_PASSWORD, "Administrator credentials are required");
const base = process.env.API_BASE_URL ?? "http://127.0.0.1:3000",
  origin = (process.env.APP_ORIGINS ?? process.env.APP_ORIGIN).split(",")[0],
  mailpit = process.env.MAILPIT_BASE_URL ?? "http://127.0.0.1:8025",
  pool = createPool(),
  mail = new SmtpMailTransport();
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
      signal: AbortSignal.timeout(20000),
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
  /** Sends with the CSRF token and the cookies of the same token response, so concurrent calls cannot mix them. */
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
  password = "CommsTestPassword123",
  org = new Browser(),
  alice = new Browser(),
  bob = new Browser(),
  carol = new Browser(),
  dave = new Browser(),
  stranger = new Browser(),
  admin = new Browser();
const good = { number: "4242424242424242", holder: "Test Member", expiryMonth: 12, expiryYear: new Date().getUTCFullYear() + 1, cvv: "123" };
const declined = { ...good, number: "4000000000000002" };
const one = async (sql, values) => (await pool.query(sql, values)).rows[0];
const settings = (b, v) =>
  b.call("/api/me/notification-settings", "PATCH", { remindersEmail: true, promotionsEmail: true, loyaltyEmail: false, messagesEmail: false, ...v });

/** Exactly `count` notifications of a type (and link) exist; the email channel matches the table in section 7.9. */
async function notice(accountId, { type, link, category, email, count = 1 }) {
  const rows = (
    await pool.query(
      `SELECT n.type,n.category,n.email_status,n.title,n.body,e.state FROM notifications n LEFT JOIN email_outbox e ON e.notification_id=n.id
       WHERE n.account_id=$1 AND n.type=$2 AND ($3::text IS NULL OR n.link=$3)`,
      [accountId, type, link ?? null],
    )
  ).rows;
  assert.equal(rows.length, count, `${type} ${link ?? ""}: expected ${count}, found ${rows.length}`);
  if (!count) return undefined;
  const row = rows[0];
  if (category) assert.equal(row.category, category, `${type} category`);
  if (email) {
    assert.ok(row.state, `${type}: expected an email`);
    assert.notEqual(row.email_status, "NONE");
  } else {
    assert.equal(row.state, null, `${type}: unexpected email`);
    assert.equal(row.email_status, "NONE");
  }
  return row;
}
async function mailpitMessages(to) {
  const found = await (await fetch(`${mailpit}/api/v1/search?query=${encodeURIComponent("to:" + to)}`)).json();
  return found.messages ?? [];
}
async function mailpitWait(to, count) {
  for (let i = 0; i < 30; i++) {
    const messages = await mailpitMessages(to);
    if (messages.length >= count) return messages;
    await delay(500);
  }
  return mailpitMessages(to);
}
async function mailpitSubject(to, subject, count = 1) {
  for (let i = 0; i < 30; i++) {
    const found = (await mailpitMessages(to)).filter((m) => m.Subject === subject);
    if (found.length >= count) return found;
    await delay(500);
  }
  return (await mailpitMessages(to)).filter((m) => m.Subject === subject);
}
async function flush() {
  for (let i = 0; i < 40; i++) if (!(await dispatchEmails(pool, mail, 100))) return;
}
/** Independent sessions of one account: a session holds a single CSRF token, so truly concurrent requests need their own. */
const login = async (name) => {
  const b = new Browser();
  await b.call("/api/auth/login", "POST", { email: `comms-${name}-${run}@example.test`, password });
  return b;
};
const jobs = async () => {
  await pool.query("UPDATE background_runs SET next_run_at=now() WHERE name IN ('bookings','reminders')");
  await runBookingJobs(pool);
  await runReminderJobs(pool);
};

try {
  await flush();
  await admin.call("/api/auth/login", "POST", { email: process.env.INITIAL_ADMIN_EMAIL, password: process.env.INITIAL_ADMIN_PASSWORD });
  const city = (await org.call("/api/cities?pageSize=100")).items[0].id,
    directions = (await org.call("/api/directions?pageSize=100")).items,
    dirX = directions[0].id,
    dirY = directions[1].id;
  const email = (name) => `comms-${name}-${run}@example.test`;
  await org.call("/api/auth/register/organizer", "POST", {
    email: email("org"), password, passwordConfirmation: password, name: "Integration Sports", type: "CLUB",
    phone: "+380501234567", cityId: city, directionIds: [dirX],
  }, 201);
  const ids = { org: (await org.call("/api/me")).id };
  for (const [b, name] of [[alice, "alice"], [bob, "bob"], [carol, "carol"], [dave, "dave"], [stranger, "stranger"]]) {
    await b.call("/api/auth/register/user", "POST", {
      email: email(name), password, passwordConfirmation: password, firstName: name[0].toUpperCase() + name.slice(1),
      lastName: "Member", phone: "+380501234567", cityId: city, gender: "UNDISCLOSED",
    }, 201);
    ids[name] = (await b.call("/api/me")).id;
  }
  const create = ({ price = 10000, capacity = 5, mode = "AUTO", hours = 48, direction = dirX } = {}) =>
    org.call("/api/organizer/events", "POST", {
      title: `Comms ${randomUUID()}`, description: "Communications integration activity", kind: "TRAINING",
      directionId: direction, cityId: city, address: "7 Messaging Street", skill: "ANY", age: "ANY",
      priceMinor: price, seatsPerSession: capacity, confirmationMode: mode,
      sessions: [{ startsAt: new Date(Date.now() + hours * 3600000).toISOString(), endsAt: new Date(Date.now() + (hours + 1) * 3600000).toISOString(), seatsTotal: capacity }],
    }, 201);
  const reserve = (b, e, seats = 1) => b.call("/api/bookings", "POST", { sessionId: e.nextSession.id, seats, paymentMethod: "CARD" }, 201);
  const pay = (b, id, card = good) => b.call(`/api/bookings/${id}/payments`, "POST", card, 201);
  const mine = (id) => `/bookings/${id}`, theirs = (id) => `/organizer/bookings/${id}`;

  // Registration (7.9 row 1) and API visibility of the in-app notification.
  await notice(ids.alice, { type: "WELCOME", email: true });
  assert.ok((await alice.call("/api/notifications?pageSize=100")).items.some((n) => n.type === "WELCOME"));

  // Booking requests, approval, rejection, payment and cancellation.
  const manual = await create({ mode: "MANUAL" });
  const b1 = await reserve(alice, manual);
  assert.equal(b1.status, "PENDING");
  await notice(ids.org, { type: "BOOKING_PENDING", link: theirs(b1.id), category: "BOOKINGS", email: true });
  await notice(ids.alice, { type: "BOOKING_PENDING", link: mine(b1.id), category: "BOOKINGS", email: true });
  await org.call(`/api/organizer/bookings/${b1.id}/decision`, "POST", { decision: "APPROVE" });
  await notice(ids.alice, { type: "BOOKING_AWAITING_PAYMENT", link: mine(b1.id), email: true });
  assert.equal((await pay(alice, b1.id, declined)).status, "FAILED");
  await notice(ids.alice, { type: "PAYMENT_FAILED", link: mine(b1.id), email: false });
  assert.equal((await pay(alice, b1.id)).status, "SUCCEEDED");
  await notice(ids.alice, { type: "PAYMENT_SUCCEEDED", link: mine(b1.id), email: true });
  await notice(ids.org, { type: "PAYMENT_SUCCEEDED", link: theirs(b1.id), email: false });
  await notice(ids.alice, { type: "BOOKING_CONFIRMED", link: mine(b1.id), email: true });
  await alice.call(`/api/bookings/${b1.id}/cancel`, "POST", { reason: "Plans changed" });
  await notice(ids.org, { type: "BOOKING_CANCELLED", link: theirs(b1.id), email: true });
  await notice(ids.alice, { type: "BOOKING_CANCELLED", link: mine(b1.id), email: true });
  await notice(ids.alice, { type: "PAYMENT_REFUNDED", link: mine(b1.id), email: true });
  const b2 = await reserve(bob, manual);
  await org.call(`/api/organizer/bookings/${b2.id}/decision`, "POST", { decision: "REJECT", reason: "Not suitable" });
  assert.match((await notice(ids.bob, { type: "BOOKING_REJECTED", link: mine(b2.id), email: true })).body, /Not suitable/);
  await settings(carol, { remindersEmail: false, promotionsEmail: false, loyaltyEmail: false, messagesEmail: false });
  const auto = await create();
  const b3 = await reserve(carol, auto);
  await org.call(`/api/organizer/bookings/${b3.id}/cancel`, "POST", { reason: "Coach unavailable" });
  await notice(ids.carol, { type: "BOOKING_CANCELLED", link: mine(b3.id), email: true });
  await notice(ids.org, { type: "BOOKING_CANCELLED", link: theirs(b3.id), count: 0 });
  console.log("PASS: request, approval, rejection reason, payment success/failure, user and organizer cancellation, refund and mandatory booking email");

  // Expiry: PENDING notifies the organizer in-app only; AWAITING_PAYMENT does not notify the organizer.
  const b4 = await reserve(dave, manual);
  const b5 = await reserve(alice, auto);
  await pool.query("UPDATE bookings SET deadline_at=now()-interval '1 minute' WHERE id=ANY($1::uuid[])", [[b4.id, b5.id]]);
  await jobs();
  await notice(ids.dave, { type: "BOOKING_EXPIRED", link: mine(b4.id), email: true });
  await notice(ids.org, { type: "BOOKING_EXPIRED", link: theirs(b4.id), email: false });
  await notice(ids.alice, { type: "BOOKING_EXPIRED", link: mine(b5.id), email: true });
  await notice(ids.org, { type: "BOOKING_EXPIRED", link: theirs(b5.id), count: 0 });

  // Session fills, shared address change and event cancellation.
  const small = await create({ capacity: 1 });
  const b6 = await reserve(carol, small);
  await notice(ids.org, { type: "SESSION_FULL", link: `/organizer/events/${small.id}`, email: false });
  await org.call(`/api/organizer/events/${small.id}`, "PATCH", { address: "9 Updated Street" });
  await notice(ids.carol, { type: "SESSION_CHANGED", link: mine(b6.id), email: true });
  await org.call(`/api/organizer/events/${small.id}/cancel`, "POST", { reason: "Venue closed" });
  await notice(ids.carol, { type: "BOOKING_CANCELLED", link: mine(b6.id), email: true });
  console.log("PASS: expiry, session full, address change and event cancellation channels");

  // Reminders: 24h and 2h, once each, skipped for late bookings, preference applies.
  const free = await create({ price: 0 });
  const rAlice = await reserve(alice, free);
  assert.equal(rAlice.status, "CONFIRMED");
  await settings(bob, { remindersEmail: false });
  const rBob = await reserve(bob, free);
  const late = await create({ price: 0 });
  const rLate = await reserve(carol, late);
  const rGone = await reserve(dave, free);
  await dave.call(`/api/bookings/${rGone.id}/cancel`, "POST", { reason: "Changed plans" });
  const move = (event, interval) =>
    pool.query("UPDATE event_sessions SET starts_at=now()+$2::interval,ends_at=now()+$2::interval+interval '1 hour' WHERE event_id=$1", [event.id, interval]);
  await pool.query("UPDATE bookings SET created_at=now()-interval '30 hours' WHERE id=ANY($1::uuid[])", [[rAlice.id, rBob.id, rGone.id]]);
  await move(free, "20 hours");
  await move(late, "20 hours");
  await jobs();
  await notice(ids.alice, { type: "REMINDER_24H", link: mine(rAlice.id), category: "REMINDERS", email: true });
  await notice(ids.bob, { type: "REMINDER_24H", link: mine(rBob.id), email: false });
  await notice(ids.carol, { type: "REMINDER_24H", link: mine(rLate.id), count: 0 });
  await notice(ids.dave, { type: "REMINDER_24H", link: mine(rGone.id), count: 0 });
  await jobs();
  await notice(ids.alice, { type: "REMINDER_24H", link: mine(rAlice.id), email: true });
  await move(free, "90 minutes");
  await jobs();
  await notice(ids.alice, { type: "REMINDER_2H", link: mine(rAlice.id), email: true });
  await notice(ids.alice, { type: "REMINDER_24H", link: mine(rAlice.id), email: true });
  await notice(ids.bob, { type: "REMINDER_2H", link: mine(rBob.id), email: false });
  await notice(ids.carol, { type: "REMINDER_2H", link: mine(rLate.id), count: 0 });
  await jobs();
  await notice(ids.alice, { type: "REMINDER_2H", link: mine(rAlice.id), email: true });
  console.log("PASS: reminders at 24h and 2h are delivered once, skipped for late/cancelled bookings and follow the preference");

  // Promotions need both a matching city and a preferred direction.
  await alice.call("/api/me", "PATCH", { preferredDirectionIds: [dirX] });
  await bob.call("/api/me", "PATCH", { preferredDirectionIds: [dirX] });
  await dave.call("/api/me", "PATCH", { preferredDirectionIds: [dirY] });
  await settings(bob, { promotionsEmail: false, remindersEmail: false });
  const promoted = await create();
  const link = `/events/${promoted.id}`;
  await notice(ids.alice, { type: "NEW_EVENT", link, category: "PROMOTIONS", email: true });
  await notice(ids.bob, { type: "NEW_EVENT", link, email: false });
  await notice(ids.carol, { type: "NEW_EVENT", link, count: 0 });
  await notice(ids.dave, { type: "NEW_EVENT", link, count: 0 });
  await org.call(`/api/organizer/events/${promoted.id}`, "PATCH", { promoPriceMinor: 5000, promoUntil: new Date(Date.now() + 5 * 86400000).toISOString() });
  await notice(ids.alice, { type: "NEW_PROMOTION", link, category: "PROMOTIONS", email: true });
  await notice(ids.bob, { type: "NEW_PROMOTION", link, email: false });
  await notice(ids.carol, { type: "NEW_PROMOTION", link, count: 0 });
  console.log("PASS: matching event and promotion notices need city and direction and follow the PROMOTIONS preference");

  // Loyalty: points email off by default; card upgrade emails until the preference is changed once.
  const pointsAlice = (
    await pool.query(
      "SELECT n.category,e.state FROM notifications n LEFT JOIN email_outbox e ON e.notification_id=n.id WHERE n.account_id=$1 AND n.type='POINTS_ACCRUED'",
      [ids.alice],
    )
  ).rows;
  assert.ok(pointsAlice.length >= 2 && pointsAlice.every((r) => r.category === "LOYALTY" && r.state === null));
  await settings(bob, { loyaltyEmail: true, promotionsEmail: false, remindersEmail: false });
  const loyal = await create({ price: 0 });
  const bLoyal = await reserve(bob, loyal);
  assert.equal(bLoyal.status, "CONFIRMED");
  assert.equal((await pool.query("SELECT 1 FROM notifications n JOIN email_outbox e ON e.notification_id=n.id WHERE n.account_id=$1 AND n.type='POINTS_ACCRUED'", [ids.bob])).rowCount, 1);
  await settings(bob, { loyaltyEmail: false, promotionsEmail: false, remindersEmail: false });
  await admin.call(`/api/admin/users/${ids.alice}/card`, "PATCH", { level: "PREMIUM", locked: true, reason: "Loyalty review" });
  await notice(ids.alice, { type: "CARD_UPGRADED", category: "LOYALTY", email: true });
  await admin.call(`/api/admin/users/${ids.bob}/card`, "PATCH", { level: "PREMIUM", locked: true, reason: "Loyalty review" });
  await notice(ids.bob, { type: "CARD_UPGRADED", email: false });
  console.log("PASS: points email is opt-in; card upgrade email is on until the LOYALTY preference is changed");

  // Subscription purchase and administrator changes to an organizer's event.
  const plan = await org.call("/api/organizer/subscription-plans", "POST", {
    name: `Plan ${run}`, type: "MONTHLY", description: "Monthly plan", priceMinor: 50000, validityDays: 30, visitsLimit: 8, scope: "ALL_EVENTS", directionIds: [],
  }, 201);
  await alice.call("/api/subscriptions", "POST", { planId: plan.id, card: good }, 201);
  await notice(ids.alice, { type: "SUBSCRIPTION_PURCHASED", category: "BOOKINGS", email: true });
  const moderated = await create();
  await admin.call(`/api/admin/events/${moderated.id}/status`, "PATCH", { status: "BLOCKED", reason: "Policy check" });
  await notice(ids.org, { type: "EVENT_MODERATED", link: `/organizer/events/${moderated.id}`, category: "ACCOUNT", email: true });
  await admin.call(`/api/admin/events/${moderated.id}`, "PATCH", { description: "Edited by an administrator" });
  await notice(ids.org, { type: "EVENT_EDITED_BY_ADMIN", link: `/organizer/events/${moderated.id}`, email: true });
  await admin.call(`/api/admin/events/${moderated.id}/cancel`, "POST", { reason: "Repeated policy issues" });
  await notice(ids.org, { type: "EVENT_CANCELLED_BY_ADMIN", link: `/organizer/events/${moderated.id}`, email: true });
  console.log("PASS: subscription purchase and administrator event changes notify with email");

  // Delivery: queued mail is sent once, rendered with a link, and survives outages.
  await flush();
  const pending = await one(
    "SELECT count(*)::int AS n FROM email_outbox e JOIN notifications n ON n.id=e.notification_id WHERE n.account_id=ANY($1::uuid[]) AND e.state<>'SENT'",
    [Object.values(ids)],
  );
  assert.equal(pending.n, 0);
  const aliceRows = (await one("SELECT count(*)::int AS n FROM email_outbox e JOIN notifications n ON n.id=e.notification_id WHERE n.account_id=$1", [ids.alice])).n;
  const aliceMail = await mailpitWait(email("alice"), aliceRows);
  assert.equal(aliceMail.length, aliceRows, "one email per queued notification");
  assert.equal(new Set(aliceMail.map((m) => m.MessageID)).size, aliceRows, "stable unique Message-IDs");
  const reminderMail = aliceMail.find((m) => m.Subject === "Activity reminder");
  assert.ok(reminderMail);
  const detail = await (await fetch(`${mailpit}/api/v1/message/${reminderMail.ID}`)).json();
  assert.match(detail.HTML, /Open in ActiveHub/);
  assert.match(detail.Text, /\/bookings\/[0-9a-f-]{36}/);
  assert.ok(detail.HTML.includes(`href="${new URL(origin).origin}/bookings/${rAlice.id}"`));
  assert.ok(detail.Text.includes(`${new URL(origin).origin}/bookings/${rAlice.id}`));
  assert.match(detail.Text, /notification settings/);
  const welcomeMail = aliceMail.find((m) => m.Subject === "Welcome to ActiveHub");
  assert.match((await (await fetch(`${mailpit}/api/v1/message/${welcomeMail.ID}`)).json()).Text, /service message/);
  assert.equal(await dispatchEmails(pool, mail), 0);
  assert.equal((await mailpitMessages(email("alice"))).length, aliceRows);

  const queueTest = async (title, accountId) => {
    const n = await one(
      "INSERT INTO notifications(account_id,event_key,type,category,title,body,link,email_status) VALUES($1,$2,'TEST_DELIVERY','BOOKINGS',$3,'Delivery check','/profile','QUEUED') RETURNING id",
      [accountId, `test:${randomUUID()}`, title],
    );
    await pool.query("INSERT INTO email_outbox(notification_id,recipient,subject,body) SELECT $1,email,$2,'Delivery check' FROM accounts WHERE id=$3", [n.id, title, accountId]);
    return n.id;
  };
  const failing = (code, permanent) => ({ send: async () => { throw new MailDeliveryError(code, permanent); } });
  const outageTitle = `Outage ${run}`;
  const outageId = await queueTest(outageTitle, ids.carol);
  assert.equal(await dispatchNextEmail(pool, failing("ECONNECTION", false)), "DEFERRED");
  let row = await one("SELECT state,attempts,last_error,next_attempt_at>now() AS later FROM email_outbox WHERE notification_id=$1", [outageId]);
  assert.deepEqual([row.state, row.attempts, row.last_error, row.later], ["PENDING", 1, "ECONNECTION", true]);
  assert.equal((await one("SELECT email_status FROM notifications WHERE id=$1", [outageId])).email_status, "FAILED");
  assert.equal(await dispatchNextEmail(pool, mail), "IDLE", "a deferred message waits for its retry time");
  await pool.query("UPDATE email_outbox SET next_attempt_at=now() WHERE notification_id=$1", [outageId]);
  assert.equal(await dispatchNextEmail(pool, mail), "SENT");
  assert.equal((await one("SELECT email_status FROM notifications WHERE id=$1", [outageId])).email_status, "SENT");
  assert.equal((await mailpitSubject(email("carol"), outageTitle)).length, 1);
  assert.equal(await dispatchNextEmail(pool, mail), "IDLE");
  const permanentId = await queueTest(`Rejected ${run}`, ids.dave);
  assert.equal(await dispatchNextEmail(pool, failing("550", true)), "FAILED");
  assert.deepEqual(Object.values(await one("SELECT state,last_error FROM email_outbox WHERE notification_id=$1", [permanentId])), ["FAILED", "550"]);
  assert.equal(await dispatchNextEmail(pool, mail), "IDLE");
  const exhaustedId = await queueTest(`Exhausted ${run}`, ids.dave);
  process.env.EMAIL_MAX_ATTEMPTS = "2";
  assert.equal(await dispatchNextEmail(pool, failing("ETIMEDOUT", false)), "DEFERRED");
  await pool.query("UPDATE email_outbox SET next_attempt_at=now() WHERE notification_id=$1", [exhaustedId]);
  assert.equal(await dispatchNextEmail(pool, failing("ETIMEDOUT", false)), "FAILED");
  delete process.env.EMAIL_MAX_ATTEMPTS;
  assert.equal((await one("SELECT state FROM email_outbox WHERE notification_id=$1", [exhaustedId])).state, "FAILED");
  console.log("PASS: emails are rendered with links, sent once, retried after outages, failed permanently and never duplicated");

  // Chat: permitted starts, ordered messages, read state, notifications and restrictions.
  await alice.call("/api/conversations", "POST", { organizerId: ids.alice }, 409);
  await alice.call("/api/conversations", "POST", { userId: ids.bob }, 422);
  await alice.call("/api/conversations", "POST", {}, 422);
  const started = await alice.call("/api/conversations", "POST", { eventId: manual.id }, 201);
  assert.equal(started.organizerId, ids.org);
  assert.equal(started.counterpartName, "Integration Sports");
  const again = await alice.call("/api/conversations", "POST", { organizerId: ids.org }, 200);
  assert.equal(again.id, started.id);
  const bob2 = await login("bob");
  const racing = await Promise.all([
    bob.send("/api/conversations", "POST", { organizerId: ids.org }),
    bob2.send("/api/conversations", "POST", { organizerId: ids.org }),
  ]);
  assert.ok(racing.every((r) => [200, 201].includes(r.status)), JSON.stringify(racing));
  assert.equal(racing[0].data.id, racing[1].data.id);
  assert.equal((await one("SELECT count(*)::int AS n FROM conversations WHERE user_id=$1 AND organizer_id=$2", [ids.bob, ids.org])).n, 1);
  await org.call("/api/conversations", "POST", { userId: ids.stranger }, 404);
  await org.call("/api/conversations", "POST", { organizerId: ids.org }, 422);
  await org.call("/api/conversations", "POST", {}, 422);
  const fromBooking = await org.call("/api/conversations", "POST", { bookingId: b1.id }, 200);
  assert.equal(fromBooking.id, started.id);
  for (const b of [admin])
    for (const [path, method, body] of [["/api/conversations", "GET"], ["/api/conversations", "POST", { organizerId: ids.org }], [`/api/conversations/${started.id}/messages`, "GET"], [`/api/conversations/${started.id}/messages`, "POST", { text: "hi" }]])
      await b.call(path, method, body, 403);
  await stranger.call(`/api/conversations/${started.id}/messages`, "GET", undefined, 404);
  await stranger.call(`/api/conversations/${started.id}/messages`, "POST", { text: "hi" }, 404);
  await bob.call(`/api/conversations/${started.id}/read`, "POST", { throughMessageId: randomUUID() }, 404);
  await alice.call("/api/conversations", "GET", undefined, 200);
  const guest = new Browser();
  await guest.call("/api/conversations", "GET", undefined, 401);

  const send = (b, id, text, extra = {}, status = 201, key) => b.call(`/api/conversations/${id}/messages`, "POST", { text, ...extra }, status, key);
  const replayKey = randomUUID();
  const m1 = await send(alice, started.id, "Hello organizer", { eventId: manual.id }, 201, replayKey);
  assert.equal(m1.eventTitle, manual.title);
  assert.equal((await send(alice, started.id, "Hello organizer", { eventId: manual.id }, 201, replayKey)).id, m1.id);
  assert.equal((await one("SELECT count(*)::int AS n FROM messages WHERE conversation_id=$1", [started.id])).n, 1);
  await notice(ids.org, { type: "NEW_MESSAGE", link: `/chat/${started.id}`, category: "MESSAGES", email: false });
  await send(alice, started.id, "   ", {}, 422);
  await send(alice, started.id, "x".repeat(2001), {}, 422);
  await send(alice, started.id, "e", { eventId: randomUUID() }, 422);
  assert.ok((await send(alice, started.id, "y".repeat(2000))).id);
  assert.equal((await org.call("/api/conversations")).items[0].unreadCount, 2);
  assert.equal((await org.call("/api/conversations")).unreadTotal >= 2, true);
  const polled = await org.call(`/api/conversations/${started.id}/messages?afterId=${m1.id}`);
  assert.equal(polled.items.length, 1);
  assert.equal(polled.items[0].readAt, null);
  const all = await org.call(`/api/conversations/${started.id}/messages?pageSize=100`);
  const last = all.items.at(-1);
  const read = await org.call(`/api/conversations/${started.id}/read`, "POST", { throughMessageId: last.id });
  assert.equal(read.updatedCount, 2);
  assert.equal((await org.call(`/api/conversations/${started.id}/read`, "POST", { throughMessageId: last.id })).updatedCount, 0);
  assert.ok((await alice.call(`/api/conversations/${started.id}/messages?pageSize=100`)).items.every((m) => m.readAt));
  assert.equal((await one("SELECT count(*)::int AS n FROM notifications WHERE account_id=$1 AND type='NEW_MESSAGE' AND read_at IS NULL", [ids.org])).n, 0);
  const reply = await send(org, started.id, "Hello Alice");
  assert.equal((await alice.call("/api/conversations")).items[0].lastMessageText, "Hello Alice");
  assert.equal((await alice.call("/api/conversations")).items[0].unreadCount, 1);
  await notice(ids.alice, { type: "NEW_MESSAGE", link: `/chat/${started.id}`, email: false });
  await settings(alice, { messagesEmail: true });
  await send(org, started.id, "Second note");
  assert.equal(
    (await one("SELECT count(*)::int AS n FROM notifications n JOIN email_outbox e ON e.notification_id=n.id WHERE n.account_id=$1 AND n.type='NEW_MESSAGE'", [ids.alice])).n,
    1,
  );
  await flush();
  const chatMail = await mailpitSubject(email("alice"), "New message from Integration Sports");
  assert.equal(chatMail.length, 1, "only the message after enabling MESSAGES email is mailed");
  assert.match((await (await fetch(`${mailpit}/api/v1/message/${chatMail[0].ID}`)).json()).Text, /\/chat\//);
  const other = await org.call("/api/conversations", "POST", { bookingId: b2.id }, 200);
  await send(org, other.id, "Hi Bob");
  const ordered = (await org.call("/api/conversations")).items;
  assert.equal(ordered[0].id, other.id);
  assert.equal((await org.call("/api/conversations?sort=lastMessageAsc")).items.at(-1).id, other.id);

  // Concurrent senders: strictly ordered, gap-free, and nothing missed by cursor polling.
  const before = await org.call(`/api/conversations/${started.id}/messages?sort=newest&pageSize=1`);
  const cursor = before.items[0].id;
  const senders = [alice, org, ...(await Promise.all([login("alice"), login("alice"), login("alice")])), ...(await Promise.all([login("org"), login("org"), login("org")]))];
  const sent = [];
  for (let round = 0; round < 2; round++)
    sent.push(...(await Promise.all(senders.map((b, i) => send(b, started.id, `Concurrent ${round}-${i}`)))));
  assert.equal(sent.length, 16);
  assert.equal(new Set(sent.map((m) => m.id)).size, 16);
  const seqs = (await pool.query("SELECT seq FROM messages WHERE conversation_id=$1 ORDER BY seq", [started.id])).rows.map((r) => r.seq);
  assert.deepEqual(seqs, seqs.map((_, i) => i + 1));
  const caught = await alice.call(`/api/conversations/${started.id}/messages?afterId=${cursor}&pageSize=100`);
  assert.deepEqual(caught.items.map((m) => m.id).sort(), sent.map((m) => m.id).sort());

  // Blocked accounts: a blocked recipient cannot be messaged and a blocked sender loses the session.
  await org.call("/api/conversations", "POST", { userId: ids.carol }, 201);
  const carolChat = (await org.call("/api/conversations")).items.find((c) => c.userId === ids.carol);
  await pool.query("UPDATE accounts SET status='BLOCKED' WHERE id=$1", [ids.carol]);
  await send(org, carolChat.id, "Are you there?", {}, 409);
  await carol.call(`/api/conversations/${carolChat.id}/messages`, "POST", { text: "Hi" }, 401);
  await pool.query("UPDATE accounts SET status='ACTIVE' WHERE id=$1", [ids.carol]);

  // Message rate limit and immutability.
  let status = 0;
  for (let i = 0; i < 40 && status !== 429; i++) status = (await bob.send(`/api/conversations/${other.id}/messages`, "POST", { text: `Burst ${i}` })).status;
  assert.equal(status, 429);
  await assert.rejects(pool.query("UPDATE messages SET body='edited' WHERE id=$1", [reply.id]), /cannot be edited/);
  await assert.rejects(pool.query("INSERT INTO conversations(user_id,organizer_id) VALUES($1,$2)", [ids.org, ids.alice]), /only between a user and an organizer/);
  console.log("PASS: chat start rules, admin and stranger denial, ordered concurrent messages, read state, notifications, email preference, blocked accounts and rate limit");
} finally {
  await pool.end();
}
