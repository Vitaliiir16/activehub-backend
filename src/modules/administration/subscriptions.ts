// ActiveHub subscription administration: platform-wide search of plans and purchased subscriptions.
import { z } from "zod";
import { access, page } from "../marketplace/core";
import { planDto, subscriptionDto, type PlanRow, type SubRow } from "../marketplace/subscriptions";
import { pagination } from "../marketplace/validation";

const order = z.enum(["newest", "oldest"]).default("newest");
const subscriptionQuery = z.strictObject({
  ...pagination,
  userId: z.uuid().optional(),
  organizerId: z.uuid().optional(),
  status: z.enum(["ACTIVE", "EXPIRED", "EXHAUSTED"]).optional(),
  sort: order,
});
const planQuery = z.strictObject({
  ...pagination,
  organizerId: z.uuid().optional(),
  status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
  sort: order,
});

export function listAllSubscriptions(request: Request) {
  const q = subscriptionQuery.parse(Object.fromEntries(new URL(request.url).searchParams));
  return access(
    request,
    async (client) => {
      const values: unknown[] = [];
      const where = ["true"];
      const bind = (v: unknown) => {
        values.push(v);
        return `$${values.length}`;
      };
      if (q.userId) where.push(`user_id=${bind(q.userId)}`);
      if (q.organizerId) where.push(`plan_snapshot->>'organizerId'=${bind(q.organizerId)}`);
      if (q.status) where.push(`effective_status=${bind(q.status)}`);
      const from = `FROM (SELECT *,CASE WHEN expires_at<=clock_timestamp() THEN 'EXPIRED' ELSE status END AS effective_status FROM user_subscriptions) s WHERE ${where.join(" AND ")}`;
      const total = Number((await client.query(`SELECT count(*) ${from}`, values)).rows[0].count);
      const rows = (
        await client.query<SubRow>(
          `SELECT * ${from} ORDER BY created_at ${q.sort === "newest" ? "DESC" : "ASC"},id LIMIT ${bind(q.pageSize)} OFFSET ${bind((q.page - 1) * q.pageSize)}`,
          values,
        )
      ).rows;
      return Response.json(page(rows.map(subscriptionDto), total, q.page, q.pageSize));
    },
    ["ADMIN"],
  );
}

export function listAllPlans(request: Request) {
  const q = planQuery.parse(Object.fromEntries(new URL(request.url).searchParams));
  return access(
    request,
    async (client) => {
      const values: unknown[] = [];
      const where = ["true"];
      const bind = (v: unknown) => {
        values.push(v);
        return `$${values.length}`;
      };
      if (q.organizerId) where.push(`p.organizer_id=${bind(q.organizerId)}`);
      if (q.status) where.push(`p.status=${bind(q.status)}`);
      const from = `FROM subscription_plans p WHERE ${where.join(" AND ")}`;
      const total = Number((await client.query(`SELECT count(*) ${from}`, values)).rows[0].count);
      const rows = (
        await client.query<PlanRow>(
          `SELECT p.*,ARRAY(SELECT name FROM directions WHERE id=ANY(p.direction_ids) ORDER BY name) AS direction_names ${from} ORDER BY p.created_at ${q.sort === "newest" ? "DESC" : "ASC"},p.id LIMIT ${bind(q.pageSize)} OFFSET ${bind((q.page - 1) * q.pageSize)}`,
          values,
        )
      ).rows;
      return Response.json(page(rows.map(planDto), total, q.page, q.pageSize));
    },
    ["ADMIN"],
  );
}
