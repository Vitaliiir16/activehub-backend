import type { PoolClient } from "pg";
import { notify } from "./core";
export async function paymentDtos(client: PoolClient, bookingId: string) {
  return (
    await client.query(
      'SELECT id,created_at AS "createdAt",updated_at AS "updatedAt",booking_id AS "bookingId",NULL AS "subscriptionId",amount_minor AS "amountMinor",\'UAH\' AS currency,status,card_last4 AS "cardLast4",refunded_at AS "refundedAt" FROM payments WHERE booking_id=$1 ORDER BY created_at,id',
      [bookingId],
    )
  ).rows;
}
export async function refundBooking(
  client: PoolClient,
  bookingId: string,
  userId: string,
  why: string,
) {
  const payments = (
    await client.query(
      "SELECT * FROM payments WHERE booking_id=$1 AND status='SUCCEEDED' FOR UPDATE",
      [bookingId],
    )
  ).rows;
  for (const p of payments) {
    await client.query(
      "INSERT INTO refunds(payment_id,amount_minor,reason) VALUES($1,$2,$3) ON CONFLICT(payment_id) DO NOTHING",
      [p.id, p.amount_minor, why],
    );
    await client.query(
      "UPDATE payments SET status='REFUNDED',refunded_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=$1",
      [p.id],
    );
    await notify(client, {
      accountId: userId,
      key: `payment:${p.id}:refund`,
      type: "PAYMENT_REFUNDED",
      title: "Payment refunded",
      body: `Full simulated refund: UAH ${(p.amount_minor / 100).toFixed(2)} to card ending ${p.card_last4}.`,
      link: `/bookings/${bookingId}`,
    });
  }
}
