import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import type { PoolClient } from "pg";
import { hashPassword } from "./password";
import { notify } from "../../src/modules/marketplace/core";
import {
  transition,
  type BookingRow,
} from "../../src/modules/marketplace/bookings";
import {
  accruePoints,
  quoteBooking,
  reserveFreeVisits,
  syncCard,
} from "../../src/modules/loyalty/ledger";
import { reserveVisits } from "../../src/modules/marketplace/subscriptions";
import type { EventRow, SessionRow } from "../../src/modules/marketplace/types";

export function demoConfiguration(
  env: Record<string, string | undefined> = process.env,
) {
  if (env.SEED_DEMO !== undefined && !["true", "false"].includes(env.SEED_DEMO))
    throw Error("SEED_DEMO must be true or false");
  if (env.SEED_DEMO !== "true") return null;
  const password = env.DEMO_PASSWORD,
    namespace = env.DEMO_NAMESPACE ?? "demo";
  if (
    !password ||
    password.length < 8 ||
    password.length > 256 ||
    !/[A-Za-z]/.test(password) ||
    !/[0-9]/.test(password)
  )
    throw Error(
      "DEMO_PASSWORD must contain 8-256 characters, a letter and a digit",
    );
  if (!/^[a-z0-9-]{1,30}$/.test(namespace))
    throw Error(
      "DEMO_NAMESPACE must contain 1-30 lowercase letters, digits or hyphens",
    );
  return { password, namespace };
}
export async function seedDemo(
  c: PoolClient,
  config: NonNullable<ReturnType<typeof demoConfiguration>>,
) {
  if (
    (
      await c.query("SELECT namespace FROM demo_seed_runs WHERE namespace=$1", [
        config.namespace,
      ])
    ).rowCount
  )
    return;
  const hash = await hashPassword(config.password),
    ids: string[] = [],
    domain = `${config.namespace}.activehub.example.test`;
  const city = (
    await c.query(
      "SELECT id FROM cities WHERE is_active ORDER BY (code='kyiv') DESC,id LIMIT 1",
    )
  ).rows[0]?.id;
  const directions = (
    await c.query(
      "SELECT id,name FROM directions WHERE is_active ORDER BY (code='swimming') DESC,id LIMIT 3",
    )
  ).rows;
  if (!city || directions.length < 3)
    throw Error("Demo seeding needs an active city and three directions");
  const admin = (
    await c.query(
      "SELECT id FROM accounts WHERE role='ADMIN' AND status='ACTIVE' ORDER BY created_at LIMIT 1",
    )
  ).rows[0]?.id;
  if (!admin) throw Error("Demo seeding needs an active administrator");
  async function account(alias: string, role: string) {
    const email = `${alias}@${domain}`;
    if (
      (await c.query("SELECT id FROM accounts WHERE email=$1", [email]))
        .rowCount
    )
      throw Error(
        "A demo email already exists; choose a different DEMO_NAMESPACE. No account was changed.",
      );
    const id = (
      await c.query(
        "INSERT INTO accounts(email,password_hash,role) VALUES($1,$2,$3) RETURNING id",
        [email, hash, role],
      )
    ).rows[0].id as string;
    ids.push(id);
    await c.query("INSERT INTO notification_settings(account_id) VALUES($1)", [
      id,
    ]);
    return id;
  }
  const users: string[] = [];
  for (let i = 0; i < 4; i++) {
    const id = await account(`member${i + 1}`, "USER");
    await c.query(
      "INSERT INTO user_profiles(account_id,first_name,last_name,phone,city_id,gender) VALUES($1,$2,'Demo','+380501234567',$3,'UNDISCLOSED')",
      [id, ["Taylor", "Jordan", "Morgan", "Alex"][i], city],
    );
    await c.query(
      "INSERT INTO profile_directions(account_id,direction_id) VALUES($1,$2)",
      [id, directions[i % 3].id],
    );
    users.push(id);
  }
  const organizers = [];
  for (const [i, type] of ["TRAINER", "CLUB", "VENUE", "ORGANIZER"].entries()) {
    const id = await account(type.toLowerCase(), "ORGANIZER");
    await c.query(
      "INSERT INTO organizer_profiles(account_id,name,type,phone,city_id,description) VALUES($1,$2,$3,'+380501234567',$4,'Demonstration organizer for local project review')",
      [id, `ActiveHub Demo ${type.toLowerCase()}`, type, city],
    );
    for (const d of directions)
      await c.query(
        "INSERT INTO profile_directions(account_id,direction_id) VALUES($1,$2)",
        [id, d.id],
      );
    organizers.push(id);
    if (i === 0)
      await notify(c, {
        accountId: id,
        key: `demo:${config.namespace}:welcome`,
        type: "WELCOME",
        title: "Welcome to ActiveHub",
        body: "Your demonstration activities are ready.",
        link: "/organizer",
      });
  }
  await c.query(
    "UPDATE user_profiles SET loyalty_level='PREMIUM',base_level='PREMIUM',card_locked_by_admin=true WHERE account_id=$1",
    [users[1]],
  );
  await c.query(
    "INSERT INTO card_assignments(user_id,admin_id,level,locked,reason) VALUES($1,$2,'PREMIUM',true,'Demonstration card assigned by the initial administrator')",
    [users[1], admin],
  );
  const events: EventRow[] = [],
    sessions: SessionRow[] = [],
    kinds = ["TRAINING", "SECTION", "HALL_RENTAL", "TEAM_SEARCH", "EVENT"];
  const upload = process.env.UPLOAD_DIR ?? "/app/uploads";
  await mkdir(upload, { recursive: true });
  const now = Date.now();
  for (let i = 0; i < 12; i++) {
    const kind = kinds[i % 5],
      manual = ["HALL_RENTAL", "TEAM_SEARCH"].includes(kind),
      price = i === 10 ? 0 : 10000 + i * 1000;
    const event = (
      await c.query<EventRow>(
        "INSERT INTO events(organizer_id,title,description,kind,direction_id,city_id,address,skill,age,price_minor,promo_price_minor,promo_until,seats_per_session,confirmation_mode) VALUES($1,$2,$3,$4,$5,$6,$7,'ANY','ANY',$8,$9,$10,12,$11) RETURNING *",
        [
          organizers[i % 4],
          `${directions[i % 3].name} ${["practice", "club", "studio", "team", "meetup"][i % 5]} ${i + 1}`,
          "A seeded activity for demonstrating discovery, booking and organizer management.",
          kind,
          directions[i % 3].id,
          city,
          `${10 + i} Demo Sports Street`,
          price,
          i === 1 ? Math.floor(price * 0.8) : null,
          i === 1 ? new Date(now + 7 * 86400000) : null,
          manual ? "MANUAL" : "AUTO",
        ],
      )
    ).rows[0];
    events.push(event);
    const session = (
      await c.query<SessionRow>(
        "INSERT INTO event_sessions(event_id,starts_at,ends_at,seats_total) VALUES($1,$2,$3,12) RETURNING *",
        [
          event.id,
          new Date(now + (i + 2) * 86400000),
          new Date(now + (i + 2) * 86400000 + 3600000),
        ],
      )
    ).rows[0];
    sessions.push(session);
    const photo = randomUUID(),
      filename = `${photo}.webp`,
      hue = (i * 31) % 360;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540"><rect width="960" height="540" fill="hsl(${hue},35%,30%)"/><circle cx="740" cy="130" r="210" fill="hsl(${hue},40%,43%)"/><path d="M0 450L400 150L760 540H0" fill="hsl(${hue},30%,55%)"/><text x="50" y="450" font-family="sans-serif" font-size="42" fill="white">ActiveHub demo ${i + 1}</text></svg>`;
    await writeFile(
      join(upload, filename),
      await sharp(Buffer.from(svg)).webp().toBuffer(),
      { flag: "wx", mode: 0o600 },
    );
    await c.query(
      "INSERT INTO event_photos(id,event_id,filename,position) VALUES($1,$2,$3,0)",
      [photo, event.id, filename],
    );
  }
  const purchased: string[] = [];
  for (const [i, type] of ["ONE_TIME", "MONTHLY", "CORPORATE"].entries()) {
    const owner = organizers[i],
      visits = i === 0 ? 1 : i === 1 ? null : 10;
    const p = (
      await c.query(
        "INSERT INTO subscription_plans(organizer_id,name,type,description,price_minor,validity_days,visits_limit,scope,direction_ids) VALUES($1,$2,$3,'Demonstration subscription',30000,30,$4,'ALL_EVENTS','{}') RETURNING *",
        [owner, `Demo ${type.toLowerCase()} plan`, type, visits],
      )
    ).rows[0];
    const snapshot = {
      id: p.id,
      organizerId: owner,
      name: p.name,
      type,
      description: p.description,
      priceMinor: p.price_minor,
      validityDays: 30,
      visitsLimit: visits,
      scope: "ALL_EVENTS",
      directionIds: [],
      directionNames: [],
      status: "ACTIVE",
      createdAt: p.created_at,
      updatedAt: p.updated_at,
    };
    const sub = (
      await c.query(
        "INSERT INTO user_subscriptions(user_id,plan_id,plan_snapshot,starts_at,expires_at,visits_left,company_name) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id",
        [
          users[i],
          p.id,
          JSON.stringify(snapshot),
          new Date(now),
          new Date(now + 30 * 86400000),
          visits,
          i === 2 ? "ActiveHub Demo Company" : null,
        ],
      )
    ).rows[0].id;
    purchased.push(sub);
    await c.query(
      "INSERT INTO payments(plan_id,subscription_id,amount_minor,status,card_last4) VALUES($1,$2,30000,'SUCCEEDED','4242')",
      [p.id, sub],
    );
    await notify(c, {
      accountId: users[i],
      key: `demo:subscription:${sub}`,
      type: "SUBSCRIPTION_PURCHASED",
      title: "Demo subscription activated",
      body: "Purchased terms and visit accounting are available on My subscriptions.",
      link: "/subscriptions",
    });
  }
  await syncCard(c, users[2], `demo:${config.namespace}:corporate`);
  async function booking(
    user: number,
    eventIndex: number,
    state: string,
    subscription?: string,
  ) {
    const e = events[eventIndex],
      s = sessions[eventIndex],
      quote = await quoteBooking(
        c,
        users[user],
        e,
        s,
        1,
        !!subscription,
        new Date(now),
      );
    if (subscription)
      await reserveVisits(c, subscription, users[user], e, s, 1);
    const initial =
      state === "PENDING" || e.confirmation_mode === "MANUAL"
        ? "PENDING"
        : quote.amountDueMinor > 0
          ? "AWAITING_PAYMENT"
          : "CONFIRMED";
    let b = (
      await c.query<BookingRow>(
        "INSERT INTO bookings(user_id,session_id,exclusive,seats,comment,status,base_price_minor,amount_due_minor,discounts,payment_method,deadline_at,address_version,time_version,subscription_id,loyalty_level) VALUES($1,$2,$3,1,'Seeded demonstration booking',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *",
        [
          users[user],
          s.id,
          e.kind === "HALL_RENTAL",
          initial,
          quote.basePriceMinor,
          quote.amountDueMinor,
          JSON.stringify(quote.discounts),
          subscription
            ? "SUBSCRIPTION"
            : quote.amountDueMinor === 0
              ? "FREE"
              : "CARD",
          initial === "CONFIRMED" ? null : new Date(now + 3600000),
          e.address_version,
          s.time_version,
          subscription ?? null,
          quote.level,
        ],
      )
    ).rows[0];
    await reserveFreeVisits(c, b.id, b.user_id, quote.month, quote.freePlaces);
    if (subscription)
      await c.query(
        "INSERT INTO subscription_visit_ledger(booking_id,subscription_id,visits) VALUES($1,$2,1)",
        [b.id, subscription],
      );
    await c.query(
      "INSERT INTO booking_history(booking_id,to_status,actor_role) VALUES($1,$2,'SYSTEM')",
      [b.id, initial],
    );
    if (initial === "CONFIRMED") await accruePoints(c, b, e.title);
    if (
      ["CONFIRMED", "CANCELLED", "COMPLETED"].includes(state) &&
      b.status === "PENDING"
    )
      b = await transition(
        c,
        b,
        e,
        s,
        b.amount_due_minor > 0 ? "AWAITING_PAYMENT" : "CONFIRMED",
        { role: "SYSTEM" },
      );
    if (
      ["CONFIRMED", "CANCELLED", "COMPLETED"].includes(state) &&
      b.status === "AWAITING_PAYMENT"
    ) {
      await c.query(
        "INSERT INTO payments(booking_id,amount_minor,status,card_last4) VALUES($1,$2,'SUCCEEDED','4242')",
        [b.id, b.amount_due_minor],
      );
      b = await transition(c, b, e, s, "CONFIRMED", { role: "SYSTEM" });
    }
    if (state === "CANCELLED" || state === "COMPLETED" || state === "REJECTED")
      await transition(
        c,
        b,
        e,
        s,
        state,
        { role: "SYSTEM" },
        "Demonstration history",
      );
  }
  await booking(0, 0, "CONFIRMED");
  await booking(0, 4, "CANCELLED");
  await booking(1, 3, "PENDING");
  await booking(3, 5, "AWAITING_PAYMENT");
  await booking(3, 7, "REJECTED");
  await booking(2, 2, "CONFIRMED", purchased[2]);
  const past = (
    await c.query<SessionRow>(
      "INSERT INTO event_sessions(event_id,starts_at,ends_at,seats_total) VALUES($1,$2,$3,12) RETURNING *",
      [
        events[8].id,
        new Date(now - 2 * 86400000),
        new Date(now - 2 * 86400000 + 3600000),
      ],
    )
  ).rows[0];
  const future = sessions[8];
  sessions[8] = past;
  await booking(0, 8, "COMPLETED");
  sessions[8] = future;
  await c.query("UPDATE event_sessions SET status='COMPLETED' WHERE id=$1", [
    past.id,
  ]);
  const conversation = (
    await c.query(
      "INSERT INTO conversations(user_id,organizer_id,last_seq,last_message_at) VALUES($1,$2,2,clock_timestamp()) RETURNING id",
      [users[0], organizers[0]],
    )
  ).rows[0].id;
  await c.query(
    "INSERT INTO messages(conversation_id,seq,sender_id,body,event_id,read_at) VALUES($1,1,$2,'Hello! Is equipment included?',$3,clock_timestamp()),($1,2,$4,'Yes, equipment is included. See you at the session.',$3,NULL)",
    [conversation, users[0], events[0].id, organizers[0]],
  );
  await notify(c, {
    accountId: users[0],
    key: `demo:chat:${conversation}`,
    type: "MESSAGE_RECEIVED",
    category: "MESSAGES",
    title: "A reply from your organizer",
    body: "Open Messages to see the demonstration conversation.",
    link: `/chat/${conversation}`,
  });
  await c.query(
    "INSERT INTO demo_seed_runs(namespace,account_ids) VALUES($1,$2)",
    [config.namespace, ids],
  );
}
