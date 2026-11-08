// ActiveHub loyalty pricing and points rules; pure functions without persistence.
export type Level = "STANDARD" | "PREMIUM" | "CORPORATE";
export const levels: Level[] = ["STANDARD", "PREMIUM", "CORPORATE"];
export const levelRank = (level: Level) => levels.indexOf(level);

export type Discount = {
  type: "PROMOTION" | "FREE_ACCESS" | "CARD_DISCOUNT" | "POINTS";
  amountMinor: number;
  description: string;
};
export type PriceContext = {
  listPriceMinor: number;
  effectivePriceMinor: number;
  seats: number;
  freeAccessEligible: boolean;
  freeVisitsRemaining: number;
  discountPercent: string;
  dueMinor: number;
  freePlaces: number;
  discounts: Discount[];
};

export function scaled(value: string, decimals: number) {
  const match = /^([0-9]+)(?:\.([0-9]+))?$/.exec(value.trim());
  if (!match) throw new Error(`Invalid decimal ${value}`);
  const fraction = (match[2] ?? "").padEnd(decimals, "0");
  if (fraction.length > decimals && /[1-9]/.test(fraction.slice(decimals)))
    throw new Error(`Too many decimal places in ${value}`);
  return BigInt(match[1]) * 10n ** BigInt(decimals) + BigInt(fraction.slice(0, decimals) || "0");
}

// Chain of Responsibility: PriceStep handlers (promotion, free access, card discount)
// each apply one ordered modifier and pass the context on, so the source order of
// section 7.6.1 stays explicit and the optional redemption step can be linked later.
abstract class PriceStep {
  private next?: PriceStep;
  then(next: PriceStep) {
    this.next = next;
    return next;
  }
  apply(context: PriceContext) {
    this.handle(context);
    this.next?.apply(context);
  }
  protected abstract handle(context: PriceContext): void;
}
class PromotionStep extends PriceStep {
  protected handle(c: PriceContext) {
    c.dueMinor = c.effectivePriceMinor * c.seats;
    if (c.effectivePriceMinor < c.listPriceMinor)
      c.discounts.push({
        type: "PROMOTION",
        amountMinor: (c.listPriceMinor - c.effectivePriceMinor) * c.seats,
        description: "Event promotion",
      });
  }
}
class FreeAccessStep extends PriceStep {
  protected handle(c: PriceContext) {
    if (!c.freeAccessEligible || c.effectivePriceMinor === 0) return;
    c.freePlaces = Math.min(c.seats, Math.max(0, c.freeVisitsRemaining));
    if (!c.freePlaces) return;
    const amount = c.freePlaces * c.effectivePriceMinor;
    c.dueMinor -= amount;
    c.discounts.push({
      type: "FREE_ACCESS",
      amountMinor: amount,
      description: `Card free access: ${c.freePlaces} ${c.freePlaces === 1 ? "visit" : "visits"}`,
    });
  }
}
class CardDiscountStep extends PriceStep {
  protected handle(c: PriceContext) {
    const basisPoints = scaled(c.discountPercent, 2);
    if (basisPoints === 0n || c.dueMinor <= 0) return;
    const amount = Number((BigInt(c.dueMinor) * basisPoints + 5000n) / 10000n);
    if (!amount) return;
    c.dueMinor -= amount;
    c.discounts.push({
      type: "CARD_DISCOUNT",
      amountMinor: amount,
      description: `Card discount ${c.discountPercent}%`,
    });
  }
}

export type PriceInput = Omit<PriceContext, "dueMinor" | "freePlaces" | "discounts">;
export function priceBooking(input: PriceInput, subscription = false) {
  const context: PriceContext = { ...input, dueMinor: 0, freePlaces: 0, discounts: [] };
  const chain = new PromotionStep();
  if (!subscription) chain.then(new FreeAccessStep()).then(new CardDiscountStep());
  chain.apply(context);
  if (subscription) context.dueMinor = 0;
  return {
    basePriceMinor: input.listPriceMinor * input.seats,
    amountDueMinor: Math.max(0, context.dueMinor),
    freePlaces: context.freePlaces,
    discounts: context.discounts,
  };
}

export function pointsAward(
  amountPaidMinor: number,
  rules: { basePointsPerBooking: number; pointsPerUah: string },
  multiplier: string,
) {
  const perUah = scaled(rules.pointsPerUah, 4);
  const paidPoints = (BigInt(amountPaidMinor) * perUah) / 1000000n;
  return Number(((BigInt(rules.basePointsPerBooking) + paidPoints) * scaled(multiplier, 2)) / 100n);
}

export function kyivMonth(at: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(at);
  const value = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${value("year")}-${value("month")}`;
}
