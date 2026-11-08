import { jsonBody } from "../accounts/http";
import { access, conflict, idempotent, notify } from "./core";
import { lockBooking, transition } from "./bookings";
import { cardInput, SimulatedCardGateway } from "./payment-gateway";
import { paymentDtos } from "./payment-records";
export async function payBooking(request: Request, id: string) {
  const input = cardInput.parse(await jsonBody(request));
  return access(
    request,
    async (client, current) =>
      idempotent(
        client,
        current,
        request,
        `payBooking:${id}`,
        input,
        async () => {
          const {
            booking: b,
            event: e,
            session: s,
          } = await lockBooking(client, id, current);
          if (
            b.status !== "AWAITING_PAYMENT" ||
            !b.deadline_at ||
            b.deadline_at <= new Date() ||
            b.amount_due_minor <= 0
          )
            conflict("This booking cannot be paid");
          const result = await new SimulatedCardGateway().charge(input);
          if (b.deadline_at <= new Date() || s.starts_at <= new Date())
            conflict("The payment deadline has passed");
          const payment = (
            await client.query(
              "INSERT INTO payments(booking_id,amount_minor,status,card_last4) VALUES($1,$2,$3,$4) RETURNING id",
              [b.id, b.amount_due_minor, result.status, result.last4],
            )
          ).rows[0];
          if (result.status === "SUCCEEDED")
            await transition(client, b, e, s, "CONFIRMED", {
              id: current.id,
              role: current.role,
            });
          await notify(client, {
            accountId: current.id,
            key: `payment:${payment.id}:result`,
            type: `PAYMENT_${result.status}`,
            title:
              result.status === "SUCCEEDED"
                ? "Payment received"
                : "Payment declined",
            body:
              result.status === "SUCCEEDED"
                ? `Receipt ${payment.id}: UAH ${(b.amount_due_minor / 100).toFixed(2)}, card ending ${result.last4}.`
                : "No payment was taken. Try again before the booking deadline.",
            link: `/bookings/${b.id}`,
          });
          return {
            status: 201,
            body: (await paymentDtos(client, b.id)).find(
              (p) => p.id === payment.id,
            ),
          };
        },
      ),
    ["USER"],
    true,
  );
}
