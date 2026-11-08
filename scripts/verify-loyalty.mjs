import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createPool } from "../src/infrastructure/database.ts";
import { expireSubscriptions } from "../src/modules/marketplace/subscriptions.ts";
import { revertExpiredCorporateCards } from "../src/modules/loyalty/ledger.ts";
import { kyivMonth } from "../src/modules/loyalty/pricing.ts";

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
      signal: AbortSignal.timeout(20000),
    });
    for (const raw of r.headers.getSetCookie()) {
      const part = raw.split(";")[0],
        i = part.indexOf("=");
      this.cookies.set(part.slice(0, i), part.slice(i + 1));
    }
    return { status: r.status, data: r.status === 204 ? null : await r.json() };
  }
  async call(path, method = "GET", body, status = 200, key = randomUUID()) {
    const headers =
      method === "GET"
        ? {}
        : { "X-CSRF-Token": (await this.raw("/api/auth/csrf")).data.token, "Idempotency-Key": key };
    const r = await this.raw(path, method, body, headers);
    assert.equal(r.status, status, `${method} ${path}: ${JSON.stringify(r.data)}`);
    return r.data;
  }
}
const run = randomUUID(),
  password = "LoyaltyTestPassword123",
  org = new Browser(),
  user = new Browser(),
  other = new Browser(),
  admin = new Browser();
