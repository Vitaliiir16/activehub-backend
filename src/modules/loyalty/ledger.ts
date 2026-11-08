// ActiveHub loyalty persistence: card synchronization, free-visit quota and points ledger.
import type { Pool, PoolClient } from "pg";
import { notify } from "../marketplace/core";
import type { EventRow, SessionRow } from "../marketplace/types";
import { kyivMonth, levelRank, pointsAward, priceBooking, type Level } from "./pricing";

export type CardRow = {
  account_id: string;
  loyalty_level: Level;
  base_level: "STANDARD" | "PREMIUM";
  card_locked_by_admin: boolean;
  points_balance: number;
  lifetime_points: number;
};
export type LevelRow = {
  level: Level;
  display_name: string;
  points_threshold: number | null;
  points_multiplier: string;
  discount_percent: string;
  free_visits_per_month: number;
  free_direction_ids: string[];
};
export type RulesRow = {
  base_points_per_booking: number;
  points_per_uah: string;
  redeem_rate: string;
  max_redeem_percent: string;
};

export async function levelConfigs(c: PoolClient) {
  return (
    await c.query<LevelRow>(
      "SELECT l.level,l.display_name,l.points_threshold,l.points_multiplier,l.discount_percent,l.free_visits_per_month,ARRAY(SELECT f.direction_id FROM loyalty_free_directions f JOIN directions d ON d.id=f.direction_id WHERE f.level_id=l.id ORDER BY d.name) AS free_direction_ids FROM loyalty_level_config l ORDER BY array_position(ARRAY['STANDARD','PREMIUM','CORPORATE'],l.level)",
    )
  ).rows;
}
export const levelConfig = async (c: PoolClient, level: Level) =>
  (await levelConfigs(c)).find((l) => l.level === level)!;
export const loyaltyRules = async (c: PoolClient) =>
  (await c.query<RulesRow>("SELECT * FROM loyalty_rules WHERE singleton")).rows[0];

// Q-04 (approved): corporate eligibility lasts until calendar expiry, even when visits are exhausted.
const corporateEligible = async (c: PoolClient, userId: string) =>
  !!(
    await c.query(
      "SELECT 1 FROM user_subscriptions WHERE user_id=$1 AND plan_snapshot->>'type'='CORPORATE' AND expires_at>clock_timestamp()",
      [userId],
    )
  ).rowCount;

async function notifyUpgrade(c: PoolClient, userId: string, to: Level, key: string) {
  const level = await levelConfig(c, to);
  await notify(c, {
    accountId: userId,
    key,
    type: "CARD_UPGRADED",
    category: "LOYALTY",
    emailUntilCustomized: true,
    title: "Loyalty card upgraded",
    body: `Your card is now ${level.display_name}.`,
    link: "/loyalty",
  });
}

/** Locks the user's card and applies automatic level rules unless an administrator locked it. */
export async function syncCard(c: PoolClient, userId: string, upgradeKey: string) {
  const card = (
    await c.query<CardRow>(
      "SELECT account_id,loyalty_level,base_level,card_locked_by_admin,points_balance,lifetime_points FROM user_profiles WHERE account_id=$1 FOR UPDATE",
      [userId],
    )
  ).rows[0];
  if (card.card_locked_by_admin) return card;
  const derived: Level = (await corporateEligible(c, userId)) ? "CORPORATE" : card.base_level;
  if (derived === card.loyalty_level) return card;
  await c.query(
    "UPDATE user_profiles SET loyalty_level=$2,updated_at=clock_timestamp() WHERE account_id=$1",
    [userId, derived],
  );
  if (levelRank(derived) > levelRank(card.loyalty_level))
    await notifyUpgrade(c, userId, derived, upgradeKey);
  return { ...card, loyalty_level: derived };
}

const quotaMonthDate = (month: string) => `${month}-01`;
export async function freeVisitsUsed(c: PoolClient, userId: string, month: string) {
  return Number(
    (
      await c.query(
        "SELECT coalesce(sum(visits),0)::int AS used FROM free_visit_ledger WHERE user_id=$1 AND quota_month=$2::date AND returned_at IS NULL",
        [userId, quotaMonthDate(month)],
      )
    ).rows[0].used,
  );
}

/** Prices a booking under the card lock; free quota belongs to the session month in Europe/Kyiv (Q-02). */
export async function quoteBooking(
  c: PoolClient,
  userId: string,
  e: EventRow,
  s: SessionRow,
  seats: number,
  subscription: boolean,
  now: Date,
) {
  const card = await syncCard(c, userId, `card:${userId}:sync:${now.toISOString()}`);
  const level = await levelConfig(c, card.loyalty_level);
  const month = kyivMonth(s.starts_at);
  const used = await freeVisitsUsed(c, userId, month);
  const effective =
    e.promo_price_minor !== null && e.promo_until && e.promo_until > now
      ? e.promo_price_minor
      : e.price_minor;
  return {
    ...priceBooking(
      {
        listPriceMinor: e.price_minor,
        effectivePriceMinor: effective,
        seats,
        freeAccessEligible:
          level.free_visits_per_month > 0 && level.free_direction_ids.includes(e.direction_id),
        freeVisitsRemaining: level.free_visits_per_month - used,
        discountPercent: level.discount_percent,
      },
      subscription,
    ),
    level: card.loyalty_level,
    month,
  };
}

