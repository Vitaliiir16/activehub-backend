// ActiveHub statistics periods: calendar days in Europe/Kyiv and exact decimal ratios.
import { invalid } from "../accounts/http";

export type Bucket = { key: string; label: string; count: number };
export type Range = { dateFrom: string; dateTo: string; days: string[] };
export const maxRangeDays = 366;

/** Calendar date (YYYY-MM-DD) of an instant in Europe/Kyiv. */
export const kyivDate = (at: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);

export function addDays(ymd: string, days: number) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
const spanDays = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1;
const listDays = (from: string, to: string) => {
  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  return days;
};

/** Inclusive Europe/Kyiv range. Presets end today; custom needs both dates and at most a year. */
export function resolveRange(
  input: { period?: string; dateFrom?: string; dateTo?: string },
  now = new Date(),
): Range {
  const today = kyivDate(now);
  if (input.period === "custom") {
    if (!input.dateFrom || !input.dateTo)
      invalid("dateFrom", "Choose both start and end dates for a custom period");
    if (input.dateFrom > input.dateTo) invalid("dateTo", "End date must follow start date");
    if (spanDays(input.dateFrom, input.dateTo) > maxRangeDays)
      invalid("dateTo", "Choose a period of at most one year");
    return { dateFrom: input.dateFrom, dateTo: input.dateTo, days: listDays(input.dateFrom, input.dateTo) };
  }
  if (input.dateFrom || input.dateTo)
    invalid("period", "Use period=custom to choose dates");
  const length = { "7d": 7, "30d": 30, "90d": 90 }[input.period ?? "30d"] ?? 30;
  const dateFrom = addDays(today, -(length - 1));
  return { dateFrom, dateTo: today, days: listDays(dateFrom, today) };
}

/** The current calendar month in Europe/Kyiv, first to last day. */
export function monthRange(now = new Date()): Range {
  const [y, m] = kyivDate(now).split("-").map(Number);
  const dateFrom = `${y}-${String(m).padStart(2, "0")}-01`;
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { dateFrom, dateTo: last, days: listDays(dateFrom, last) };
}

/** Fills every day of the range, so charts show zero days rather than gaps. */
export function dayBuckets(days: string[], counts: Map<string, number>): Bucket[] {
  return days.map((day) => ({ key: day, label: day, count: counts.get(day) ?? 0 }));
}

/** Readable label for an enumeration value, for example AWAITING_PAYMENT becomes Awaiting payment. */
export const labelOf = (value: string) => {
  const text = value.toLowerCase().replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/** numerator/denominator with four decimals, rounded half up; zero when the denominator is zero. */
export function ratio(numerator: number, denominator: number) {
  if (!denominator) return "0.0000";
  const n = BigInt(numerator), d = BigInt(denominator);
  const scaled = (n * 10000n * 2n + d) / (2n * d);
  const whole = scaled / 10000n, fraction = (scaled % 10000n).toString().padStart(4, "0");
  return `${whole}.${fraction}`;
}

/** SQL predicate for a timestamp column inside the inclusive Kyiv range bound to two placeholders. */
export const inKyivRange = (column: string, from: string, to: string) =>
  `(${column}>=(${from}::date::timestamp AT TIME ZONE 'Europe/Kyiv') AND ${column}<((${to}::date+1)::timestamp AT TIME ZONE 'Europe/Kyiv'))`;