const card = {
  number: "4242424242424242",
  holder: "Test Member",
  expiryMonth: 12,
  expiryYear: new Date().getUTCFullYear() + 1,
  cvv: "123",
};
const one = async (sql, values) => (await pool.query(sql, values)).rows[0];
let originalLevels, originalRules;
try {
  await admin.call("/api/auth/login", "POST", {
    email: process.env.INITIAL_ADMIN_EMAIL,
    password: process.env.INITIAL_ADMIN_PASSWORD,
  });
  originalLevels = await admin.call("/api/admin/loyalty/levels");
  originalRules = await admin.call("/api/admin/loyalty/rules");
  assert.deepEqual(
    originalLevels.map((l) => [l.level, l.multiplier, l.discountPercent]),
    [
      ["STANDARD", "1.00", "0.00"],
      ["PREMIUM", "1.50", "5.00"],
      ["CORPORATE", "2.00", "10.00"],
    ],
  );
  assert.deepEqual(originalRules, { basePointsPerBooking: 10, pointsPerUah: "0.1000", redeemRateMinor: 50, maxRedeemPercent: "30.00" });
  const city = (await org.call("/api/cities?pageSize=100")).items[0].id,
    directions = (await org.call("/api/directions?pageSize=100")).items,
    swimming = directions.find((d) => d.name === "Swimming").id,
    running = directions.find((d) => d.id !== swimming).id;
  assert.deepEqual(originalLevels[1].freeDirectionIds, [swimming]);
  await org.call(
    "/api/auth/register/organizer",
    "POST",
    {
      email: `loyalty-org-${run}@example.test`,
      password,
      passwordConfirmation: password,
      name: "Loyalty Sports",
      type: "CLUB",
      phone: "+380501234567",
      cityId: city,
      directionIds: [swimming],
    },
    201,
  );
  const ids = {};
  for (const [b, name] of [
    [user, "member"],
    [other, "other"],
  ]) {
    await b.call(
        "/api/auth/register/user",
        "POST",
        {
          email: `loyalty-${name}-${run}@example.test`,
          password,
          passwordConfirmation: password,
          firstName: "Loyalty",
          lastName: name,
          phone: "+380501234567",
          cityId: city,
          gender: "UNDISCLOSED",
        },
        201,
      );
    ids[name] = (await b.call("/api/me")).id;
  }
  const create = ({ price = 20000, direction = running, mode = "AUTO", capacity = 10, hours = 48 } = {}) =>
    org.call(
      "/api/organizer/events",
      "POST",
      {
        title: `Loyalty ${randomUUID()}`,
        description: "Loyalty integration activity",
        kind: "TRAINING",
        directionId: direction,
        cityId: city,
        address: "1 Loyalty Street",
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
  const reserve = (b, e, seats = 1, extra = { paymentMethod: "CARD" }, status = 201) =>
    b.call("/api/bookings", "POST", { sessionId: e.nextSession.id, seats, ...extra }, status);
  const pay = (b, id) => b.call(`/api/bookings/${id}/payments`, "POST", card, 201);
  const cancel = (b, id) => b.call(`/api/bookings/${id}/cancel`, "POST", { reason: "Loyalty cancellation" });
  const loyalty = () => user.call("/api/me/loyalty");
  const ledger = async (bookingId) =>
    (await pool.query("SELECT reason,delta,note FROM points_transactions WHERE booking_id=$1 ORDER BY created_at,id", [bookingId])).rows;

  // Standard card: exact award, once-only reversal and lifetime/balance accounting.
  const paidEvent = await create();
  const first = await reserve(user, paidEvent);
  assert.equal(first.amountDueMinor, 20000);
  assert.deepEqual(first.discountBreakdown, []);
  await pay(user, first.id);
  const confirmed = await user.call(`/api/bookings/${first.id}`);
  assert.equal(confirmed.status, "CONFIRMED");
  assert.equal(confirmed.pointsAwarded, 30);
  let summary = await loyalty();
  assert.equal(summary.card.level, "STANDARD");
  assert.equal(summary.pointsBalance, 30);
  assert.equal(summary.lifetimePoints, 30);
  assert.equal(summary.pointsToNextLevel, 470);
  await cancel(user, first.id);
  await cancel(user, first.id);
  assert.deepEqual(
    (await ledger(first.id)).map((t) => [t.reason, t.delta]),
    [
      ["ACCRUAL", 30],
      ["REVERSAL", -30],
    ],
  );
  summary = await loyalty();
  assert.equal(summary.pointsBalance, 0);
  assert.equal(summary.lifetimePoints, 0);
  console.log("PASS: confirmed card booking awards 30 points; repeated cancellation reverses exactly once");

  // Q-01: a reversal never drives the balance below zero; the shortfall is recorded in the note.
  const second = await reserve(user, await create());
  await pay(user, second.id);
  const adjusted = await admin.call(`/api/admin/users/${ids.member}/points-adjustments`, "POST", { delta: -20, reason: "Manual correction" }, 201);
  assert.equal(adjusted.reason, "ADMIN_ADJUST");
  assert.equal(adjusted.note, "Manual correction");
  await admin.call(`/api/admin/users/${ids.member}/points-adjustments`, "POST", { delta: -11, reason: "Overdraw" }, 409);
  await cancel(user, second.id);
  const reversal = (await ledger(second.id)).find((t) => t.reason === "REVERSAL");
  assert.equal(reversal.delta, -10);
  assert.match(reversal.note, /20 already spent/);
  summary = await loyalty();
  assert.equal(summary.pointsBalance, 0);
  const history = await user.call("/api/me/points-transactions?sort=oldest&pageSize=100");
  assert.deepEqual(
    history.items.map((t) => t.reason),
    ["ACCRUAL", "REVERSAL", "ACCRUAL", "ADMIN_ADJUST", "REVERSAL"],
  );
  assert.equal(history.items.reduce((sum, t) => sum + t.delta, 0), 0);
  console.log("PASS: Q-01 clamped reversal keeps a nonnegative balance; admin overdraw is rejected");

  // Premium upgrade by lifetime points, with award snapshots unaffected by later rule changes.
  const premium = originalLevels.find((l) => l.level === "PREMIUM");
  await admin.call("/api/admin/loyalty/levels/PREMIUM", "PUT", { ...premium, pointsThreshold: 30 });
  const third = await reserve(user, await create());
  await pay(user, third.id);
  summary = await loyalty();
  assert.equal(summary.card.level, "PREMIUM");
  assert.equal(summary.pointsToNextLevel, null);
  assert.equal(
    (await one("SELECT count(*)::int AS n FROM notifications WHERE account_id=$1 AND type='CARD_UPGRADED'", [ids.member])).n,
    1,
  );
  await admin.call("/api/admin/loyalty/rules", "PUT", { ...originalRules, basePointsPerBooking: 500 });

  // Premium free quota in the session month and card discount ordering.
  const pool1 = await create({ price: 10000, direction: swimming });
  const free = await reserve(user, pool1, 3);
  assert.equal(free.status, "CONFIRMED");
  assert.equal(free.paymentMethod, "FREE");
  assert.equal(free.amountDueMinor, 0);
  assert.deepEqual(free.discountBreakdown.map((d) => [d.type, d.amountMinor]), [["FREE_ACCESS", 30000]]);
  assert.equal(free.pointsAwarded, 750);
  const month = kyivMonth(new Date(free.startsAt));
  assert.equal(
    (await one("SELECT quota_month::text AS m,visits FROM free_visit_ledger WHERE booking_id=$1", [free.id])).m,
    `${month}-01`,
  );
  const mixed = await reserve(user, await create({ price: 10000, direction: swimming }), 2);
  assert.deepEqual(mixed.discountBreakdown.map((d) => [d.type, d.amountMinor]), [
    ["FREE_ACCESS", 10000],
    ["CARD_DISCOUNT", 500],
  ]);
  assert.equal(mixed.amountDueMinor, 9500);
  const exhausted = await reserve(user, await create({ price: 10000, direction: swimming }));
  assert.equal(exhausted.amountDueMinor, 9500);
  if (month === kyivMonth(new Date())) assert.equal((await loyalty()).freeVisitsUsed, 4);
  await cancel(user, free.id);
  const freeLedger = await ledger(free.id);
  assert.deepEqual(freeLedger.map((t) => [t.reason, t.delta]), [
    ["ACCRUAL", 750],
    ["REVERSAL", -750],
  ]);
  assert.ok(await one("SELECT returned_at FROM free_visit_ledger WHERE booking_id=$1 AND returned_at IS NOT NULL", [free.id]));
  const reused = await reserve(user, await create({ price: 10000, direction: swimming }), 3);
  assert.equal(reused.amountDueMinor, 0);
  console.log("PASS: Premium upgrade, session-month quota, ordered free/card pricing, quota return and award snapshot reversal");

  // MANUAL rejection returns reserved free visits and never awards points.
  await cancel(user, reused.id);
  const manual = await reserve(user, await create({ price: 10000, direction: swimming, mode: "MANUAL" }), 2);
  assert.equal(manual.status, "PENDING");
  assert.equal(manual.amountDueMinor, 0);
  await org.call(`/api/organizer/bookings/${manual.id}/decision`, "POST", { decision: "REJECT", reason: "Full" });
  assert.equal((await ledger(manual.id)).length, 0);
  assert.ok(await one("SELECT 1 FROM free_visit_ledger WHERE booking_id=$1 AND returned_at IS NOT NULL", [manual.id]));

  // Parallel bookings compete for the last free visit; exactly one receives it.
  const lastOne = await reserve(user, await create({ price: 10000, direction: swimming }), 2);
  assert.equal(lastOne.amountDueMinor, 0);
  const [a, b] = await Promise.all([
    reserve(user, await create({ price: 10000, direction: swimming })),
    reserve(user, await create({ price: 10000, direction: swimming })),
  ]);
  assert.equal([a, b].filter((x) => x.amountDueMinor === 0).length, 1);
  console.log("PASS: rejection returns quota without points; concurrent last free visit is granted once");

  // Corporate card: purchase upgrade, subscription award, retained after exhaustion until expiry (Q-04).
  await admin.call("/api/admin/loyalty/rules", "PUT", originalRules);
  const plan = await org.call(
    "/api/organizer/subscription-plans",
    "POST",
    {
      name: `Corporate ${run}`,
      type: "CORPORATE",
      description: "Team plan",
      priceMinor: 100000,
      validityDays: 30,
      visitsLimit: 2,
      scope: "ALL_EVENTS",
      directionIds: [],
    },
    201,
  );
  const bought = await user.call("/api/subscriptions", "POST", { planId: plan.id, companyName: "Loyalty Ltd", card }, 201);
  summary = await loyalty();
  assert.equal(summary.card.level, "CORPORATE");
  const subscribed = await reserve(user, await create(), 2, {
    paymentMethod: "SUBSCRIPTION",
    subscriptionId: bought.subscription.id,
  });
  assert.equal(subscribed.amountDueMinor, 0);
  assert.equal(subscribed.pointsAwarded, 20);
  assert.equal((await user.call(`/api/subscriptions/${bought.subscription.id}`)).status, "EXHAUSTED");
  assert.equal((await loyalty()).card.level, "CORPORATE");
  const corporatePrice = await reserve(user, await create());
  assert.deepEqual(corporatePrice.discountBreakdown.map((d) => [d.type, d.amountMinor]), [["CARD_DISCOUNT", 2000]]);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL session_replication_role=replica");
    await client.query("UPDATE user_subscriptions SET starts_at=now()-interval '2 days',expires_at=now()-interval '1 second' WHERE id=$1", [bought.subscription.id]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  await pool.query("UPDATE background_runs SET next_run_at=now() WHERE name='subscription-expiry'");
  await expireSubscriptions(pool);
  await revertExpiredCorporateCards(pool);
  assert.equal((await one("SELECT loyalty_level FROM user_profiles WHERE account_id=$1", [ids.member])).loyalty_level, "PREMIUM");
  console.log("PASS: Corporate purchase upgrade, subscription award, exhaustion retention and expiry reversion to Premium");

  // Administrator locks and access control.
  await admin.call(`/api/admin/users/${ids.member}/card`, "PATCH", { level: "CORPORATE", locked: false, reason: "No plan" }, 422);
  const locked = await admin.call(`/api/admin/users/${ids.member}/card`, "PATCH", { level: "STANDARD", locked: true, reason: "Policy review" });
  assert.equal(locked.loyaltyLevel, "STANDARD");
  assert.equal(locked.cardLockedByAdmin, true);
  const lockedTrip = await reserve(user, await create());
  await pay(user, lockedTrip.id);
  await user.call("/api/subscriptions", "POST", { planId: plan.id, companyName: "Loyalty Ltd", card }, 201);
  assert.equal((await loyalty()).card.level, "STANDARD");
  const corporate = await admin.call(`/api/admin/users/${ids.member}/card`, "PATCH", { level: "CORPORATE", locked: false, reason: "Plan active" });
  assert.equal(corporate.loyaltyLevel, "CORPORATE");
  assert.equal(corporate.cardLockedByAdmin, false);
  assert.equal((await one("SELECT count(*)::int AS n FROM card_assignments WHERE user_id=$1", [ids.member])).n, 2);
  await user.call("/api/admin/loyalty/levels", "GET", undefined, 403);
  await user.call(`/api/admin/users/${ids.other}/points-adjustments`, "POST", { delta: 5, reason: "Self" }, 403);
  await admin.call(`/api/admin/users/${randomUUID()}/points-adjustments`, "POST", { delta: 5, reason: "Missing" }, 404);
  await admin.call(`/api/admin/users/${ids.other}/points-adjustments`, "POST", { delta: 0, reason: "Zero" }, 422);
  await admin.call("/api/admin/loyalty/levels/PREMIUM", "PUT", { ...premium, level: "STANDARD" }, 422);
  await admin.call("/api/admin/loyalty/levels/STANDARD", "PUT", { ...originalLevels[0], pointsThreshold: 10 }, 422);
  const replayKey = randomUUID();
  const firstAdjust = await admin.call(`/api/admin/users/${ids.other}/points-adjustments`, "POST", { delta: 7, reason: "Goodwill" }, 201, replayKey);
  const replay = await admin.call(`/api/admin/users/${ids.other}/points-adjustments`, "POST", { delta: 7, reason: "Goodwill" }, 201, replayKey);
  assert.equal(replay.id, firstAdjust.id);
  assert.equal((await one("SELECT points_balance,lifetime_points FROM user_profiles WHERE account_id=$1", [ids.other])).points_balance, 7);
  assert.equal((await other.call("/api/me/loyalty")).lifetimePoints, 0);
  console.log("PASS: admin lock blocks automatic changes, assignment history, idempotent adjustments and access denial");

  const negative = await one(
    "SELECT count(*)::int AS n FROM user_profiles p WHERE account_id=ANY($1::uuid[]) AND (points_balance<0 OR points_balance<>(SELECT coalesce(sum(delta),0) FROM points_transactions t WHERE t.user_id=p.account_id))",
    [[ids.member, ids.other]],
  );
  assert.equal(negative.n, 0);
  console.log("PASS: ledger sums equal balances for loyalty fixtures");
} finally {
  if (originalLevels)
    for (const level of originalLevels) await admin.call(`/api/admin/loyalty/levels/${level.level}`, "PUT", level);
  if (originalRules) await admin.call("/api/admin/loyalty/rules", "PUT", originalRules);
  await pool.end();
}
