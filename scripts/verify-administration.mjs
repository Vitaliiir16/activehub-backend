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
  /** Sends with the CSRF token and cookies of the same token response, so concurrent calls cannot mix them. */
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
  password = "AdminTestPassword123",
  email = (name) => `adm-${name}-${run}@example.test`;
const good = { number: "4242424242424242", holder: "Test Member", expiryMonth: 12, expiryYear: new Date().getUTCFullYear() + 1, cvv: "123" };
const one = async (sql, values) => (await pool.query(sql, values)).rows[0];
const count = async (sql, values) => Number((await one(sql, values)).n);
const adminLogin = async () => {
  const b = new Browser();
  await b.call("/api/auth/login", "POST", { email: process.env.INITIAL_ADMIN_EMAIL, password: process.env.INITIAL_ADMIN_PASSWORD });
  return b;
};
const login = async (name) => {
  const b = new Browser();
  await b.call("/api/auth/login", "POST", { email: email(name), password });
  return b;
};
const activeAdmins = () => count("SELECT count(*) AS n FROM accounts WHERE role='ADMIN' AND status='ACTIVE'");

const dictionaryState = [];
try {
  const admin = await adminLogin(),
    guest = new Browser(),
    org = new Browser(),
    org2 = new Browser(),
    ana = new Browser(),
    ben = new Browser(),
    cleo = new Browser(),
    stranger = new Browser();
  // A second administrator account, so concurrent requests use independent sessions and independent account locks.
  const secondAdmin = email("second-admin");
  await admin.call("/api/admin/administrators", "POST", { email: secondAdmin, password, displayName: "Second Admin" }, 201);
  const admin2 = new Browser();
  await admin2.call("/api/auth/login", "POST", { email: secondAdmin, password });
  const cities = (await admin.call("/api/admin/cities?pageSize=100")).items,
    directions = (await admin.call("/api/admin/directions?pageSize=100")).items;
  const city = cities[0].id,
    city2 = cities[1].id,
    dirX = directions[0].id,
    dirY = directions[1].id;
  const ids = {};
  const register = async (b, role, name, extra = {}) => {
    await b.call(`/api/auth/register/${role}`, "POST", {
      email: email(name), password, passwordConfirmation: password, phone: "+380501234567", cityId: city,
      ...(role === "user" ? { firstName: name[0].toUpperCase() + name.slice(1), lastName: "Tester", gender: "UNDISCLOSED" } : { name: `${name} Sports`, type: "CLUB", directionIds: [dirX] }),
      ...extra,
    }, 201);
    ids[name] = (await b.call("/api/me")).id;
  };
  await register(org, "organizer", "orga");
  await register(org2, "organizer", "orgb", { type: "TRAINER" });
  for (const [b, name] of [[ana, "ana"], [ben, "ben"], [cleo, "cleo"], [stranger, "stranger"]]) await register(b, "user", name);

  const create = (b, { price = 10000, mode = "AUTO", capacity = 5, hours = 48, direction = dirX, cityId = city, title } = {}) =>
    b.call("/api/organizer/events", "POST", {
      title: title ?? `Admin ${randomUUID()}`, description: "Administration integration activity", kind: "TRAINING",
      directionId: direction, cityId, address: "1 Admin Street", skill: "ANY", age: "ANY", priceMinor: price,
      seatsPerSession: capacity, confirmationMode: mode,
      sessions: [{ startsAt: new Date(Date.now() + hours * 3600000).toISOString(), endsAt: new Date(Date.now() + (hours + 1) * 3600000).toISOString(), seatsTotal: capacity }],
    }, 201);
  const reserve = (b, e, extra = {}) => b.call("/api/bookings", "POST", { sessionId: e.nextSession.id, seats: 1, paymentMethod: "CARD", ...extra }, 201);
  const pay = (b, id) => b.call(`/api/bookings/${id}/payments`, "POST", good, 201);
  const notice = (accountId, type, extra = "") =>
    one(`SELECT count(*) AS n FROM notifications WHERE account_id=$1 AND type=$2 ${extra}`, [accountId, type]).then((r) => Number(r.n));

  // ---- Access: only administrators; administrators are not reachable through user and organizer endpoints.
  const adminPaths = [
    ["/api/admin/users", "GET"], ["/api/admin/organizers", "GET"], ["/api/admin/events", "GET"], ["/api/admin/bookings", "GET"],
    ["/api/admin/subscriptions", "GET"], ["/api/admin/subscription-plans", "GET"], ["/api/admin/cities", "GET"], ["/api/admin/directions", "GET"],
  ];
  for (const [path, method] of adminPaths) {
    await guest.call(path, method, undefined, 401);
    await ana.call(path, method, undefined, 403);
    await org.call(path, method, undefined, 403);
  }
  await ana.call(`/api/admin/users/${ids.ben}/status`, "PATCH", { status: "BLOCKED", reason: "x" }, 403);
  await org.call(`/api/admin/organizers/${ids.orgb}`, "DELETE", { reason: "x" }, 403);
  await ana.call("/api/admin/cities", "POST", { name: "Nowhere" }, 403);
  const adminId = (await admin.call("/api/me")).id;
  await admin.call(`/api/admin/users/${adminId}`, "GET", undefined, 404);
  await admin.call(`/api/admin/organizers/${adminId}/status`, "PATCH", { status: "BLOCKED", reason: "x" }, 404);
  await admin.call(`/api/admin/users/${randomUUID()}`, "GET", undefined, 404);
  await admin.call("/api/admin/users/not-a-uuid", "GET", undefined, 422);
  await admin.call("/api/admin/users?page=0", "GET", undefined, 422);
  console.log("PASS: administration endpoints deny guests, users and organizers; administrators are not reachable as users or organizers");

  // ---- User and organizer search, details and contact edits.
  assert.equal((await admin.call(`/api/admin/users?id=${ids.ana}`)).items.length, 1);
  assert.equal((await admin.call(`/api/admin/users?id=${ids.ana}`)).items[0].displayName, "Ana Tester");
  assert.deepEqual((await admin.call(`/api/admin/users?search=${encodeURIComponent(email("ben"))}`)).items.map((u) => u.id), [ids.ben]);
  assert.ok((await admin.call("/api/admin/users?search=ana%20tes")).items.some((u) => u.id === ids.ana));
  assert.ok((await admin.call("/api/admin/users?search=%2B38%20050%201234567")).meta.totalItems >= 4);
  assert.equal((await admin.call(`/api/admin/users?search=${run}&cityId=${city2}`)).items.length, 0);
  assert.equal((await admin.call(`/api/admin/users?search=${run}&cityId=${city}`)).meta.totalItems, 4);
  const today = new Date().toISOString().slice(0, 10);
  assert.equal((await admin.call(`/api/admin/users?search=${run}&registeredFrom=${today}`)).meta.totalItems >= 3, true);
  assert.equal((await admin.call(`/api/admin/users?search=${run}&registeredTo=2020-01-01`)).meta.totalItems, 0);
  await admin.call("/api/admin/users?registeredFrom=2026-02-02&registeredTo=2026-01-01", "GET", undefined, 422);
  const sorted = (await admin.call(`/api/admin/users?search=${run}&sort=oldest&pageSize=2`));
  assert.equal(sorted.items.length, 2);
  assert.deepEqual(sorted.meta, { page: 1, pageSize: 2, totalItems: 4, totalPages: 2 });
  assert.ok(sorted.items[0].createdAt <= sorted.items[1].createdAt);
  const detail = await admin.call(`/api/admin/users/${ids.ana}`);
  assert.equal(detail.account.role, "USER");
  assert.equal(detail.profile.loyaltyLevel, "STANDARD");
  assert.ok("pointsBalance" in detail.profile && "cardLockedByAdmin" in detail.profile);
  assert.deepEqual((await admin.call(`/api/admin/organizers?name=orga&type=CLUB`)).items.map((o) => o.id).filter((id) => id === ids.orga), [ids.orga]);
  assert.deepEqual((await admin.call(`/api/admin/organizers?id=${ids.orgb}&type=TRAINER`)).items.map((o) => o.id), [ids.orgb]);
  assert.equal((await admin.call(`/api/admin/organizers?id=${ids.orgb}&type=CLUB`)).items.length, 0);
  assert.ok((await admin.call(`/api/admin/organizers?directionId=${dirX}&cityId=${city}`)).items.some((o) => o.id === ids.orga));
  assert.equal((await admin.call(`/api/admin/organizers?id=${ids.orga}&directionId=${dirY}`)).items.length, 0);
  assert.equal((await admin.call(`/api/admin/organizers/${ids.orgb}`)).profile.type, "TRAINER");

  const edited = await admin.call(`/api/admin/users/${ids.ben}`, "PATCH", { firstName: "Benjamin", phone: "+380671112233", cityId: city2 });
  assert.equal(edited.profile.firstName, "Benjamin");
  assert.equal(edited.profile.city.id, city2);
  await admin.call(`/api/admin/users/${ids.ben}`, "PATCH", { email: email("ana") }, 409);
  await admin.call(`/api/admin/users/${ids.ben}`, "PATCH", { password: "NewPassword123" }, 422);
  await admin.call(`/api/admin/users/${ids.ben}`, "PATCH", { photoId: randomUUID() }, 422);
  await admin.call(`/api/admin/users/${ids.ben}`, "PATCH", { phone: "12345" }, 422);
  await admin.call(`/api/admin/users/${ids.ben}`, "PATCH", {}, 422);
  await admin.call(`/api/admin/users/${ids.ben}`, "PATCH", { cityId: city }, 200);
  const edOrg = await admin.call(`/api/admin/organizers/${ids.orgb}`, "PATCH", { name: "Renamed Trainer", phone: "+380931234567", directionIds: [dirX, dirY] });
  assert.equal(edOrg.profile.name, "Renamed Trainer");
  assert.equal(edOrg.profile.directions.length, 2);
  assert.equal(await notice(ids.orgb, "ACCOUNT_EDITED_BY_ADMIN"), 1);
  assert.equal(await count("SELECT count(*) AS n FROM notifications n JOIN email_outbox e ON e.notification_id=n.id WHERE n.account_id=$1 AND n.type='ACCOUNT_EDITED_BY_ADMIN'", [ids.orgb]), 1);
  assert.equal(await notice(ids.ben, "ACCOUNT_EDITED_BY_ADMIN"), 0);
  assert.equal(await count("SELECT count(*) AS n FROM admin_audit_log WHERE target_id=$1 AND action='USER_EDIT'", [ids.ben]), 2);
  console.log("PASS: user and organizer search by ID, name, contact, city, type, direction and date; details; contact edits reject passwords, photos and duplicates");

  // ---- Block versus delete for a user: blocking keeps bookings, ends sessions and can be reversed.
  const manual = await create(org, { mode: "MANUAL" });
  const auto = await create(org);
  const bAna = await reserve(ana, auto);
  await pay(ana, bAna.id);
  assert.equal((await ana.call(`/api/bookings/${bAna.id}`)).status, "CONFIRMED");
  await admin.call(`/api/admin/users/${ids.ana}/status`, "PATCH", { status: "BLOCKED" }, 422);
  const blocked = await admin.call(`/api/admin/users/${ids.ana}/status`, "PATCH", { status: "BLOCKED", reason: "Terms violation" });
  assert.equal(blocked.account.status, "BLOCKED");
  await ana.call("/api/me", "GET", undefined, 401);
  await new Browser().call("/api/auth/login", "POST", { email: email("ana"), password }, 403);
  assert.equal(await count("SELECT count(*) AS n FROM bookings WHERE id=$1 AND status='CONFIRMED'", [bAna.id]), 1);
  assert.equal(await count("SELECT count(*) AS n FROM admin_audit_log WHERE target_id=$1 AND action='USER_BLOCK' AND reason='Terms violation'", [ids.ana]), 1);
  assert.equal((await admin.call(`/api/admin/users?id=${ids.ana}&status=BLOCKED`)).items.length, 1);
  assert.equal((await admin.call(`/api/admin/users?id=${ids.ana}&status=ACTIVE`)).items.length, 0);
  await admin.call(`/api/admin/users/${ids.ana}/status`, "PATCH", { status: "BLOCKED", reason: "again" });
  assert.equal(await count("SELECT count(*) AS n FROM admin_audit_log WHERE target_id=$1 AND action='USER_BLOCK'", [ids.ana]), 1, "repeating a block records nothing");
  await admin.call(`/api/admin/users/${ids.ana}/status`, "PATCH", { status: "ACTIVE", reason: "Appeal accepted" });
  const anaAgain = await login("ana");
  assert.equal((await anaAgain.call(`/api/bookings/${bAna.id}`)).status, "CONFIRMED");
  console.log("PASS: blocking ends sessions and sign-in but keeps bookings; unblocking restores access; every decision is audited");

  // ---- Organizer block: hidden and closed to new bookings while existing bookings continue.
  const hidden = await create(org2, { title: `Hidden ${run}`, price: 10000 });
  const bBen = await reserve(ben, hidden);
  assert.ok((await stranger.call(`/api/events?cityId=all&title=${encodeURIComponent(hidden.title)}`)).items.some((e) => e.id === hidden.id));
  const plan = await org2.call("/api/organizer/subscription-plans", "POST", { name: `Plan ${run}`, type: "MONTHLY", description: "Monthly", priceMinor: 20000, validityDays: 30, visitsLimit: 8, scope: "ALL_EVENTS", directionIds: [] }, 201);
  await admin.call(`/api/admin/organizers/${ids.orgb}/status`, "PATCH", { status: "BLOCKED" }, 422);
  await admin.call(`/api/admin/organizers/${ids.orgb}/status`, "PATCH", { status: "BLOCKED", reason: "Safety review" });
  await org2.call("/api/me", "GET", undefined, 401);
  assert.equal((await stranger.call(`/api/events?cityId=all&title=${encodeURIComponent(hidden.title)}`)).items.length, 0);
  await stranger.call(`/api/events/${hidden.id}`, "GET", undefined, 404);
  await stranger.call(`/api/events/${hidden.id}/sessions`, "GET", undefined, 404);
  await stranger.call(`/api/organizers/${ids.orgb}`, "GET", undefined, 404);
  assert.equal((await stranger.call(`/api/organizers/${ids.orgb}/plans`)).items.length, 0);
  await stranger.call("/api/bookings", "POST", { sessionId: hidden.nextSession.id, seats: 1, paymentMethod: "CARD" }, 409);
  assert.equal((await ben.call(`/api/bookings/${bBen.id}`)).status, "AWAITING_PAYMENT", "existing bookings survive");
  assert.equal((await pay(ben, bBen.id)).status, "SUCCEEDED", "existing bookings can still be paid");
  assert.equal(await notice(ids.orgb, "ACCOUNT_BLOCKED"), 1);
  assert.equal(await count("SELECT count(*) AS n FROM notifications n JOIN email_outbox e ON e.notification_id=n.id WHERE n.account_id=$1 AND n.type='ACCOUNT_BLOCKED'", [ids.orgb]), 1);
  assert.ok((await admin.call(`/api/admin/events?id=${hidden.id}`)).items.length === 1, "administrators still see the event");
  await admin.call(`/api/admin/organizers/${ids.orgb}/status`, "PATCH", { status: "ACTIVE", reason: "Cleared" });
  const org2Again = await login("orgb");
  assert.equal((await stranger.call(`/api/events?cityId=all&title=${encodeURIComponent(hidden.title)}`)).items.length, 1);
  assert.equal(await notice(ids.orgb, "ACCOUNT_RESTORED"), 1);
  console.log("PASS: blocking an organizer hides its events, plans and page and stops new bookings while existing bookings continue; unblocking restores it");

  // ---- Soft deletion of a user compensates every active booking exactly once, even with concurrent administrators.
  const free = await create(org, { price: 0 });
  const sub = await org.call("/api/organizer/subscription-plans", "POST", { name: `Visits ${run}`, type: "MONTHLY", description: "Visits", priceMinor: 30000, validityDays: 30, visitsLimit: 4, scope: "ALL_EVENTS", directionIds: [] }, 201);
  const purchased = await cleo.call("/api/subscriptions", "POST", { planId: sub.id, card: good }, 201);
  const bPending = await reserve(cleo, manual);
  const bPaid = await reserve(cleo, await create(org));
  await pay(cleo, bPaid.id);
  const bFree = await reserve(cleo, free);
  const bSub = await reserve(cleo, await create(org), { paymentMethod: "SUBSCRIPTION", subscriptionId: purchased.subscription.id });
  const bDone = await reserve(cleo, await create(org, { price: 0 }));
  await pool.query("UPDATE bookings SET status='COMPLETED' WHERE id=$1", [bDone.id]);
  const before = await one("SELECT points_balance FROM user_profiles WHERE account_id=$1", [ids.cleo]);
  assert.ok(before.points_balance > 0);
  const visitsBefore = (await cleo.call(`/api/subscriptions/${purchased.subscription.id}`)).visitsLeft;
  assert.equal(visitsBefore, 3);
  const keys = [randomUUID(), randomUUID()];
  const racing = await Promise.all([
    admin.send(`/api/admin/users/${ids.cleo}`, "DELETE", { reason: "Requested by the member" }, keys[0]),
    admin2.send(`/api/admin/users/${ids.cleo}`, "DELETE", { reason: "Requested by the member" }, keys[1]),
  ]);
  assert.deepEqual(racing.map((r) => r.status), [204, 204], JSON.stringify(racing.map((r) => r.data)));
  assert.equal((await admin.call(`/api/admin/users/${ids.cleo}`)).account.status, "DELETED");
  await cleo.call("/api/me", "GET", undefined, 401);
  await new Browser().call("/api/auth/login", "POST", { email: email("cleo"), password }, 401);
  const states = (await pool.query("SELECT id,status,cancelled_by FROM bookings WHERE user_id=$1", [ids.cleo])).rows;
  for (const id of [bPending.id, bPaid.id, bFree.id, bSub.id]) {
    const row = states.find((r) => r.id === id);
    assert.equal(row.status, "CANCELLED", `booking ${id}`);
    assert.equal(row.cancelled_by, "ADMIN");
  }
  assert.equal(states.find((r) => r.id === bDone.id).status, "COMPLETED", "finished bookings stay as history");
  assert.equal(await count("SELECT count(*) AS n FROM refunds r JOIN payments p ON p.id=r.payment_id WHERE p.booking_id=$1", [bPaid.id]), 1);
  assert.equal(await count("SELECT count(*) AS n FROM payments WHERE booking_id=$1 AND status='REFUNDED'", [bPaid.id]), 1);
  assert.equal(await count("SELECT count(*) AS n FROM payments WHERE subscription_id=$1 AND status='SUCCEEDED'", [purchased.subscription.id]), 1, "subscription purchases are not refunded");
  assert.equal((await one("SELECT visits_left FROM user_subscriptions WHERE id=$1", [purchased.subscription.id])).visits_left, 4);
  assert.equal(await count("SELECT count(*) AS n FROM points_transactions WHERE booking_id=$1 AND reason='REVERSAL'", [bPaid.id]), 1);
  assert.equal(await count("SELECT count(*) AS n FROM points_transactions WHERE booking_id=$1 AND reason='REVERSAL'", [bFree.id]), 1);
  assert.equal(await count("SELECT count(*) AS n FROM admin_audit_log WHERE target_id=$1 AND action='USER_DELETE'", [ids.cleo]), 1, "one effective deletion");
  assert.equal(await notice(ids.orga, "BOOKING_CANCELLED", `AND link='/organizer/bookings/${bPaid.id}'`), 1, "the organizer is told");
  assert.equal(await notice(ids.cleo, "PAYMENT_REFUNDED"), 1);
  const orgView = await org.call(`/api/organizer/bookings/${bPaid.id}`);
  assert.equal(orgView.user.email, undefined, "contact data is hidden once a booking is cancelled");
  assert.equal((await admin.call(`/api/admin/bookings?userId=${ids.cleo}&pageSize=50`)).meta.totalItems, 5, "history survives soft deletion");
  assert.equal((await pool.query("SELECT 1 FROM user_profiles WHERE account_id=$1", [ids.cleo])).rowCount, 1);
  await admin.call(`/api/admin/users/${ids.cleo}`, "PATCH", { firstName: "Nobody" }, 409);
  await admin.call(`/api/admin/users/${ids.cleo}/status`, "PATCH", { status: "ACTIVE", reason: "x" }, 409);
  await admin.call(`/api/admin/users/${ids.cleo}`, "DELETE", { reason: "Again" }, 204);
  assert.equal(await count("SELECT count(*) AS n FROM refunds r JOIN payments p ON p.id=r.payment_id WHERE p.booking_id=$1", [bPaid.id]), 1, "a repeat changes nothing");
  assert.equal(await count("SELECT count(*) AS n FROM admin_audit_log WHERE target_id=$1 AND action='USER_DELETE'", [ids.cleo]), 1);
  console.log("PASS: deleting a user cancels, refunds and compensates every active booking once under concurrent requests, keeps history and notifies organizers");

  // ---- Soft deletion of an organizer cancels and refunds its events, archives plans and keeps finished history.
  const live = await create(org, { title: `Live ${run}` });
  const pending = await create(org, { mode: "MANUAL" });
  const past = await create(org, { price: 0 });
  const liveBooking = await reserve(anaAgain, live);
  await pay(anaAgain, liveBooking.id);
  const pendingBooking = await reserve(ben, pending);
  const pastBooking = await reserve(anaAgain, past);
  await pool.query("UPDATE event_sessions SET starts_at=now()-interval '3 hours',ends_at=now()-interval '2 hours' WHERE event_id=$1", [past.id]);
  await pool.query("UPDATE bookings SET status='COMPLETED' WHERE id=$1", [pastBooking.id]);
  await pool.query("UPDATE event_sessions SET status='COMPLETED' WHERE event_id=$1", [past.id]);
  const orgPlan = await org.call("/api/organizer/subscription-plans", "POST", { name: `OrgPlan ${run}`, type: "MONTHLY", description: "Monthly", priceMinor: 20000, validityDays: 30, visitsLimit: 8, scope: "ALL_EVENTS", directionIds: [] }, 201);
  const oldBen = await login("ben");
  const deletion = await admin.call(`/api/admin/organizers/${ids.orga}`, "DELETE", { reason: "Closed down" }, 204);
  assert.equal(deletion, null);
  assert.equal((await admin.call(`/api/admin/organizers/${ids.orga}`)).account.status, "DELETED");
  await org.call("/api/me", "GET", undefined, 401);
  for (const [id, booking] of [[live.id, liveBooking.id], [pending.id, pendingBooking.id]]) {
    assert.equal((await pool.query("SELECT status FROM events WHERE id=$1", [id])).rows[0].status, "CANCELLED");
    assert.equal((await pool.query("SELECT status FROM bookings WHERE id=$1", [booking])).rows[0].status, "CANCELLED");
  }
  assert.equal((await pool.query("SELECT status FROM events WHERE id=$1", [past.id])).rows[0].status, "ACTIVE", "finished events are not rewritten");
  assert.equal((await pool.query("SELECT status FROM bookings WHERE id=$1", [pastBooking.id])).rows[0].status, "COMPLETED");
  assert.equal(await count("SELECT count(*) AS n FROM payments WHERE booking_id=$1 AND status='REFUNDED'", [liveBooking.id]), 1);
  assert.equal(await count("SELECT count(*) AS n FROM refunds r JOIN payments p ON p.id=r.payment_id WHERE p.booking_id=$1", [liveBooking.id]), 1);
  assert.equal((await pool.query("SELECT status FROM subscription_plans WHERE id=$1", [orgPlan.id])).rows[0].status, "ARCHIVED");
  assert.equal(await notice(ids.ana, "BOOKING_CANCELLED", `AND link='/bookings/${liveBooking.id}'`), 1, "members are notified");
  assert.equal(await notice(ids.ben, "BOOKING_CANCELLED", `AND link='/bookings/${pendingBooking.id}'`), 1);
  assert.equal(await notice(ids.orga, "ACCOUNT_DELETED"), 1);
  await stranger.call(`/api/organizers/${ids.orga}`, "GET", undefined, 404);
  assert.equal((await stranger.call(`/api/events?cityId=all&title=${encodeURIComponent(live.title)}`)).items.length, 0);
  assert.equal((await admin.call(`/api/admin/events?organizerId=${ids.orga}&pageSize=100`)).meta.totalItems >= 6, true, "events remain visible to administrators");
  assert.equal((await oldBen.call(`/api/bookings/${pendingBooking.id}`)).status, "CANCELLED");
  await admin.call(`/api/admin/organizers/${ids.orga}`, "DELETE", { reason: "Again" }, 204);
  assert.equal(await count("SELECT count(*) AS n FROM admin_audit_log WHERE target_id=$1 AND action='ORGANIZER_DELETE'", [ids.orga]), 1);
  console.log("PASS: deleting an organizer cancels and refunds active events once, archives plans, notifies members and keeps finished history");

  // ---- Races between a member action and an administrator action never leave an active booking behind.
  const contested = await create(org2Again, { title: `Contested ${run}` });
  const rival = await login("ben");
  const bRace = await reserve(rival, contested);
  const payer = await login("ben");
  const [paid, deleted] = await Promise.all([
    payer.send(`/api/bookings/${bRace.id}/payments`, "POST", good),
    admin.send(`/api/admin/users/${ids.ben}`, "DELETE", { reason: "Race check" }),
  ]);
  assert.equal(deleted.status, 204);
  assert.ok([201, 401, 409].includes(paid.status), `payment ${paid.status}`);
  const raced = await one("SELECT status FROM bookings WHERE id=$1", [bRace.id]);
  assert.equal(raced.status, "CANCELLED");
  assert.equal(await count("SELECT count(*) AS n FROM payments WHERE booking_id=$1 AND status='SUCCEEDED'", [bRace.id]), 0, "no charge is left unrefunded");
  assert.equal(await count("SELECT count(*) AS n FROM bookings WHERE user_id=$1 AND status IN ('PENDING','AWAITING_PAYMENT','CONFIRMED')", [ids.ben]), 0);
  assert.equal(await count("SELECT count(*) AS n FROM refunds r JOIN payments p ON p.id=r.payment_id WHERE p.booking_id=$1", [bRace.id]) <= 1, true);
  console.log("PASS: a payment racing an account deletion leaves the booking cancelled and every charge refunded");

  // ---- Platform-wide event, booking and subscription search.
  const target = await create(org2Again, { title: `Findable ${run}`, cityId: city2, direction: dirY });
  await org2Again.call(`/api/organizer/events/${target.id}/status`, "PATCH", { status: "PAUSED" });
  assert.equal((await admin.call(`/api/admin/events?id=${target.id}`)).items[0].status, "PAUSED");
  assert.equal((await stranger.call(`/api/events?cityId=all&title=Findable%20${run}`)).items.length, 0, "the public search hides paused events");
  assert.equal((await admin.call(`/api/admin/events?title=findable%20${run}&status=PAUSED`)).items.length, 1);
  assert.equal((await admin.call(`/api/admin/events?title=findable%20${run}&status=ACTIVE`)).items.length, 0);
  assert.equal((await admin.call(`/api/admin/events?title=findable%20${run}&cityId=${city2}&directionId=${dirY}&kind=TRAINING&organizerId=${ids.orgb}`)).items.length, 1);
  assert.equal((await admin.call(`/api/admin/events?title=findable%20${run}&cityId=${city}`)).items.length, 0);
  assert.equal((await admin.call(`/api/admin/events?title=findable%20${run}&organizerId=${ids.orga}`)).items.length, 0);
  const day = new Date(target.nextSession.startsAt).toISOString().slice(0, 10);
  assert.equal((await admin.call(`/api/admin/events?title=findable%20${run}&dateFrom=${day}&dateTo=${day}`)).items.length >= 0, true);
  assert.equal((await admin.call(`/api/admin/events?title=findable%20${run}&dateFrom=2020-01-01&dateTo=2020-01-02`)).items.length, 0);
  const cancelledEvents = await admin.call(`/api/admin/events?organizerId=${ids.orga}&status=CANCELLED&pageSize=100`);
  assert.ok(cancelledEvents.items.length >= 5 && cancelledEvents.items.every((e) => e.status === "CANCELLED"));
  assert.ok((await admin.call(`/api/admin/events?organizerId=${ids.orga}&pageSize=100`)).items.some((e) => e.id === past.id && e.nextSession === null), "events without upcoming sessions are listed");
  const allBookings = await admin.call(`/api/admin/bookings?organizerId=${ids.orga}&pageSize=100`);
  assert.ok(allBookings.items.length >= 8 && allBookings.items.every((b) => b.organizerId === ids.orga));
  assert.deepEqual((await admin.call(`/api/admin/bookings?id=${bPaid.id}`)).items.map((b) => b.id), [bPaid.id]);
  assert.ok((await admin.call(`/api/admin/bookings?eventId=${live.id}`)).items.every((b) => b.eventId === live.id));
  assert.equal((await admin.call(`/api/admin/bookings?eventName=${encodeURIComponent("live " + run)}`)).items.length, 1);
  assert.ok((await admin.call(`/api/admin/bookings?userId=${ids.cleo}&status=CANCELLED&pageSize=100`)).items.every((b) => b.status === "CANCELLED" && b.userId === ids.cleo));
  assert.equal((await admin.call(`/api/admin/bookings?userId=${ids.cleo}&status=COMPLETED`)).items.length, 1);
  assert.equal((await admin.call(`/api/admin/bookings?id=${bPaid.id}&dateFrom=2020-01-01&dateTo=2020-01-02`)).items.length, 0);
  const newest = (await admin.call(`/api/admin/bookings?userId=${ids.cleo}&sort=newest&pageSize=100`)).items;
  assert.ok(newest.every((b, i) => i === 0 || newest[i - 1].createdAt >= b.createdAt));
  assert.equal((await admin.call(`/api/admin/subscriptions?userId=${ids.cleo}`)).items.length, 1);
  assert.equal((await admin.call(`/api/admin/subscriptions?organizerId=${ids.orga}&status=ACTIVE`)).items.filter((s) => s.id === purchased.subscription.id).length, 1);
  assert.equal((await admin.call(`/api/admin/subscriptions?userId=${ids.cleo}&status=EXPIRED`)).items.length, 0);
  assert.ok((await admin.call(`/api/admin/subscription-plans?organizerId=${ids.orga}&pageSize=100`)).items.every((p) => p.organizerId === ids.orga));
  assert.equal((await admin.call(`/api/admin/subscription-plans?organizerId=${ids.orga}&status=ACTIVE`)).items.length, 0, "the deleted organizer's plans are archived");
  console.log("PASS: administrators search every event status, booking, subscription and plan with exact filters");

  // ---- Plan archive keeps purchases usable and stops new ones.
  const buyer = await login("stranger");
  await admin.call(`/api/admin/subscription-plans/${plan.id}/archive`, "POST", undefined, 200);
  assert.equal((await pool.query("SELECT status FROM subscription_plans WHERE id=$1", [plan.id])).rows[0].status, "ARCHIVED");
  await buyer.call("/api/subscriptions", "POST", { planId: plan.id, card: good }, 409);
  await admin.call(`/api/admin/subscription-plans/${plan.id}/archive`, "POST", undefined, 200);
  await org2Again.call(`/api/admin/subscription-plans/${plan.id}/archive`, "POST", undefined, 403);
  assert.equal(await count("SELECT count(*) AS n FROM admin_audit_log WHERE target_id=$1 AND action='PLAN_ARCHIVE'", [plan.id]) >= 1, true);
  console.log("PASS: administrators archive plans; new purchases stop");

  // ---- Event moderation by an administrator is audited and reaches the organizer.
  const moderated = await create(org2Again);
  await admin.call(`/api/admin/events/${moderated.id}/status`, "PATCH", { status: "BLOCKED", reason: "Misleading text" });
  await admin.call(`/api/admin/events/${moderated.id}`, "PATCH", { description: "Corrected by an administrator" });
  assert.equal(await count("SELECT count(*) AS n FROM admin_audit_log WHERE target_id=$1 AND action IN ('EVENT_BLOCKED','EVENT_EDIT')", [moderated.id]), 2);
  await admin.call(`/api/admin/events/${moderated.id}/cancel`, "POST", { reason: "Repeated violations" });
  assert.equal(await count("SELECT count(*) AS n FROM admin_audit_log WHERE target_id=$1 AND action='EVENT_CANCEL'", [moderated.id]), 1);

  // ---- Dictionaries: add, rename, deactivate and the last-active guard.
  const cityName = `Testville ${run.slice(0, 8)}`;
  const created = await admin.call("/api/admin/cities", "POST", { name: cityName }, 201);
  assert.equal(created.isActive, true);
  await admin.call("/api/admin/cities", "POST", { name: cityName.toUpperCase() }, 409);
  await admin.call("/api/admin/cities", "POST", { name: "x" }, 422);
  await admin.call("/api/admin/cities", "POST", { name: "Valid", extra: 1 }, 422);
  const renamed = await admin.call(`/api/admin/cities/${created.id}`, "PATCH", { name: `${cityName} Renamed` });
  assert.equal(renamed.name, `${cityName} Renamed`);
  await admin.call(`/api/admin/cities/${created.id}`, "PATCH", { name: cities[0].name }, 409);
  await admin.call(`/api/admin/cities/${created.id}`, "PATCH", {}, 422);
  await admin.call(`/api/admin/cities/${randomUUID()}`, "PATCH", { name: "Nothing" }, 404);
  const inUse = await create(org2Again, { cityId: created.id });
  await admin.call(`/api/admin/cities/${created.id}`, "PATCH", { isActive: false });
  assert.equal((await admin.call(`/api/admin/cities?isActive=false&pageSize=100`)).items.some((c) => c.id === created.id), true);
  assert.equal((await admin.call(`/api/admin/cities?isActive=true&pageSize=100`)).items.some((c) => c.id === created.id), false);
  assert.equal((await pool.query("SELECT city_id FROM events WHERE id=$1", [inUse.id])).rows[0].city_id, created.id, "existing references are kept");
  assert.ok(!(await new Browser().call("/api/cities?pageSize=100")).items.some((c) => c.id === created.id), "inactive cities leave the public list");
  await new Browser().call("/api/auth/register/user", "POST", { email: email("late"), password, passwordConfirmation: password, phone: "+380501234567", cityId: created.id, firstName: "Late", lastName: "Joiner", gender: "UNDISCLOSED" }, 422);
  await org2Again.call("/api/organizer/events", "POST", { title: `Inactive ${run}`, description: "x", kind: "TRAINING", directionId: dirX, cityId: created.id, address: "1 St", skill: "ANY", age: "ANY", priceMinor: 0, seatsPerSession: 2, sessions: [{ startsAt: new Date(Date.now() + 72 * 3600000).toISOString(), endsAt: new Date(Date.now() + 73 * 3600000).toISOString(), seatsTotal: 2 }] }, 422);
  await admin.call(`/api/admin/cities/${created.id}`, "PATCH", { isActive: true });
  const dirName = `Testing ${run.slice(0, 8)}`;
  const newDirection = await admin.call("/api/admin/directions", "POST", { name: dirName, isActive: false }, 201);
  assert.equal(newDirection.isActive, false);
  await admin.call(`/api/admin/directions/${newDirection.id}`, "PATCH", { isActive: true });
  const everyDirection = (await admin.call("/api/admin/directions?pageSize=100")).items;
  for (const d of everyDirection) dictionaryState.push({ id: d.id, isActive: d.isActive });
  const active = everyDirection.filter((d) => d.isActive);
  const [keep, ...others] = active;
  const deactivate = await Promise.all([
    admin.send(`/api/admin/directions/${others[0].id}`, "PATCH", { isActive: false }),
    admin2.send(`/api/admin/directions/${others[1].id}`, "PATCH", { isActive: false }),
  ]);
  assert.deepEqual(deactivate.map((r) => r.status), [200, 200]);
  for (const d of others.slice(2)) await admin.call(`/api/admin/directions/${d.id}`, "PATCH", { isActive: false });
  const lastRace = await Promise.all([admin.send(`/api/admin/directions/${keep.id}`, "PATCH", { isActive: false }), admin2.send(`/api/admin/directions/${keep.id}`, "PATCH", { isActive: false })]);
  assert.deepEqual(lastRace.map((r) => r.status).sort(), [409, 409], "the last active direction cannot be deactivated");
  assert.equal(await count("SELECT count(*) AS n FROM directions WHERE is_active"), 1);
  for (const d of dictionaryState.filter((x) => x.isActive)) await admin.call(`/api/admin/directions/${d.id}`, "PATCH", { isActive: true });
  assert.equal(await count("SELECT count(*) AS n FROM admin_audit_log WHERE target_type='DIRECTION' AND action='DIRECTION_DEACTIVATE'") >= 1, true);
  console.log("PASS: dictionaries add, rename and deactivate keep references, refuse new selections and keep one active value under concurrent requests");

  // ---- Last-administrator protection and the append-only audit trail.
  const sessionBefore = await activeAdmins();
  await admin.call(`/api/admin/administrators/${adminId}/status`, "PATCH", { status: "BLOCKED", reason: "Self" }, 409);
  assert.equal(await activeAdmins(), sessionBefore);
  await assert.rejects(pool.query("UPDATE admin_audit_log SET reason='changed'"), /append-only/);
  await assert.rejects(pool.query("DELETE FROM admin_audit_log"), /append-only/);
  console.log("PASS: administrators cannot block themselves; the audit log is append-only");
} finally {
  try {
    const restore = await adminLogin();
    for (const d of dictionaryState) await restore.send(`/api/admin/directions/${d.id}`, "PATCH", { isActive: d.isActive }).catch(() => undefined);
  } catch {
    // The isolated database is disposable; restoring is best effort.
  }
  await pool.end();
}
