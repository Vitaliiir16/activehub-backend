import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import sharp from "sharp";
import { createPool } from "../src/infrastructure/database";
import {
  dispatchWelcome,
  MailpitWelcomeMail,
} from "../src/infrastructure/welcome-mail";
import { welcome } from "../src/modules/accounts/service";
import { verifyPassword } from "./lib/password";

const base = process.env.API_BASE_URL ?? "http://127.0.0.1:3000";
const origin = (
  process.env.APP_ORIGINS ??
  process.env.APP_ORIGIN ??
  "http://localhost:8080"
).split(",")[0];
const pool = createPool();
if (process.env.ACTIVEHUB_TEST_WRITES !== "true")
  throw new Error(
    "Account verification writes fixtures; set ACTIVEHUB_TEST_WRITES=true only for an isolated test database",
  );
const run = randomUUID().slice(0, 8),
  password = "ActiveHubTest123",
  newPassword = "UpdatedActiveHub123";
const secrets = [
  password,
  newPassword,
  process.env.INITIAL_ADMIN_PASSWORD ?? "not-configured",
];
class Browser {
  cookies = new Map<string, string>();
  async call(
    path: string,
    method = "GET",
    body?: unknown,
    options: {
      csrf?: boolean;
      origin?: string;
      token?: string;
      status?: number | number[];
    } = {},
  ) {
    const headers: Record<string, string> = {
      Cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "),
      Origin: options.origin ?? origin,
    };
    if (method !== "GET" && options.csrf !== false) {
      const c = await this.call("/api/auth/csrf");
      headers.Cookie = [...this.cookies]
        .map(([k, v]) => `${k}=${v}`)
        .join("; ");
      headers["X-CSRF-Token"] = options.token ?? c.data.token;
    }
    if (body !== undefined && !(body instanceof FormData))
      headers["Content-Type"] = "application/json";
    const response = await fetch(base + path, {
      method,
      headers,
      body:
        body === undefined
          ? undefined
          : body instanceof FormData
            ? body
            : JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    for (const cookie of response.headers.getSetCookie()) {
      const first = cookie.split(";")[0],
        i = first.indexOf("=");
      this.cookies.set(first.slice(0, i), first.slice(i + 1));
    }
    const text = await response.text();
    for (const value of secrets)
      assert.ok(!text.includes(value), "Response must not contain passwords");
    assert.ok(
      !/password_hash|token_hash|csrf_hash|scrypt\$/.test(text),
      "Response leaked a stored secret",
    );
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.ok(response.headers.get("x-request-id"));
    const data =
      text && response.headers.get("content-type")?.includes("json")
        ? JSON.parse(text)
        : text;
    const expected = Array.isArray(options.status)
      ? options.status
      : [options.status ?? 200];
    assert.ok(
      expected.includes(response.status),
      `${method} ${path}: HTTP ${response.status}, ${JSON.stringify(data)}`,
    );
    return { response, data };
  }
}
try {
  const guest = new Browser();
  await guest.call("/api/me", "GET", undefined, { status: 401 });
  await guest.call("/api/notifications", "GET", undefined, { status: 401 });
  const city = (await guest.call("/api/cities?pageSize=100")).data.items[0].id;
  const directions = (await guest.call("/api/directions?pageSize=100")).data
    .items;
  await guest.call("/api/directions?includeSelected=true", "GET", undefined, {
    status: 401,
  });
  await guest.call("/api/cities?ownerId=" + randomUUID(), "GET", undefined, {
    status: 422,
  });
  const userInput = {
    firstName: "Test",
    lastName: "Member",
    email: `user-${run}@example.test`,
    password,
    passwordConfirmation: password,
    phone: "+380501234567",
    cityId: city,
    gender: "UNDISCLOSED",
  };
  const invalidCases = [
    { email: "invalid" },
    { password: "Short1", passwordConfirmation: "Short1" },
    { password: "OnlyLetters", passwordConfirmation: "OnlyLetters" },
    { password: "12345678", passwordConfirmation: "12345678" },
    { firstName: "A" },
    { lastName: "A".repeat(51) },
    { phone: "0501234567" },
    { gender: "OTHER" },
    { cityId: "unknown" },
  ];
  for (const invalid of invalidCases)
    await guest.call(
      "/api/auth/register/user",
      "POST",
      { ...userInput, ...invalid },
      { status: 422 },
    );
  await guest.call("/api/auth/register/user", "POST", userInput, {
    csrf: false,
    status: 403,
  });
  await guest.call("/api/auth/register/user", "POST", userInput, {
    origin: "https://evil.example",
    status: 403,
  });
  await guest.call("/api/auth/register/user", "POST", userInput, {
    token: "0".repeat(64),
    status: 403,
  });
  await guest.call(
    "/api/auth/register/user",
    "POST",
    { ...userInput, role: "ADMIN" },
    { status: 422 },
  );
  await guest.call(
    "/api/auth/register/user",
    "POST",
    { ...userInput, accountId: randomUUID() },
    { status: 422 },
  );
  await guest.call(
    "/api/auth/register/user",
    "POST",
    { ...userInput, passwordConfirmation: "Mismatch123" },
    { status: 422 },
  );
  const session = await guest.call(
    "/api/auth/register/user",
    "POST",
    userInput,
    { status: 201 },
  );
  const userId = session.data.accountId;
  const storedSession = (
    await pool.query(
      "SELECT token_hash FROM account_sessions WHERE account_id=$1",
      [userId],
    )
  ).rows[0];
  assert.notEqual(
    storedSession.token_hash,
    guest.cookies.get("activehub_session"),
  );
  assert.equal(session.data.role, "USER");
  const cookies = session.response.headers.getSetCookie().join(";");
  assert.match(cookies, /HttpOnly/);
  assert.match(cookies, /SameSite=Lax/);
  assert.match(cookies, /Max-Age=604800/);
  assert.ok(Date.parse(session.data.expiresAt) - Date.now() > 6.9 * 86400000);
  const stored = (
    await pool.query("SELECT password_hash FROM accounts WHERE id=$1", [userId])
  ).rows[0];
  assert.ok(await verifyPassword(password, stored.password_hash));
  const user = guest,
    duplicate = new Browser();
  const raceEmail = `race-${run}@example.test`;
  const racers = await Promise.all([
    new Browser().call(
      "/api/auth/register/user",
      "POST",
      { ...userInput, email: raceEmail },
      { status: [201, 409] },
    ),
    new Browser().call(
      "/api/auth/register/organizer",
      "POST",
      {
        email: raceEmail.toUpperCase(),
        password,
        passwordConfirmation: password,
        name: "Race Club",
        type: "CLUB",
        directionIds: [directions[0].id],
        cityId: city,
        phone: "+380501234567",
      },
      { status: [201, 409] },
    ),
  ]);
  assert.deepEqual(
    racers.map((result) => result.response.status).sort(),
    [201, 409],
  );
  await duplicate.call(
    "/api/auth/register/organizer",
    "POST",
    {
      email: userInput.email.toUpperCase(),
      password,
      passwordConfirmation: password,
      name: "Test Club",
      type: "CLUB",
      directionIds: [directions[0].id],
      cityId: city,
      phone: "+380501234567",
    },
    { status: 409 },
  );
  const wrong1 = await duplicate.call(
    "/api/auth/login",
    "POST",
    { email: userInput.email, password: "WrongPassword123" },
    { status: 401 },
  );
  const wrong2 = await duplicate.call(
    "/api/auth/login",
    "POST",
    { email: `unknown-${run}@example.test`, password: "WrongPassword123" },
    { status: 401 },
  );
  assert.equal(wrong1.data.error.message, wrong2.data.error.message);
  const profile = (await user.call("/api/me")).data;
  assert.equal(profile.id, userId);
  assert.equal(profile.firstName, "Test");
  await user.call("/api/me", "PATCH", { role: "ADMIN" }, { status: 422 });
  await user.call(
    "/api/me",
    "PATCH",
    { accountId: randomUUID(), firstName: "Changed" },
    { status: 422 },
  );
  await user.call(
    "/api/me",
    "PATCH",
    { name: "Not a user field" },
    { status: 422 },
  );
  await user.call("/api/me", "PATCH", {
    firstName: "Updated",
    preferredDirectionIds: [directions[0].id],
  });
  await user.call("/api/me/notification-settings", "PATCH", {
    remindersEmail: false,
    promotionsEmail: false,
    loyaltyEmail: true,
    messagesEmail: true,
  });
  assert.equal(
    (await user.call("/api/me/notification-settings")).data.loyaltyEmail,
    true,
  );
  await user.call(
    "/api/me/notification-settings",
    "PATCH",
    { bookingsEmail: false },
    { status: 422 },
  );
  const imageBytes = await sharp({
    create: { width: 16, height: 16, channels: 3, background: "green" },
  })
    .png()
    .toBuffer();
  const imageForm = new FormData();
  imageForm.set(
    "file",
    new Blob([new Uint8Array(imageBytes)], { type: "image/png" }),
    "avatar.png",
  );
  const photo = (await user.call("/api/me/photo", "POST", imageForm)).data;
  assert.equal(
    (await user.call(photo.url)).response.headers.get("content-type"),
    "image/webp",
  );
  const badImage = new FormData();
  badImage.set(
    "file",
    new Blob(["not an image"], { type: "image/png" }),
    "fake.png",
  );
  await user.call("/api/me/photo", "POST", badImage, { status: 422 });
  const large = new FormData();
  large.set(
    "file",
    new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: "image/png" }),
    "large.png",
  );
  await user.call("/api/me/photo", "POST", large, { status: 422 });
  const other = new Browser();
  const orgInput = {
    email: `organizer-${run}@example.test`,
    password,
    passwordConfirmation: password,
    name: "Test Club",
    type: "CLUB",
    directionIds: [directions[0].id],
    cityId: city,
    phone: "+380501234567",
    description: "A test club",
  };
  const organizer = (
    await other.call("/api/auth/register/organizer", "POST", orgInput, {
      status: 201,
    })
  ).data;
  assert.equal(organizer.role, "ORGANIZER");
  const foreignCsrf = (await other.call("/api/auth/csrf")).data.token;
  await user.call(
    "/api/me",
    "PATCH",
    { firstName: "Invalid token" },
    { token: foreignCsrf, status: 403 },
  );
  await other.call(photo.url, "GET", undefined, { status: 404 });
  await other.call("/api/me", "PATCH", { logoId: photo.id }, { status: 404 });
  await other.call(
    "/api/me",
    "PATCH",
    { email: userInput.email },
    { status: 409 },
  );
  await other.call("/api/me", "PATCH", {
    name: "Updated Club",
    directionIds: [directions[1].id],
  });
  await pool.query("UPDATE cities SET is_active=false WHERE id=$1", [city]);
  await pool.query("UPDATE directions SET is_active=false WHERE id=$1", [
    directions[0].id,
  ]);
  try {
    assert.equal((await user.call("/api/me")).data.city.isActive, false);
    const selected = (
      await user.call("/api/directions?includeSelected=true&pageSize=100")
    ).data.items;
    assert.ok(
      selected.some(
        (direction: { id: string; isActive: boolean }) =>
          direction.id === directions[0].id && !direction.isActive,
      ),
    );
    assert.ok(
      !(await user.call("/api/directions?pageSize=100")).data.items.some(
        (direction: { id: string }) => direction.id === directions[0].id,
      ),
    );
    await user.call("/api/me", "PATCH", {
      cityId: city,
      preferredDirectionIds: [directions[0].id],
      lastName: "Retained",
    });
    const inactive = new Browser();
    await inactive.call(
      "/api/auth/register/user",
      "POST",
      { ...userInput, email: `inactive-${run}@example.test` },
      { status: 422 },
    );
    await other.call(
      "/api/me",
      "PATCH",
      { directionIds: [directions[0].id] },
      { status: 422 },
    );
  } finally {
    await pool.query("UPDATE cities SET is_active=true WHERE id=$1", [city]);
    await pool.query("UPDATE directions SET is_active=true WHERE id=$1", [
      directions[0].id,
    ]);
  }
  const secondSession = new Browser();
  await secondSession.call("/api/auth/login", "POST", {
    email: userInput.email,
    password,
  });
  await user.call(
    "/api/me/password",
    "POST",
    { currentPassword: "Wrong123", newPassword },
    { status: 422 },
  );
  await user.call(
    "/api/me/password",
    "POST",
    { currentPassword: password, newPassword },
    { status: 204 },
  );
  await secondSession.call("/api/auth/session", "GET", undefined, {
    status: 401,
  });
  await user.call("/api/auth/session");
  await user.call("/api/auth/logout", "POST", undefined, { status: 204 });
  await user.call("/api/auth/session", "GET", undefined, { status: 401 });
  await user.call(
    "/api/auth/login",
    "POST",
    { email: userInput.email, password },
    { status: 401 },
  );
  await user.call("/api/auth/login", "POST", {
    email: userInput.email,
    password: newPassword,
  });
  await pool.query(
    "UPDATE account_sessions SET expires_at=now()-interval '1 second' WHERE account_id=$1",
    [userId],
  );
  await user.call("/api/me", "GET", undefined, { status: 401 });
  await user.call("/api/auth/login", "POST", {
    email: userInput.email,
    password: newPassword,
  });
  await pool.query("UPDATE accounts SET status='BLOCKED' WHERE id=$1", [
    userId,
  ]);
  await user.call("/api/me", "GET", undefined, { status: 401 });
  await user.call(
    "/api/auth/login",
    "POST",
    { email: userInput.email, password: newPassword },
    { status: 403 },
  );
  await pool.query("UPDATE accounts SET status='ACTIVE' WHERE id=$1", [userId]);
  await user.call("/api/auth/login", "POST", {
    email: userInput.email,
    password: newPassword,
  });
  await user.call(
    "/api/admin/administrators",
    "POST",
    {
      email: `forbidden-${run}@example.test`,
      password,
      displayName: "Forbidden Admin",
    },
    { status: 403 },
  );
  const admin = new Browser();
  assert.ok(
    process.env.INITIAL_ADMIN_EMAIL && process.env.INITIAL_ADMIN_PASSWORD,
    "Configure seeded admin credentials for this verification",
  );
  const adminSession = (
    await admin.call("/api/auth/login", "POST", {
      email: process.env.INITIAL_ADMIN_EMAIL,
      password: process.env.INITIAL_ADMIN_PASSWORD,
    })
  ).data;
  const created = (
    await admin.call(
      "/api/admin/administrators",
      "POST",
      {
        email: `admin-${run}@example.test`,
        password,
        displayName: "New Administrator",
      },
      { status: 201 },
    )
  ).data;
  await admin.call(
    `/api/admin/administrators/${adminSession.accountId}/status`,
    "PATCH",
    { status: "BLOCKED", reason: "Self block test" },
    { status: 409 },
  );
  const newAdmin = new Browser();
  await newAdmin.call("/api/auth/login", "POST", {
    email: created.email,
    password,
  });
  await admin.call(`/api/admin/administrators/${created.id}/status`, "PATCH", {
    status: "BLOCKED",
    reason: "Access test",
  });
  await newAdmin.call("/api/me", "GET", undefined, { status: 401 });
  await admin.call(`/api/admin/administrators/${created.id}/status`, "PATCH", {
    status: "ACTIVE",
    reason: "Restore access",
  });
  await pool.query("UPDATE accounts SET status='DELETED' WHERE id=$1", [
    organizer.accountId,
  ]);
  await other.call("/api/me", "GET", undefined, { status: 401 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await welcome(client, userId, userInput.email);
    await welcome(client, userId, userInput.email);
    await client.query("COMMIT");
  } finally {
    client.release();
  }
  assert.equal(
    Number(
      (
        await pool.query(
          "SELECT count(*) FROM notifications WHERE account_id=$1 AND type='WELCOME'",
          [userId],
        )
      ).rows[0].count,
    ),
    1,
  );
  const mail = new MailpitWelcomeMail();
  for (let i = 0; i < 30; i++) {
    const processed = await Promise.all([
      dispatchWelcome(pool, mail),
      dispatchWelcome(pool, mail),
    ]);
    if (processed.every((value) => !value)) break;
  }
  for (let i = 0; i < 10; i++) {
    await dispatchWelcome(pool, mail);
    const state = (
      await pool.query(
        "SELECT e.state FROM email_outbox e JOIN notifications n ON n.id=e.notification_id WHERE n.account_id=$1",
        [userId],
      )
    ).rows[0]?.state;
    if (state === "SENT") break;
    await delay(1000);
  }
  const outbox = (
    await pool.query(
      "SELECT e.id,e.state,e.attempts FROM email_outbox e JOIN notifications n ON n.id=e.notification_id WHERE n.account_id=$1",
      [userId],
    )
  ).rows[0];
  assert.equal(outbox.state, "SENT");
  const mailpit = process.env.MAILPIT_BASE_URL ?? "http://mailpit:8025";
  const messages = await (
    await fetch(
      `${mailpit}/api/v1/search?query=${encodeURIComponent("to:" + userInput.email)}`,
    )
  ).json();
  assert.equal(
    messages.messages.filter(
      (message: { Subject: string }) =>
        message.Subject === "Welcome to ActiveHub",
    ).length,
    1,
  );
  await dispatchWelcome(pool, mail);
  assert.equal(
    (
      await pool.query("SELECT attempts FROM email_outbox WHERE id=$1", [
        outbox.id,
      ])
    ).rows[0].attempts,
    outbox.attempts,
  );
  const notices = (await user.call("/api/notifications")).data.items;
  assert.equal(
    notices.filter((n: { type: string }) => n.type === "WELCOME").length,
    1,
  );
  await admin.call(
    `/api/notifications/${notices[0].id}/read`,
    "POST",
    undefined,
    { status: 404 },
  );
  await user.call(`/api/notifications/${notices[0].id}/read`, "POST");
  await newAdmin.call("/api/auth/login", "POST", {
    email: created.email,
    password,
  });
  const activeBefore = Number(
    (
      await pool.query(
        "SELECT count(*) FROM accounts WHERE role='ADMIN' AND status='ACTIVE'",
      )
    ).rows[0].count,
  );
  try {
    const race = await Promise.all([
      admin.call(
        `/api/admin/administrators/${created.id}/status`,
        "PATCH",
        { status: "BLOCKED", reason: "Concurrent access check" },
        { status: [200, 401] },
      ),
      newAdmin.call(
        `/api/admin/administrators/${adminSession.accountId}/status`,
        "PATCH",
        { status: "BLOCKED", reason: "Concurrent access check" },
        { status: [200, 401] },
      ),
    ]);
    assert.deepEqual(
      race.map((value) => value.response.status).sort(),
      [200, 401],
    );
    assert.equal(
      Number(
        (
          await pool.query(
            "SELECT count(*) FROM accounts WHERE role='ADMIN' AND status='ACTIVE'",
          )
        ).rows[0].count,
      ),
      activeBefore - 1,
    );
  } finally {
    await pool.query(
      "UPDATE accounts SET status='ACTIVE' WHERE id=ANY($1::uuid[])",
      [[created.id, adminSession.accountId]],
    );
  }
  console.log(
    "PASS: real PostgreSQL/API registration, unique emails, strict roles/ownership, CSRF/origin, sessions, passwords, profiles/images/settings, administrator access and welcome deduplication",
  );
} finally {
  await pool.end();
}
