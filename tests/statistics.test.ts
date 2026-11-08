import assert from "node:assert/strict";
import test from "node:test";
import { addDays, dayBuckets, kyivDate, labelOf, monthRange, ratio, resolveRange } from "../src/modules/statistics/period";

/** Validation failures carry their message in the field map of the HTTP error. */
const fieldError = (pattern: RegExp) => (error: { fields?: Record<string, string[]> }) =>
  Object.values(error.fields ?? {}).flat().some((message) => pattern.test(message));

test("presets end today in Europe/Kyiv and include both ends", () => {
  // Kyiv is UTC+2 in November: 22:30 UTC is already 00:30 on the next day.
  const before = new Date("2026-11-08T21:30:00Z");
  assert.equal(kyivDate(before), "2026-11-08");
  const now = new Date("2026-11-08T22:30:00Z");
  assert.equal(kyivDate(now), "2026-11-09");
  const seven = resolveRange({ period: "7d" }, now);
  assert.equal(seven.dateTo, "2026-11-09");
  assert.equal(seven.dateFrom, "2026-11-03");
  assert.equal(seven.days.length, 7);
  assert.equal(resolveRange({}, now).days.length, 30, "30 days is the default");
  assert.equal(resolveRange({ period: "90d" }, now).days.length, 90);
});

test("custom ranges need both dates, keep order and stay within one year", () => {
  assert.deepEqual(resolveRange({ period: "custom", dateFrom: "2026-03-29", dateTo: "2026-03-31" }).days, [
    "2026-03-29",
    "2026-03-30",
    "2026-03-31",
  ]);
  assert.throws(() => resolveRange({ period: "custom", dateFrom: "2026-03-01" }), fieldError(/both start and end/));
  assert.throws(() => resolveRange({ period: "custom", dateFrom: "2026-03-05", dateTo: "2026-03-01" }), fieldError(/follow start/));
  assert.throws(() => resolveRange({ period: "custom", dateFrom: "2025-01-01", dateTo: "2026-03-01" }), fieldError(/one year/));
  assert.throws(() => resolveRange({ period: "7d", dateFrom: "2026-03-01" }), fieldError(/period=custom/));
  assert.equal(resolveRange({ period: "custom", dateFrom: "2026-01-01", dateTo: "2026-12-31" }).days.length, 365);
});

test("the month window follows Kyiv calendar months, including leap February", () => {
  const november = monthRange(new Date("2026-11-30T23:30:00Z"));
  assert.deepEqual([november.dateFrom, november.dateTo], ["2026-12-01", "2026-12-31"], "1 Dec in Kyiv");
  const feb = monthRange(new Date("2028-02-10T12:00:00Z"));
  assert.deepEqual([feb.dateFrom, feb.dateTo], ["2028-02-01", "2028-02-29"]);
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
});

test("ratios are exact decimals rounded half up with zero for an empty denominator", () => {
  assert.equal(ratio(0, 0), "0.0000");
  assert.equal(ratio(1, 3), "0.3333");
  assert.equal(ratio(2, 3), "0.6667");
  assert.equal(ratio(1, 2), "0.5000");
  assert.equal(ratio(5, 4), "1.2500");
  assert.equal(ratio(1, 16), "0.0625");
  assert.equal(ratio(1, 20000), "0.0001", "half-up at the fourth decimal");
  assert.equal(ratio(1, 40000), "0.0000", "below half rounds down");
});

test("day buckets are zero-filled across the whole range", () => {
  const days = ["2026-11-01", "2026-11-02", "2026-11-03"];
  assert.deepEqual(dayBuckets(days, new Map([["2026-11-02", 4]])), [
    { key: "2026-11-01", label: "2026-11-01", count: 0 },
    { key: "2026-11-02", label: "2026-11-02", count: 4 },
    { key: "2026-11-03", label: "2026-11-03", count: 0 },
  ]);
});

test("enumeration values become readable labels", () => {
  assert.equal(labelOf("AWAITING_PAYMENT"), "Awaiting payment");
  assert.equal(labelOf("ORGANIZER"), "Organizer");
  assert.equal(labelOf("TEAM_SEARCH"), "Team search");
});
