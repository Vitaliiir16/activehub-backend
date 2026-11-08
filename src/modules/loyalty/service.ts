// ActiveHub loyalty use cases: member card summary, ledger and administrator configuration.
import { z } from "zod";
import type { PoolClient } from "pg";
import { invalid, jsonBody } from "../accounts/http";
import { profile } from "../accounts/profiles";
import { access, conflict, idempotent, missing, notify, page } from "../marketplace/core";
import { pagination } from "../marketplace/validation";
import {
  freeVisitsUsed,
  levelConfig,
  levelConfigs,
  loyaltyRules,
  syncCard,
  type LevelRow,
  type RulesRow,
} from "./ledger";
import { kyivMonth, levelRank, scaled, type Level } from "./pricing";

const levelDto = (l: LevelRow) => ({
  level: l.level,
  displayName: l.display_name,
  pointsThreshold: l.points_threshold,
  multiplier: l.points_multiplier,
  discountPercent: l.discount_percent,
  freeDirectionIds: l.free_direction_ids,
  freeVisitsPerMonth: l.free_visits_per_month,
});
const rulesDto = (r: RulesRow) => ({
  basePointsPerBooking: r.base_points_per_booking,
  pointsPerUah: r.points_per_uah,
  redeemRateMinor: Number(scaled(r.redeem_rate, 2)),
  maxRedeemPercent: r.max_redeem_percent,
});
type TxRow = {
  id: string;
  created_at: Date;
  updated_at: Date;
  user_id: string;
  booking_id: string | null;
  delta: number;
  reason: string;
  note: string | null;
};
const txDto = (t: TxRow) => ({
  id: t.id,
  createdAt: t.created_at,
  updatedAt: t.updated_at,
  userId: t.user_id,
  bookingId: t.booking_id,
  delta: t.delta,
  reason: t.reason,
  note: t.note,
});

export function getLoyalty(request: Request) {
  return access(
    request,
    async (c, a) => {
      const now = new Date();
      const card = await syncCard(c, a.id, `card:${a.id}:sync:${now.toISOString()}`);
      const all = await levelConfigs(c);
      const current = all.find((l) => l.level === card.loyalty_level)!;
      const threshold = all.find((l) => l.level === "PREMIUM")!.points_threshold;
      const month = kyivMonth(now);
      const used = await freeVisitsUsed(c, a.id, month);
      const counts = (
        await c.query(
          "SELECT count(*)::int AS bookings,count(*) FILTER (WHERE status='COMPLETED')::int AS attended FROM bookings WHERE user_id=$1",
          [a.id],
        )
      ).rows[0];
      return Response.json({
        card: levelDto(current),
        cardLockedByAdmin: card.card_locked_by_admin,
        pointsBalance: card.points_balance,
        lifetimePoints: card.lifetime_points,
        pointsToNextLevel:
          card.loyalty_level === "STANDARD" && threshold !== null
            ? Math.max(0, threshold - card.lifetime_points)
            : null,
        quotaMonth: month,
        freeVisitsUsed: used,
        freeVisitsRemaining: Math.max(0, current.free_visits_per_month - used),
        bookingCount: counts.bookings,
        attendanceCount: counts.attended,
      });
    },
    ["USER"],
  );
}

const ledgerQuery = z.strictObject({
  ...pagination,
  dateFrom: z.iso.date().optional(),
  dateTo: z.iso.date().optional(),
  sort: z.enum(["newest", "oldest"]).default("newest"),
});
export function listPointsTransactions(request: Request) {
  const q = ledgerQuery.parse(Object.fromEntries(new URL(request.url).searchParams));
  return access(
    request,
    async (c, a) => {
      const values: unknown[] = [a.id];
      const where = ["user_id=$1"];
      if (q.dateFrom) {
        values.push(q.dateFrom);
        where.push(`created_at>=($${values.length}::date::timestamp AT TIME ZONE 'Europe/Kyiv')`);
      }
      if (q.dateTo) {
        values.push(q.dateTo);
        where.push(`created_at<(($${values.length}::date+1)::timestamp AT TIME ZONE 'Europe/Kyiv')`);
      }
      const from = `FROM points_transactions WHERE ${where.join(" AND ")}`;
      const total = Number((await c.query(`SELECT count(*) ${from}`, values)).rows[0].count);
      values.push(q.pageSize, (q.page - 1) * q.pageSize);
      const rows = (
        await c.query<TxRow>(
          `SELECT * ${from} ORDER BY created_at ${q.sort === "newest" ? "DESC" : "ASC"},id LIMIT $${values.length - 1} OFFSET $${values.length}`,
          values,
        )
      ).rows;
      return Response.json(page(rows.map(txDto), total, q.page, q.pageSize));
    },
    ["USER"],
  );
}

