import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { integerSetting } from "./core";
export const cardInput = z
  .strictObject({
    number: z.string().regex(/^\d{13,19}$/),
    holder: z.string().trim().min(2).max(100),
    expiryMonth: z.number().int().min(1).max(12),
    expiryYear: z.number().int().min(2000).max(9999),
    cvv: z.string().regex(/^\d{3,4}$/),
  })
  .refine(
    (card) => {
      const now = new Date();
      return (
        card.expiryYear > now.getUTCFullYear() ||
        (card.expiryYear === now.getUTCFullYear() &&
          card.expiryMonth >= now.getUTCMonth() + 1)
      );
    },
    { path: ["expiryMonth"], message: "The card has expired" },
  );
export type CardInput = z.infer<typeof cardInput>;
export interface PaymentGateway {
  charge(
    card: CardInput,
  ): Promise<{ status: "SUCCEEDED" | "FAILED"; last4: string }>;
}
// Adapter: SimulatedCardGateway implements the PaymentGateway port without retaining card credentials.
export class SimulatedCardGateway implements PaymentGateway {
  async charge(card: CardInput) {
    await delay(integerSetting("PAYMENT_SIMULATION_MS", 1250, 1000, 2000));
    return {
      status:
        card.number === "4000000000000002"
          ? ("FAILED" as const)
          : ("SUCCEEDED" as const),
      last4: card.number.slice(-4),
    };
  }
}
