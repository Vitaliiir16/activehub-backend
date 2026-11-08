import assert from "node:assert/strict";
import test from "node:test";
import { kyivMonth, pointsAward, priceBooking, scaled } from "../src/modules/loyalty/pricing";

const base = {
  listPriceMinor: 20000,
  effectivePriceMinor: 20000,
  seats: 1,
  freeAccessEligible: false,
  freeVisitsRemaining: 0,
  discountPercent: "0.00",
};

test("pricing applies promotion, free access and card discount in source order", () => {
  const result = priceBooking({
    ...base,
    effectivePriceMinor: 15000,
    seats: 3,
    freeAccessEligible: true,
    freeVisitsRemaining: 1,
    discountPercent: "5.00",
  });
  assert.equal(result.basePriceMinor, 60000);
  assert.equal(result.freePlaces, 1);
  assert.deepEqual(
    result.discounts.map((d) => [d.type, d.amountMinor]),
    [
      ["PROMOTION", 15000],
      ["FREE_ACCESS", 15000],
      ["CARD_DISCOUNT", 1500],
    ],
  );
  assert.equal(result.amountDueMinor, 28500);
});

test("free access is capped by remaining quota and never used for free events or ineligible directions", () => {
  assert.equal(priceBooking({ ...base, seats: 2, freeAccessEligible: true, freeVisitsRemaining: 4 }).amountDueMinor, 0);
  assert.equal(priceBooking({ ...base, seats: 2, freeAccessEligible: true, freeVisitsRemaining: 0 }).freePlaces, 0);
  assert.equal(priceBooking({ ...base, seats: 2, freeAccessEligible: true, freeVisitsRemaining: -3 }).freePlaces, 0);
  const free = priceBooking({ ...base, listPriceMinor: 0, effectivePriceMinor: 0, freeAccessEligible: true, freeVisitsRemaining: 4 });
  assert.equal(free.freePlaces, 0);
  assert.equal(priceBooking({ ...base, freeVisitsRemaining: 4 }).freePlaces, 0);
});

test("card discount rounds half up to whole minor units", () => {
  assert.equal(priceBooking({ ...base, listPriceMinor: 3333, effectivePriceMinor: 3333, discountPercent: "10.00" }).amountDueMinor, 3000);
  assert.equal(priceBooking({ ...base, listPriceMinor: 10, effectivePriceMinor: 10, discountPercent: "5.00" }).amountDueMinor, 9);
  assert.equal(priceBooking({ ...base, discountPercent: "100.00" }).amountDueMinor, 0);
});

test("subscription bookings skip quota and card discount and owe nothing", () => {
  const result = priceBooking({ ...base, seats: 2, freeAccessEligible: true, freeVisitsRemaining: 4, discountPercent: "10.00" }, true);
  assert.equal(result.amountDueMinor, 0);
  assert.equal(result.freePlaces, 0);
  assert.deepEqual(result.discounts, []);
});

test("points award follows floor((base + floor(paid * rate)) * multiplier)", () => {
  const rules = { basePointsPerBooking: 10, pointsPerUah: "0.1000" };
  assert.equal(pointsAward(0, rules, "1.00"), 10);
  assert.equal(pointsAward(25050, rules, "1.00"), 35);
  assert.equal(pointsAward(9999, rules, "1.00"), 19);
  assert.equal(pointsAward(25050, rules, "1.50"), 52);
  assert.equal(pointsAward(0, rules, "2.00"), 20);
  assert.equal(pointsAward(100, { basePointsPerBooking: 0, pointsPerUah: "0.3333" }, "3.00"), 0);
});

test("decimal parsing is exact and Europe/Kyiv month boundaries are respected", () => {
  assert.equal(scaled("0.1", 4), 1000n);
  assert.equal(scaled("1.50", 2), 150n);
  assert.throws(() => scaled("1.234", 2));
  assert.equal(kyivMonth(new Date("2026-10-31T21:59:59Z")), "2026-10");
  assert.equal(kyivMonth(new Date("2026-10-31T22:00:00Z")), "2026-11");
  assert.equal(kyivMonth(new Date("2026-03-31T20:59:59Z")), "2026-03");
  assert.equal(kyivMonth(new Date("2026-03-31T21:00:00Z")), "2026-04");
});