export function adminGetLevels(request: Request) {
  return access(request, async (c) => Response.json((await levelConfigs(c)).map(levelDto)), ["ADMIN"]);
}

const decimal = (max: number, places: number, message: string) =>
  z
    .string()
    .regex(new RegExp(`^[0-9]+(\\.[0-9]{1,${places}})?$`), message)
    .refine((v) => Number(v) <= max, message);
const levelInput = z.strictObject({
  level: z.enum(["STANDARD", "PREMIUM", "CORPORATE"]),
  displayName: z.string().trim().min(1).max(100),
  pointsThreshold: z.number().int().min(0).max(2147483647).nullable(),
  multiplier: decimal(100, 2, "Use a multiplier from 0 to 100 with up to two decimals"),
  discountPercent: decimal(100, 2, "Use a percentage from 0 to 100 with up to two decimals"),
  freeDirectionIds: z
    .array(z.uuid())
    .max(100)
    .refine((a) => new Set(a).size === a.length, "Directions must be unique"),
  freeVisitsPerMonth: z.number().int().min(0).max(1000),
});
export async function adminSetLevel(request: Request, level: string) {
  const target = z.enum(["STANDARD", "PREMIUM", "CORPORATE"]).parse(level);
  const input = levelInput.parse(await jsonBody(request));
  if (input.level !== target) invalid("level", "The level must match the address");
  if (target === "PREMIUM" && input.pointsThreshold === null)
    invalid("pointsThreshold", "Premium requires a points threshold");
  if (target !== "PREMIUM" && input.pointsThreshold !== null)
    invalid("pointsThreshold", "Only Premium has a points threshold");
  if (input.freeVisitsPerMonth === 0 && input.freeDirectionIds.length)
    invalid("freeVisitsPerMonth", "Free directions need at least one free visit per month");
  return access(
    request,
    async (c) => {
      const row = (
        await c.query("SELECT id FROM loyalty_level_config WHERE level=$1 FOR UPDATE", [target])
      ).rows[0];
      const old = (await levelConfig(c, target)).free_direction_ids;
      for (const id of input.freeDirectionIds)
        if (
          !(await c.query("SELECT 1 FROM directions WHERE id=$1 AND (is_active OR $2)", [id, old.includes(id)]))
            .rowCount
        )
          invalid("freeDirectionIds", "Choose active directions");
      await c.query(
        "UPDATE loyalty_level_config SET display_name=$2,points_threshold=$3,points_multiplier=$4,discount_percent=$5,free_visits_per_month=$6,updated_at=clock_timestamp() WHERE id=$1",
        [row.id, input.displayName, input.pointsThreshold, input.multiplier, input.discountPercent, input.freeVisitsPerMonth],
      );
      await c.query("DELETE FROM loyalty_free_directions WHERE level_id=$1", [row.id]);
      for (const id of input.freeDirectionIds)
        await c.query("INSERT INTO loyalty_free_directions(level_id,direction_id) VALUES($1,$2)", [row.id, id]);
      return Response.json(levelDto(await levelConfig(c, target)));
    },
    ["ADMIN"],
    true,
  );
}

export function adminGetLoyaltyRules(request: Request) {
  return access(request, async (c) => Response.json(rulesDto(await loyaltyRules(c))), ["ADMIN"]);
}
const rulesInput = z.strictObject({
  basePointsPerBooking: z.number().int().min(0).max(1000000),
  pointsPerUah: decimal(1000, 4, "Use a rate from 0 to 1000 with up to four decimals"),
  redeemRateMinor: z.number().int().min(0).max(100000),
  maxRedeemPercent: decimal(100, 2, "Use a percentage from 0 to 100 with up to two decimals"),
});
export async function adminSetLoyaltyRules(request: Request) {
  const input = rulesInput.parse(await jsonBody(request));
  return access(
    request,
    async (c) => {
      await c.query(
        "UPDATE loyalty_rules SET base_points_per_booking=$1,points_per_uah=$2,redeem_rate=$3::numeric/100,max_redeem_percent=$4,updated_at=clock_timestamp() WHERE singleton",
        [input.basePointsPerBooking, input.pointsPerUah, input.redeemRateMinor, input.maxRedeemPercent],
      );
      return Response.json(rulesDto(await loyaltyRules(c)));
    },
    ["ADMIN"],
    true,
  );
}

