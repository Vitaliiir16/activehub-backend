// ActiveHub statistics query helpers: run a grouped count and shape it as chart buckets.
import type { PoolClient } from "pg";
import { dayBuckets, labelOf, type Bucket } from "./period";

type Row = { key: string; label?: string | null; count: string | number };

/** Grouped counts; the query selects key, optional label and count, already ordered. */
export async function buckets(client: PoolClient, sql: string, values: unknown[]): Promise<Bucket[]> {
  const rows = (await client.query<Row>(sql, values)).rows;
  return rows.map((row) => ({
    key: row.key,
    label: row.label ?? labelOf(row.key),
    count: Number(row.count),
  }));
}

/** Grouped counts by Kyiv day, zero-filled across the whole range. */
export async function bucketsWithDays(
  client: PoolClient,
  days: string[],
  sql: string,
  values: unknown[],
): Promise<Bucket[]> {
  const rows = (await client.query<Row>(sql, values)).rows;
  return dayBuckets(days, new Map(rows.map((row) => [row.key, Number(row.count)])));
}