export async function reserveFreeVisits(
  c: PoolClient,
  bookingId: string,
  userId: string,
  month: string,
  visits: number,
) {
  if (visits > 0)
    await c.query(
      "INSERT INTO free_visit_ledger(booking_id,user_id,quota_month,visits) VALUES($1,$2,$3::date,$4)",
      [bookingId, userId, quotaMonthDate(month), visits],
    );
}

/** Awards points once when a booking becomes CONFIRMED, including free and subscription bookings. */
export async function accruePoints(c: PoolClient, booking: { id: string; user_id: string }, title: string) {
  const card = await syncCard(c, booking.user_id, `booking:${booking.id}:card-sync`);
  if (
    (
      await c.query(
        "SELECT 1 FROM points_transactions WHERE booking_id=$1 AND reason='ACCRUAL'",
        [booking.id],
      )
    ).rowCount
  )
    return;
  const [rules, levels] = [await loyaltyRules(c), await levelConfigs(c)];
  const level = levels.find((l) => l.level === card.loyalty_level)!;
  const paid = Number(
    (
      await c.query(
        "SELECT coalesce(sum(amount_minor),0)::int AS paid FROM payments WHERE booking_id=$1 AND status='SUCCEEDED'",
        [booking.id],
      )
    ).rows[0].paid,
  );
  const award = pointsAward(
    paid,
    { basePointsPerBooking: rules.base_points_per_booking, pointsPerUah: rules.points_per_uah },
    level.points_multiplier,
  );
  const tx = (
    await c.query(
      "INSERT INTO points_transactions(user_id,booking_id,delta,reason,note) VALUES($1,$2,$3,'ACCRUAL',$4) RETURNING id",
      [booking.user_id, booking.id, award, `${level.display_name} card, multiplier ${level.points_multiplier}`],
    )
  ).rows[0];
  const threshold = levels.find((l) => l.level === "PREMIUM")!.points_threshold;
  await c.query(
    "UPDATE user_profiles SET points_balance=points_balance+$2,lifetime_points=lifetime_points+$2,base_level=CASE WHEN $3::int IS NOT NULL AND lifetime_points+$2>=$3::int THEN 'PREMIUM' ELSE base_level END,updated_at=clock_timestamp() WHERE account_id=$1",
    [booking.user_id, award, threshold],
  );
  await c.query("UPDATE bookings SET points_awarded=$2 WHERE id=$1", [booking.id, award]);
  await notify(c, {
    accountId: booking.user_id,
    key: `points:${tx.id}:accrual`,
    type: "POINTS_ACCRUED",
    category: "LOYALTY",
    title: "Points earned",
    body: `${award} points for ${title}.`,
    link: "/loyalty",
  });
  await syncCard(c, booking.user_id, `points:${tx.id}:upgrade`);
}

/**
 * Releases loyalty effects of a booking once: returns free visits and reverses the original award.
 * Q-01 (approved): a reversal deducts at most the available balance; the unrecoverable remainder is written off.
 */
export async function releaseLoyalty(c: PoolClient, booking: { id: string; user_id: string }) {
  const card = await syncCard(c, booking.user_id, `booking:${booking.id}:card-sync`);
  await c.query(
    "UPDATE free_visit_ledger SET returned_at=clock_timestamp() WHERE booking_id=$1 AND returned_at IS NULL",
    [booking.id],
  );
  const accrual = (
    await c.query<{ delta: number }>(
      "SELECT delta FROM points_transactions WHERE booking_id=$1 AND reason='ACCRUAL'",
      [booking.id],
    )
  ).rows[0];
  if (!accrual) return;
  const deducted = Math.min(accrual.delta, card.points_balance);
  const shortfall = accrual.delta - deducted;
  const tx = (
    await c.query(
      "INSERT INTO points_transactions(user_id,booking_id,delta,reason,note) VALUES($1,$2,$3,'REVERSAL',$4) ON CONFLICT (booking_id) WHERE reason='REVERSAL' DO NOTHING RETURNING id",
      [
        booking.user_id,
        booking.id,
        -deducted,
        shortfall
          ? `Original award ${accrual.delta}; ${shortfall} already spent and not recovered`
          : `Original award ${accrual.delta}`,
      ],
    )
  ).rows[0];
  if (!tx) return;
  await c.query(
    "UPDATE user_profiles SET points_balance=points_balance-$2,lifetime_points=greatest(0,lifetime_points-$3),updated_at=clock_timestamp() WHERE account_id=$1",
    [booking.user_id, deducted, accrual.delta],
  );
  if (accrual.delta > 0)
    await notify(c, {
      accountId: booking.user_id,
      key: `points:${tx.id}:reversal`,
      type: "POINTS_REVERSED",
      category: "LOYALTY",
      title: "Points reversed",
      body: `${deducted} points were reversed after a cancelled booking.`,
      link: "/loyalty",
    });
}

/** Hourly sweep: unlocked corporate cards return to their base level after the last corporate subscription expires. */
export async function revertExpiredCorporateCards(pool: Pool) {
  await pool.query(
    "UPDATE user_profiles SET loyalty_level=base_level,updated_at=clock_timestamp() WHERE account_id IN (SELECT p.account_id FROM user_profiles p WHERE p.loyalty_level='CORPORATE' AND NOT p.card_locked_by_admin AND NOT EXISTS(SELECT 1 FROM user_subscriptions s WHERE s.user_id=p.account_id AND s.plan_snapshot->>'type'='CORPORATE' AND s.expires_at>clock_timestamp()) FOR UPDATE SKIP LOCKED)",
  );
}