async function memberCard(c: PoolClient, id: string) {
  z.uuid().parse(id);
  const row = (
    await c.query(
      "SELECT p.loyalty_level,p.points_balance FROM accounts a JOIN user_profiles p ON p.account_id=a.id WHERE a.id=$1 AND a.role='USER' AND a.status<>'DELETED' FOR UPDATE OF p",
      [id],
    )
  ).rows[0];
  if (!row) missing("User not found");
  return row as { loyalty_level: Level; points_balance: number };
}

const cardInput = z.strictObject({
  level: z.enum(["STANDARD", "PREMIUM", "CORPORATE"]),
  locked: z.boolean(),
  reason: z.string().trim().min(1).max(500),
});
export async function adminAssignCard(request: Request, id: string) {
  const input = cardInput.parse(await jsonBody(request));
  return access(
    request,
    async (c, admin) => {
      const before = await memberCard(c, id);
      const assignment = (
        await c.query(
          "INSERT INTO card_assignments(user_id,admin_id,level,locked,reason) VALUES($1,$2,$3,$4,$5) RETURNING id",
          [id, admin.id, input.level, input.locked, input.reason],
        )
      ).rows[0];
      await c.query(
        "UPDATE user_profiles SET loyalty_level=$2,card_locked_by_admin=$3,base_level=CASE WHEN $2 IN ('STANDARD','PREMIUM') THEN $2 ELSE base_level END,updated_at=clock_timestamp() WHERE account_id=$1",
        [id, input.level, input.locked],
      );
      const after = input.locked
        ? input.level
        : (await syncCard(c, id, `card-assignment:${assignment.id}:sync`)).loyalty_level;
      if (after !== input.level)
        invalid("locked", "Automatic card rules would change this level; lock the card to keep it");
      if (levelRank(after) > levelRank(before.loyalty_level)) {
        const config = await levelConfig(c, after);
        await notify(c, {
          accountId: id,
          key: `card-assignment:${assignment.id}`,
          type: "CARD_UPGRADED",
          category: "LOYALTY",
          emailUntilCustomized: true,
          title: "Loyalty card upgraded",
          body: `An administrator set your card to ${config.display_name}.`,
          link: "/loyalty",
        });
      }
      return Response.json(await profile(c, { id, role: "USER" }));
    },
    ["ADMIN"],
    true,
  );
}

const adjustInput = z.strictObject({
  delta: z.number().int().min(-1000000).max(1000000).refine((v) => v !== 0, "Enter a nonzero amount"),
  reason: z.string().trim().min(1).max(500),
});
export async function adminAdjustPoints(request: Request, id: string) {
  const input = adjustInput.parse(await jsonBody(request));
  return access(
    request,
    async (c, admin) =>
      idempotent(c, admin, request, `adjustPoints:${id}`, input, async () => {
        const card = await memberCard(c, id);
        if (card.points_balance + input.delta < 0) conflict("The points balance cannot become negative");
        const tx = (
          await c.query<TxRow>(
            "INSERT INTO points_transactions(user_id,delta,reason,note,actor_id) VALUES($1,$2,'ADMIN_ADJUST',$3,$4) RETURNING *",
            [id, input.delta, input.reason, admin.id],
          )
        ).rows[0];
        await c.query(
          "UPDATE user_profiles SET points_balance=points_balance+$2,updated_at=clock_timestamp() WHERE account_id=$1",
          [id, input.delta],
        );
        await notify(c, {
          accountId: id,
          key: `points:${tx.id}:adjustment`,
          type: "POINTS_ADJUSTED",
          category: "LOYALTY",
          title: "Points balance adjusted",
          body: `${input.delta > 0 ? "+" : ""}${input.delta} points: ${input.reason}`,
          link: "/loyalty",
        });
        return { status: 201, body: txDto(tx) };
      }),
    ["ADMIN"],
    true,
  );
}
