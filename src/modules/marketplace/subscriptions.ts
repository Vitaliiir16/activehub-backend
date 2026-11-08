import { z } from "zod";
import type { PoolClient, Pool } from "pg";
import { jsonBody, invalid } from "../accounts/http";
import { access, conflict, idempotent, missing, notify, page } from "./core";
import { pagination } from "./validation";
import { cardInput, SimulatedCardGateway } from "./payment-gateway";
import type { EventRow, SessionRow } from "./types";
import { revertExpiredCorporateCards, syncCard } from "../loyalty/ledger";
import { audit } from "../administration/audit";

const fields = {
  name: z.string().trim().min(2).max(100),
  type: z.enum(["ONE_TIME", "MONTHLY", "CORPORATE"]),
  description: z.string().trim().max(5000),
  priceMinor: z.number().int().min(0).max(10000000),
  validityDays: z.number().int().min(1).max(36500),
  visitsLimit: z.number().int().min(1).max(2147483647).nullable(),
  scope: z.enum(["ALL_EVENTS", "DIRECTIONS"]),
  directionIds: z
    .array(z.uuid())
    .max(100)
    .refine((a) => new Set(a).size === a.length),
};
const write = z.strictObject(fields),
  patch = write.partial().refine((v) => Object.keys(v).length > 0);
type Plan = {
  id: string;
  organizerId: string;
  name: string;
  type: "ONE_TIME" | "MONTHLY" | "CORPORATE";
  description: string;
  priceMinor: number;
  validityDays: number;
  visitsLimit: number | null;
  scope: "ALL_EVENTS" | "DIRECTIONS";
  directionIds: string[];
  directionNames?: string[];
  status: string;
  createdAt: Date | string;
  updatedAt: Date | string;
};
export type PlanRow = {
  id: string;
  organizer_id: string;
  name: string;
  type: Plan["type"];
  description: string;
  price_minor: number;
  validity_days: number;
  visits_limit: number | null;
  scope: Plan["scope"];
  direction_ids: string[];
  direction_names?: string[];
  status: string;
  created_at: Date;
  updated_at: Date;
};
export type SubRow = {
  id: string;
  user_id: string;
  plan_id: string;
  plan_snapshot: Plan;
  status: string;
  starts_at: Date;
  expires_at: Date;
  visits_left: number | null;
  company_name: string | null;
  created_at: Date;
  updated_at: Date;
};
export const planDto = (p: PlanRow): Plan => ({
  id: p.id,
  organizerId: p.organizer_id,
  name: p.name,
  type: p.type,
  description: p.description,
  priceMinor: p.price_minor,
  validityDays: p.validity_days,
  visitsLimit: p.visits_limit,
  scope: p.scope,
  directionIds: p.direction_ids,
  directionNames:p.direction_names??[],
  status: p.status,
  createdAt: p.created_at,
  updatedAt: p.updated_at,
});
export const subscriptionDto = (s: SubRow) => ({
  id: s.id,
  userId: s.user_id,
  plan: s.plan_snapshot,
  status: s.expires_at <= new Date() ? "EXPIRED" : s.status,
  startsAt: s.starts_at,
  expiresAt: s.expires_at,
  visitsLeft: s.visits_left,
  companyName: s.company_name,
  createdAt: s.created_at,
  updatedAt: s.updated_at,
});
async function planRow(c: PoolClient, id: string, lock = false) {
  z.uuid().parse(id);
  const p = (
    await c.query<PlanRow>(
      `SELECT p.*,ARRAY(SELECT name FROM directions WHERE id=ANY(p.direction_ids) ORDER BY name) AS direction_names FROM subscription_plans p WHERE p.id=$1 ${lock ? "FOR UPDATE" : ""}`,
      [id],
    )
  ).rows[0];
  if (!p) missing("Plan not found");
  return p;
}
async function validate(c: PoolClient, p: Plan, old?: Plan) {
  if (p.type === "ONE_TIME" && p.visitsLimit !== 1)
    invalid("visitsLimit", "One-time plans have exactly one visit");
  if (p.type === "CORPORATE" && (p.visitsLimit === null || p.visitsLimit < 2))
    invalid("visitsLimit", "Corporate plans require at least two visits");
  if (
    (p.scope === "ALL_EVENTS" && p.directionIds.length) ||
    (p.scope === "DIRECTIONS" && !p.directionIds.length)
  )
    invalid(
      "directionIds",
      "Select directions only for direction-scoped plans",
    );
  for (const id of p.directionIds) {
    if (
      !(
        await c.query(
          "SELECT id FROM directions WHERE id=$1 AND (is_active OR $2)",
          [id, old?.directionIds.includes(id) ?? false],
        )
      ).rowCount
    )
      invalid("directionIds", "Choose active directions");
  }
}
const query = z.strictObject({
  ...pagination,
  sort: z.enum(["newest", "oldest"]).default("newest"),
});
export function listPlans(request: Request, organizerId?: string) {
  const q = query.parse(Object.fromEntries(new URL(request.url).searchParams));
  if (organizerId) z.uuid().parse(organizerId);
  return access(
    request,
    async (c, a) => {
      const owner = organizerId ?? a.id;
      const filter = organizerId
        ? "AND p.status='ACTIVE' AND a.status='ACTIVE'"
        : "";
      const from = `FROM subscription_plans p JOIN accounts a ON a.id=p.organizer_id WHERE p.organizer_id=$1 ${filter}`;
      const total = Number(
        (await c.query(`SELECT count(*) ${from}`, [owner])).rows[0].count,
      );
      const rows = (
        await c.query<PlanRow>(
          `SELECT p.*,ARRAY(SELECT name FROM directions WHERE id=ANY(p.direction_ids) ORDER BY name) AS direction_names ${from} ORDER BY p.created_at ${q.sort === "newest" ? "DESC" : "ASC"},p.id LIMIT $2 OFFSET $3`,
          [owner, q.pageSize, (q.page - 1) * q.pageSize],
        )
      ).rows;
      return Response.json(page(rows.map(planDto), total, q.page, q.pageSize));
    },
    organizerId ? undefined : ["ORGANIZER"],
  );
}
export function getPlan(request: Request, id: string) {
  return access(request, async (c, a) => {
    const p = await planRow(c, id);
    if (
      a.role !== "ADMIN" &&
      p.organizer_id !== a.id &&
      (p.status !== "ACTIVE" ||
        !(
          await c.query(
            "SELECT id FROM accounts WHERE id=$1 AND status='ACTIVE'",
            [p.organizer_id],
          )
        ).rowCount)
    )
      missing("Plan unavailable");
    return Response.json(planDto(p));
  });
}
export async function savePlan(request: Request, id?: string) {
  const input = (id ? patch : write).parse(await jsonBody(request));
  return access(
    request,
    async (c, a) => {
      const save = async () => {
        const old = id ? planDto(await planRow(c, id, true)) : undefined;
        if (old && old.organizerId !== a.id) missing("Plan not found");
        if (old?.status === "ARCHIVED")
          conflict("Archived plans cannot be edited");
        const merged = { ...old, ...input } as Plan;
        await validate(c, merged, old);
        const values = [
          a.id,
          merged.name,
          merged.type,
          merged.description,
          merged.priceMinor,
          merged.validityDays,
          merged.visitsLimit,
          merged.scope,
          merged.directionIds,
        ];
        const row = id
          ? (
              await c.query<PlanRow>(
                "UPDATE subscription_plans SET name=$2,type=$3,description=$4,price_minor=$5,validity_days=$6,visits_limit=$7,scope=$8,direction_ids=$9,updated_at=clock_timestamp() WHERE id=$10 AND organizer_id=$1 RETURNING *",
                [...values, id],
              )
            ).rows[0]
          : (
              await c.query<PlanRow>(
                "INSERT INTO subscription_plans(organizer_id,name,type,description,price_minor,validity_days,visits_limit,scope,direction_ids) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *",
                values,
              )
            ).rows[0];
        return { status: id ? 200 : 201, body: planDto(await planRow(c,row.id)) };
      };
      return id
        ? Response.json((await save()).body)
        : idempotent(c, a, request, "createPlan", input, save);
    },
    ["ORGANIZER"],
    true,
  );
}
export function archivePlan(request: Request, id: string, admin = false) {
  return access(
    request,
    async (c, a) =>
      idempotent(c, a, request, `archivePlan:${id}`, {}, async () => {
        const p = await planRow(c, id, true);
        if (!admin && p.organizer_id !== a.id) missing("Plan not found");
        if (admin) await audit(c, a.id, "PLAN_ARCHIVE", "PLAN", p.id, null);
        const row = (
          await c.query<PlanRow>(
            "UPDATE subscription_plans SET status='ARCHIVED',updated_at=clock_timestamp() WHERE id=$1 RETURNING *",
            [id],
          )
        ).rows[0];
        return { status: 200, body: planDto(row) };
      }),
    [admin ? "ADMIN" : "ORGANIZER"],
    true,
  );
}
export async function purchaseSubscription(request: Request) {
  const input = z
    .strictObject({
      planId: z.uuid(),
      companyName: z.string().trim().min(2).max(100).optional(),
      card: cardInput,
    })
    .parse(await jsonBody(request));
  return access(
    request,
    async (c, a) =>
      idempotent(c, a, request, "purchaseSubscription", input, async () => {
        const p = await planRow(c, input.planId, true);
        if (
          p.status !== "ACTIVE" ||
          !(
            await c.query(
              "SELECT id FROM accounts WHERE id=$1 AND status='ACTIVE'",
              [p.organizer_id],
            )
          ).rowCount
        )
          conflict("This plan is unavailable");
        if (p.type === "CORPORATE" && !input.companyName)
          invalid("companyName", "Company name is required");
        if (p.type !== "CORPORATE" && input.companyName)
          invalid(
            "companyName",
            "Company name applies only to corporate plans",
          );
        const result = await new SimulatedCardGateway().charge(input.card);
        let subscription = null;
        if (result.status === "SUCCEEDED") {
          const now = new Date();
          const row = (
            await c.query<SubRow>(
              "INSERT INTO user_subscriptions(user_id,plan_id,plan_snapshot,starts_at,expires_at,visits_left,company_name) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
              [
                a.id,
                p.id,
                JSON.stringify(planDto(p)),
                now,
                new Date(now.getTime() + p.validity_days * 86400000),
                p.visits_limit,
                input.companyName ?? null,
              ],
            )
          ).rows[0];
          subscription = subscriptionDto(row);
          await notify(c, {
            accountId: a.id,
            key: `subscription:${row.id}:purchased`,
            type: "SUBSCRIPTION_PURCHASED",
            title: "Subscription activated",
            body: `${p.name}. Subscription purchases are non-refundable.`,
            link: "/subscriptions",
          });
          if (p.type === "CORPORATE")
            await syncCard(c, a.id, `subscription:${row.id}:card`);
        }
        const row = (
          await c.query(
            "INSERT INTO payments(plan_id,subscription_id,amount_minor,status,card_last4) VALUES($1,$2,$3,$4,$5) RETURNING id,created_at,updated_at",
            [
              p.id,
              subscription?.id ?? null,
              p.price_minor,
              result.status,
              result.last4,
            ],
          )
        ).rows[0];
        return {
          status: 201,
          body: {
            payment: {
              id: row.id,
              createdAt: row.created_at,
              updatedAt: row.updated_at,
              bookingId: null,
              subscriptionId: subscription?.id ?? null,
              amountMinor: p.price_minor,
              currency: "UAH",
              status: result.status,
              cardLast4: result.last4,
            },
            subscription,
          },
        };
      }),
    ["USER"],
    true,
  );
}
const subQuery = query.extend({
  status: z.enum(["ACTIVE", "EXHAUSTED", "EXPIRED"]).optional(),
  type: z.enum(["ONE_TIME", "MONTHLY", "CORPORATE"]).optional(),
});
export function listSubscriptions(request: Request, id?: string) {
  const q = subQuery.parse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (id) z.uuid().parse(id);
  return access(
    request,
    async (c, a) => {
      const values: unknown[] = [a.id],
        where = ["user_id=$1"];
      for (const [column, value] of [
        ["id", id],
        ["effective_status", q.status],
        ["plan_snapshot->>'type'", q.type],
      ])
        if (value) {
          values.push(value);
          where.push(`${column}=$${values.length}`);
        }
      const from = `FROM (SELECT *,CASE WHEN expires_at<=clock_timestamp() THEN 'EXPIRED' ELSE status END AS effective_status FROM user_subscriptions) sub WHERE ${where.join(" AND ")}`;
      const total = Number(
        (await c.query(`SELECT count(*) ${from}`, values)).rows[0].count,
      );
      values.push(q.pageSize, (q.page - 1) * q.pageSize);
      const rows = (
        await c.query<SubRow>(
          `SELECT * ${from} ORDER BY created_at ${q.sort === "newest" ? "DESC" : "ASC"},id LIMIT $${values.length - 1} OFFSET $${values.length}`,
          values,
        )
      ).rows;
      if (id) {
        if (!rows[0]) missing("Subscription not found");
        return Response.json(subscriptionDto(rows[0]));
      }
      return Response.json(
        page(rows.map(subscriptionDto), total, q.page, q.pageSize),
      );
    },
    ["USER"],
  );
}
export async function reserveVisits(
  c: PoolClient,
  id: string,
  userId: string,
  e: EventRow,
  s: SessionRow,
  seats: number,
  reserve = true,
) {
  const sub = (
    await c.query<SubRow>(
      "SELECT * FROM user_subscriptions WHERE id=$1 AND user_id=$2 FOR UPDATE",
      [id, userId],
    )
  ).rows[0];
  if (!sub) missing("Subscription not found");
  const p = sub.plan_snapshot,
    now = new Date();
  if (
    sub.status !== "ACTIVE" ||
    sub.expires_at <= now ||
    s.starts_at < sub.starts_at ||
    s.starts_at >= sub.expires_at ||
    p.organizerId !== e.organizer_id ||
    (p.scope === "DIRECTIONS" && !p.directionIds.includes(e.direction_id)) ||
    (sub.visits_left !== null && sub.visits_left < seats)
  )
    conflict("This subscription does not cover the session or enough visits");
  if (reserve && sub.visits_left !== null)
    await c.query(
      "UPDATE user_subscriptions SET visits_left=visits_left-$2,status=CASE WHEN visits_left=$2 THEN 'EXHAUSTED' ELSE 'ACTIVE' END,updated_at=clock_timestamp() WHERE id=$1",
      [id, seats],
    );
}
export async function returnVisits(c: PoolClient, bookingId: string) {
  const entry = (
    await c.query(
      "SELECT subscription_id,visits FROM subscription_visit_ledger WHERE booking_id=$1 AND returned_at IS NULL",
      [bookingId],
    )
  ).rows[0];
  if (!entry) return;
  await c.query("SELECT id FROM user_subscriptions WHERE id=$1 FOR UPDATE", [
    entry.subscription_id,
  ]);
  const returned = await c.query(
    "UPDATE subscription_visit_ledger SET returned_at=clock_timestamp() WHERE booking_id=$1 AND returned_at IS NULL RETURNING visits",
    [bookingId],
  );
  if (!returned.rowCount) return;
  await c.query(
    "UPDATE user_subscriptions SET visits_left=CASE WHEN visits_left IS NULL THEN NULL ELSE visits_left+$2 END,status=CASE WHEN expires_at<=clock_timestamp() THEN 'EXPIRED' ELSE 'ACTIVE' END,updated_at=clock_timestamp() WHERE id=$1",
    [entry.subscription_id, entry.visits],
  );
}
export async function expireSubscriptions(pool: Pool) {
  const due = await pool.query(
    "UPDATE background_runs SET next_run_at=clock_timestamp()+interval '1 hour',finished_at=clock_timestamp() WHERE name='subscription-expiry' AND next_run_at<=clock_timestamp() RETURNING name",
  );
  if (!due.rowCount) return;
  await pool.query(
    "UPDATE user_subscriptions SET status='EXPIRED',updated_at=clock_timestamp() WHERE id IN (SELECT id FROM user_subscriptions WHERE expires_at<=clock_timestamp() AND status<>'EXPIRED' FOR UPDATE SKIP LOCKED)",
  );
  await revertExpiredCorporateCards(pool);
}
